import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { jobNumbersEquivalent } from '../common/job-number-match.util';
import { ClearstoryContractComparisonService } from '../clearstory/clearstory-contract-comparison.service';
import {
  emptyFoundationMaps,
  loadFoundationJobCosts,
  pickFoundationCost,
} from './foundation-job-cost';
import { loadTrimbleBomByJob } from './trimble-bom';
import {
  ClearstoryCor,
  ClearstoryProject,
  Job,
  SitelineAgingContract,
  SitelineAgingSummary,
  SitelineContract,
  SitelinePayApp,
} from '../database/entities';
import { isClearstoryProjectActive, isSitelineContractActive } from '../siteline/siteline-active-contract.util';
import { loadAgingContractsFromLatestPerEntitySnapshots } from '../siteline/siteline-aging-snapshot.util';
import { sitelineLatestTotalValueToDollars } from '../siteline/siteline-contract-bill.util';
import {
  PF_COMPANIES,
  PF_COMPANY,
  PF_NOT_WIRED,
  PfJobRow,
  alertCounts,
  centsToDollars,
  emptyCost,
  foundationCompaniesForJob,
  pfBilling,
  pfBom,
  pfContract,
  pfJobKey,
  pfJobStatus,
  pfRecon,
  pickLatestPayApp,
  rollupSummary,
  sumSummary,
  withCashFlow,
} from './project-financials.util';

export type PfListFilters = {
  entityId?: number;
  pm?: string;
  search?: string;
  view?: 'active' | 'all';
  alert?: 'fix' | 'not_in_siteline' | 'any';
};

@Injectable()
export class ProjectFinancialsService {
  constructor(
    @InjectRepository(SitelineContract)
    private readonly contracts: Repository<SitelineContract>,
    @InjectRepository(SitelinePayApp)
    private readonly payApps: Repository<SitelinePayApp>,
    @InjectRepository(SitelineAgingSummary)
    private readonly agingSummaries: Repository<SitelineAgingSummary>,
    @InjectRepository(SitelineAgingContract)
    private readonly agingContracts: Repository<SitelineAgingContract>,
    @InjectRepository(ClearstoryProject)
    private readonly csProjects: Repository<ClearstoryProject>,
    @InjectRepository(ClearstoryCor)
    private readonly cors: Repository<ClearstoryCor>,
    @InjectRepository(Job)
    private readonly jobs: Repository<Job>,
    private readonly comparison: ClearstoryContractComparisonService,
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  private foundationDb(): string {
    return this.config.get<string>('WFS_FOUNDATION_DB', 'FoundationData') || 'FoundationData';
  }

  meta() {
    return {
      module: 'project-financials',
      companies: PF_COMPANIES,
      views: ['active', 'all'] as const,
      wired: [
        'siteline_contracts',
        'siteline_pay_apps',
        'siteline_aging',
        'clearstory_projects',
        'clearstory_cors',
        'ref_jobs',
        'foundation_job_history',
        'trimble_bom',
      ],
      notWired: [...PF_NOT_WIRED],
      message:
        'Awarded-job book: Siteline billing/AR + Clearstory COs + Foundation job-cost (LAB/MAT/SUB…). OH/net still Excel-only.',
    };
  }

  async filters() {
    const { jobs } = await this.buildJobs();
    const pms = [...new Set(jobs.map((j) => j.pm).filter((p): p is string => Boolean(p?.trim())))].sort(
      (a, b) => a.localeCompare(b),
    );
    return {
      companies: PF_COMPANIES,
      views: ['active', 'all'] as const,
      alerts: ['fix', 'not_in_siteline', 'any'] as const,
      pms,
    };
  }

  async listJobs(filters: PfListFilters = {}): Promise<{
    asOf: string;
    jobs: PfJobRow[];
    missing: string[];
    alerts: { fix: number; notInSiteline: number };
  }> {
    const { jobs, foundationOk, trimbleOk } = await this.buildJobs();
    const filtered = this.filterJobs(jobs, filters);
    filtered.sort((a, b) => a.jobNumber.localeCompare(b.jobNumber, undefined, { numeric: true }));
    const missing: string[] = [...PF_NOT_WIRED];
    if (!foundationOk) missing.unshift('foundation_job_cost');
    if (!trimbleOk) missing.unshift('trimble_bom');
    return {
      asOf: new Date().toISOString(),
      jobs: filtered,
      missing,
      alerts: alertCounts(filtered),
    };
  }

  async getJob(jobNumber: string): Promise<PfJobRow> {
    const { jobs } = await this.buildJobs();
    const hit = jobs.find((j) => jobNumbersEquivalent(j.jobNumber, jobNumber));
    if (!hit) throw new NotFoundException(`Job ${jobNumber} not found`);
    return hit;
  }

  async summary(filters: PfListFilters = {}) {
    const { asOf, jobs, missing, alerts } = await this.listJobs(filters);
    const rows = rollupSummary(jobs);
    return { asOf, rows, totals: sumSummary(rows), missing, alerts };
  }

  private filterJobs(jobs: PfJobRow[], filters: PfListFilters): PfJobRow[] {
    const view = filters.view === 'all' ? 'all' : 'active';
    const pm = filters.pm?.trim().toLowerCase();
    const search = filters.search?.trim().toLowerCase();
    const entityId = filters.entityId;
    const alert = filters.alert;

    return jobs.filter((j) => {
      if (view === 'active' && j.status !== 'active') return false;
      if (entityId != null && j.entityId !== entityId) return false;
      if (pm && !(j.pm ?? '').toLowerCase().includes(pm)) return false;
      if (alert === 'fix' && j.recon.sitelineClearstory !== 'fix') return false;
      if (alert === 'not_in_siteline' && j.recon.sitelineClearstory !== 'not_in_siteline') return false;
      if (alert === 'any' && j.recon.alerts.length === 0) return false;
      if (search) {
        const hay = [j.jobNumber, j.name, j.customer, j.pm, j.company]
          .map((v) => (v ?? '').toLowerCase())
          .join(' ');
        if (!hay.includes(search)) return false;
      }
      return true;
    });
  }

  private async buildJobs(): Promise<{ jobs: PfJobRow[]; foundationOk: boolean; trimbleOk: boolean }> {
    const [contracts, payApps, agingRows, projects, cors, refJobs, foundation, trimble] = await Promise.all([
      this.contracts.find(),
      this.payApps.find(),
      loadAgingContractsFromLatestPerEntitySnapshots(this.agingSummaries, this.agingContracts),
      this.csProjects.find(),
      this.cors.find(),
      this.jobs.find(),
      loadFoundationJobCosts(this.dataSource, this.foundationDb()).catch(() => emptyFoundationMaps()),
      loadTrimbleBomByJob(this.dataSource),
    ]);

    const payByContract = new Map<string, SitelinePayApp[]>();
    for (const pa of payApps) {
      const list = payByContract.get(pa.contractId) ?? [];
      list.push(pa);
      payByContract.set(pa.contractId, list);
    }

    const agingByJob = new Map<string, SitelineAgingContract>();
    for (const row of agingRows) {
      const key = pfJobKey(row.internalProjectNumber) ?? pfJobKey(row.projectNumber);
      if (key && !agingByJob.has(key)) agingByJob.set(key, row);
    }

    const slByJob = new Map<string, SitelineContract[]>();
    for (const c of contracts) {
      const key = pfJobKey(c.internalProjectNumber) ?? pfJobKey(c.projectNumber);
      if (!key) continue;
      const list = slByJob.get(key) ?? [];
      list.push(c);
      slByJob.set(key, list);
    }

    const corsByProject = new Map<number, ClearstoryCor[]>();
    for (const cor of cors) {
      if (cor.projectId == null) continue;
      const list = corsByProject.get(cor.projectId) ?? [];
      list.push(cor);
      corsByProject.set(cor.projectId, list);
    }

    const csByJob = new Map<string, ClearstoryProject[]>();
    for (const p of projects) {
      const key = pfJobKey(p.jobNumber);
      if (!key) continue;
      const list = csByJob.get(key) ?? [];
      list.push(p);
      csByJob.set(key, list);
    }

    const refByJob = new Map<string, Job>();
    for (const j of refJobs) {
      const key = pfJobKey(j.jobNumber);
      if (key && !refByJob.has(key)) refByJob.set(key, j);
    }

    const keys = new Set<string>([...slByJob.keys(), ...csByJob.keys(), ...trimble.byJob.keys()]);
    const out: PfJobRow[] = [];

    for (const key of keys) {
      const slList = slByJob.get(key) ?? [];
      const activeSl = slList.filter((c) => isSitelineContractActive(c.status));
      const slPool = activeSl.length ? activeSl : slList;
      const csPool = csByJob.get(key) ?? [];
      const cs = this.pickClearstory(csPool);
      const ref = refByJob.get(key) ?? null;
      const aging = agingByJob.get(key) ?? null;

      const hasSl = slList.length > 0;
      const hasCs = cs != null && isClearstoryProjectActive(cs.archived);
      const slActive = activeSl.length > 0;

      const csSum = cs
        ? this.comparison.summarizeCors(cs, corsByProject.get(cs.id) ?? [])
        : null;

      const sitelineTotal = slPool.length
        ? slPool.reduce((s, c) => s + (sitelineLatestTotalValueToDollars(c.latestTotalValue) ?? 0), 0)
        : null;
      const siteline = sitelineTotal != null && slPool.length ? Math.round(sitelineTotal * 100) / 100 : null;

      const latestApps = slPool
        .map((c) => pickLatestPayApp(payByContract.get(c.id) ?? []))
        .filter((pa): pa is SitelinePayApp => pa != null);
      const billed = latestApps.reduce((s, pa) => s + centsToDollars(pa.billed), 0);
      const retainage = latestApps.reduce((s, pa) => s + centsToDollars(pa.retention), 0);
      const pcts = slPool.map((c) => Number(c.percentComplete)).filter((n) => Number.isFinite(n));
      const percentComplete = pcts.length ? Math.max(...pcts) : null;

      const lead = slPool.find((c) => c.leadPmName) ?? slPool[0] ?? null;
      const entityId =
        slPool.find((c) => c.entityId != null)?.entityId ??
        aging?.entityId ??
        ref?.entityId ??
        null;
      const rawCost = pickFoundationCost(foundation, entityId, key);

      const contract = pfContract({
        amount: csSum?.originalContractValue ?? 0,
        approvedCos: csSum?.totalApprovedCoIssued ?? 0,
        atp: csSum?.totalApprovedToProceed ?? 0,
        inReview: csSum?.totalInReview ?? 0,
        placeholder: csSum?.totalPlaceholder ?? 0,
        siteline,
      });
      const billing = pfBilling({
        billed,
        retainage,
        ar: aging ? centsToDollars(aging.amountAgedTotal) : 0,
        percentComplete,
        siteline,
        revised: contract.revised,
      });
      const recon = pfRecon({
        revised: contract.revised,
        siteline,
        billed,
        costTotal: rawCost ? rawCost.total : null,
      });
      const trimRollup = trimble.byJob.get(key) ?? null;
      const bom = pfBom({
        companies: foundationCompaniesForJob(foundation.byEntityJob, key),
        contractAmount: contract.amount,
        approvedCos: contract.approvedCos,
        completionPct: billing.pctBilled,
        trimble: trimRollup,
      });

      const jobNumber =
        lead?.internalProjectNumber?.trim() ||
        cs?.jobNumber?.trim() ||
        lead?.projectNumber?.trim() ||
        key;

      out.push({
        jobNumber,
        name: cs?.name ?? lead?.projectName ?? ref?.name ?? null,
        customer: cs?.customerName ?? null,
        city: cs?.siteCity ?? ref?.city ?? null,
        state: cs?.siteState ?? null,
        entityId,
        company: entityId != null ? (PF_COMPANY[entityId] ?? null) : null,
        pm: lead?.leadPmName ?? aging?.leadPmName ?? null,
        pmEmail: lead?.leadPmEmail ?? aging?.leadPmEmail ?? null,
        status: pfJobStatus(hasSl, slActive, hasCs),
        contract,
        billing,
        cost: rawCost ? withCashFlow(rawCost, billed) : emptyCost(),
        recon,
        bom,
        sources: {
          siteline: hasSl,
          clearstory: cs != null,
          refJob: ref != null,
          foundation: rawCost != null,
          trimble: trimRollup != null,
        },
      });
    }

    return { jobs: out, foundationOk: foundation.ok, trimbleOk: trimble.ok };
  }

  private pickClearstory(pool: ClearstoryProject[]): ClearstoryProject | null {
    if (!pool.length) return null;
    const active = pool.filter((p) => isClearstoryProjectActive(p.archived));
    const pick = active.length ? active : pool;
    return [...pick].sort(
      (a, b) => (b.lastSyncedAt?.getTime() ?? 0) - (a.lastSyncedAt?.getTime() ?? 0),
    )[0];
  }
}
