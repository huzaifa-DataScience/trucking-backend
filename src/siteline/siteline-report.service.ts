import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  SitelineContract,
  SitelinePayApp,
  SitelineAgingSummary,
  SitelineAgingContract,
} from '../database/entities';
import { SitelineService } from './siteline.service';

const MS_PER_DAY = 1000 * 60 * 60 * 24;

const AGING_BUCKETS = [
  'Current',
  '1-30 Days',
  '31-60 Days',
  '61-90 Days',
  '91-120 Days',
  '>120 Days',
] as const;

export interface SitelineAgingFilters {
  /**
   * Optional report window (YYYY-MM-DD). Compared to `sitelineDashboardRange` on the response;
   * data is still read from DB (last sync). Sync uses the same default window as when these are omitted.
   */
  startDate?: string;
  endDate?: string;
  /**
   * Case-insensitive substring match against:
   * - projectName, projectNumber, internalProjectNumber
   * - leadPmName, leadPmEmail
   */
  search?: string;
  /** If true, exclude non-overdue items (daysPastDue <= 0). */
  overdueOnly?: boolean;
  /**
   * Minimum days past due (inclusive) when filtering pay-app rows.
   * On `GET /siteline/aging-overdue`, when omitted, defaults to **51** so results match the legacy
   * “greater than 50 days” rule (`daysPastDue >= 51` for whole-day counts). Pass e.g. `10` or `23`
   * to require at least that many days past due.
   */
  minDaysPastDue?: number;
  /** Maximum days past due (inclusive). */
  maxDaysPastDue?: number;
  /** Minimum net dollars (inclusive). */
  minNetDollars?: number;
  /** Maximum net dollars (inclusive). */
  maxNetDollars?: number;
  /** Allowed statuses (exact match). */
  includeStatuses?: string[];
  /** Blocked statuses (exact match). */
  excludeStatuses?: string[];
  /**
   * When true (default), bucket amounts come from `Siteline_AgingContracts` (latest snapshot, filled on sync).
   * When false, recomputes buckets from synced pay apps (legacy; can diverge from Siteline UI).
   */
  useSitelineDashboard?: boolean;
}

function getBucket(daysPastDue: number): (typeof AGING_BUCKETS)[number] {
  if (daysPastDue <= 0) return 'Current';
  if (daysPastDue <= 30) return '1-30 Days';
  if (daysPastDue <= 60) return '31-60 Days';
  if (daysPastDue <= 90) return '61-90 Days';
  if (daysPastDue <= 120) return '91-120 Days';
  return '>120 Days';
}

function normalizeStatus(s: string | null | undefined): string | null {
  if (!s) return null;
  const t = s.trim();
  return t.length ? t : null;
}

function includesNormalized(haystack: string | null | undefined, needle: string): boolean {
  if (!haystack) return false;
  return haystack.toLowerCase().includes(needle);
}

export interface AgingReportRow {
  /** Siteline contract id when row comes from `agingDashboard`. */
  contractId?: string;
  projectName: string;
  /** Optional: primary PM name for this project (from contributing contracts). */
  leadPmName?: string | null;
  /** Optional: primary PM email for this project (from contributing contracts). */
  leadPmEmail?: string | null;
  /** Invoice/Pay App number (max/latest seen for this project), when available. */
  invoiceNumber?: number | null;
  /** Billing period start from Siteline (`StartDate`); shown as invoice date in the UI. */
  invoiceDate?: string | null;
  buckets: Record<(typeof AGING_BUCKETS)[number], number>;
  projectTotal: number;
}

export interface AgingReportResponse {
  buckets: readonly string[];
  rows: AgingReportRow[];
  totals: Record<(typeof AGING_BUCKETS)[number], number> & { projectTotal: number };
  /** Bucket amounts match Siteline: from `Siteline_AgingContracts`, or local pay-app math when `local_pay_apps`. */
  source?: 'siteline' | 'local_pay_apps';
  /** Date range from the latest `Siteline_AgingSummary` row. */
  sitelineDashboardRange?: { startDate: string; endDate: string };
  /** ISO time from latest `Siteline_AgingSummary.CreatedAt`. */
  lastAgingBreakdownSync?: string | null;
  /** False if `startDate`/`endDate` were sent and differ from `sitelineDashboardRange`. */
  requestedRangeMatchesCache?: boolean;
}

export interface AgingOverdueRow {
  contractId: string;
  projectName: string | null;
  projectNumber: string | null;
  internalProjectNumber: string | null;
  companyId: string | null;
  leadPmName: string | null;
  leadPmEmail: string | null;
  /** Invoice/Pay App number from Siteline (payAppNumber). */
  invoiceNumber: number | null;
  /** Billing period start (`StartDate`); UI label: invoice date. */
  invoiceDate: string | null;
  dueDate: string | null;
  daysPastDue: number;
  netDollars: number;
  status: string | null;
}

export interface AgingOverdueResponse {
  items: AgingOverdueRow[];
}

export type SitelineAgingDebugRow = {
  payAppId: string;
  contractId: string;
  internalProjectNumber: string | null;
  projectName: string | null;
  payAppNumber: number | null;
  status: string | null;
  billedCents: number;
  retentionCents: number;
  netDollars: number;
  startDate: string | null;
  endDate: string | null;
  dueDate: string | null;
  daysPastDueByDueDate: number;
  bucketByDueDate: (typeof AGING_BUCKETS)[number];
  daysSinceBillingEnd: number;
  bucketByBillingEnd: (typeof AGING_BUCKETS)[number];
};

function defaultAgingDashboardDateRange(): { startDate: string; endDate: string } {
  const today = new Date();
  const endDate = today.toISOString().slice(0, 10);
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const startDate = start.toISOString().slice(0, 10);
  return { startDate, endDate };
}

function centsToDollars(n: unknown): number {
  const v = Number(n ?? 0);
  return Number.isFinite(v) ? v / 100 : 0;
}

/**
 * Maps Siteline `AgingBreakdown` cents fields into our column labels.
 * Any remainder vs `amountAgedTotal` goes to `>120 Days` so totals stay consistent.
 */
function bucketsFromSitelineAgingBreakdown(ab: Record<string, unknown> | null | undefined): Record<
  (typeof AGING_BUCKETS)[number],
  number
> {
  const cur = centsToDollars(ab?.amountAgedCurrent);
  const d30 = centsToDollars(ab?.amountAged30Days);
  const d60 = centsToDollars(ab?.amountAged60Days);
  const d90 = centsToDollars(ab?.amountAged90Days);
  const d120 = centsToDollars(ab?.amountAged120Days);
  const total = centsToDollars(ab?.amountAgedTotal);
  // Siteline semantics:
  // - amountAgedCurrent: 0..30
  // - amountAged30Days: 31..60
  // - amountAged60Days: 61..90
  // - amountAged90Days: 91..120
  // - amountAged120Days: >120
  // Siteline does not provide a distinct "1-30" range bucket separate from "Current".
  const sumKnown = cur + d30 + d60 + d90 + d120;
  return {
    Current: cur,
    '1-30 Days': 0,
    '31-60 Days': d30,
    '61-90 Days': d60,
    '91-120 Days': d90,
    '>120 Days': d120,
  };
}

@Injectable()
export class SitelineReportService {
  private readonly logger = new Logger(SitelineReportService.name);

  constructor(
    @InjectRepository(SitelinePayApp)
    private readonly payAppRepo: Repository<SitelinePayApp>,
    @InjectRepository(SitelineContract)
    private readonly contractRepo: Repository<SitelineContract>,
    @InjectRepository(SitelineAgingSummary)
    private readonly agingSummaryRepo: Repository<SitelineAgingSummary>,
    @InjectRepository(SitelineAgingContract)
    private readonly agingContractRepo: Repository<SitelineAgingContract>,
    private readonly siteline: SitelineService,
  ) {}

  /**
   * Debug endpoint helper: for a given internalProjectNumber (e.g. "24037"),
   * show how our DB fields map into daysPastDue buckets.
   *
   * This is used to verify whether Siteline's "agingDashboard" uses the same
   * basis as our report (we currently bucket by payAppDueDate stored in DB).
   */
  async debugAgingByInternalProjectNumber(
    internalProjectNumber: string,
  ): Promise<{ today: string; rows: SitelineAgingDebugRow[] }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const payApps = await this.payAppRepo
      .createQueryBuilder('pa')
      .innerJoinAndSelect('pa.contract', 'c')
      .where('c.internalProjectNumber = :n', { n: internalProjectNumber })
      .getMany();

    const rows: SitelineAgingDebugRow[] = payApps.map((pa) => {
      const contract: any = (pa as any).contract;
      const billedCents = Number(pa.billed ?? 0);
      const retentionCents = Number(pa.retention ?? 0);
      const netDollars = (billedCents - retentionCents) / 100;

      const due = pa.dueDate ? new Date(pa.dueDate) : null;
      const end = pa.endDate ? new Date(pa.endDate) : null;

      const daysPastDueByDueDate = due
        ? Math.floor((today.getTime() - due.getTime()) / MS_PER_DAY)
        : 0;

      const daysSinceBillingEnd = end
        ? Math.floor((today.getTime() - end.getTime()) / MS_PER_DAY)
        : 0;

      return {
        payAppId: pa.id,
        contractId: contract?.id ?? pa.contractId,
        internalProjectNumber: contract?.internalProjectNumber ?? null,
        projectName: contract?.projectName ?? null,
        payAppNumber: pa.number ?? null,
        status: pa.status ?? null,
        billedCents,
        retentionCents,
        netDollars,
        startDate: pa.startDate ? new Date(pa.startDate).toISOString() : null,
        endDate: pa.endDate ? new Date(pa.endDate).toISOString() : null,
        dueDate: pa.dueDate ? new Date(pa.dueDate).toISOString() : null,
        daysPastDueByDueDate,
        bucketByDueDate: getBucket(daysPastDueByDueDate),
        daysSinceBillingEnd,
        bucketByBillingEnd: getBucket(daysSinceBillingEnd),
      };
    });

    rows.sort((a, b) => (b.payAppNumber ?? 0) - (a.payAppNumber ?? 0));
    return { today: today.toISOString(), rows };
  }

  /**
   * Aging report: default reads **`Siteline_AgingContracts` / `Siteline_AgingSummary`** — the same rows
   * the Siteline sync cron fills from `agingDashboard` (no per-request Siteline call).
   * Optional `useSitelineDashboard=false` recomputes from synced pay apps (legacy / debugging).
   */
  async getAgingReport(filters: SitelineAgingFilters = {}): Promise<AgingReportResponse> {
    const useCachedSiteline = filters.useSitelineDashboard !== false;
    if (useCachedSiteline) {
      return this.getAgingReportFromCachedSitelineBreakdown(filters);
    }
    return this.getAgingReportFromLocalPayApps(filters);
  }

  private async getAgingReportFromCachedSitelineBreakdown(
    filters: SitelineAgingFilters,
  ): Promise<AgingReportResponse> {
    type BucketKey = (typeof AGING_BUCKETS)[number];

    const defaultRange = defaultAgingDashboardDateRange();
    const requestedStart = (filters.startDate ?? '').trim() || defaultRange.startDate;
    const requestedEnd = (filters.endDate ?? '').trim() || defaultRange.endDate;

    const latestRows = await this.agingSummaryRepo.find({
      order: { id: 'DESC' },
      take: 1,
    });
    const latest = latestRows[0] ?? null;

    const emptyTotals = (): Record<BucketKey, number> & { projectTotal: number } => ({
      Current: 0,
      '1-30 Days': 0,
      '31-60 Days': 0,
      '61-90 Days': 0,
      '91-120 Days': 0,
      '>120 Days': 0,
      projectTotal: 0,
    });

    if (!latest) {
      return {
        buckets: [...AGING_BUCKETS],
        rows: [],
        totals: emptyTotals(),
        source: 'siteline',
        sitelineDashboardRange: undefined,
        lastAgingBreakdownSync: null,
        requestedRangeMatchesCache: true,
      };
    }

    const cachedStart = latest.startDate ?? null;
    const cachedEnd = latest.endDate ?? null;
    const sitelineDashboardRange =
      cachedStart && cachedEnd ? { startDate: cachedStart, endDate: cachedEnd } : undefined;
    const requestedRangeMatchesCache =
      !sitelineDashboardRange ||
      (requestedStart === sitelineDashboardRange.startDate &&
        requestedEnd === sitelineDashboardRange.endDate);

    const snapRows = await this.agingContractRepo.find({
      where: { snapshotId: latest.id },
    });

    const search = (filters.search ?? '').trim().toLowerCase();
    const draftRows: AgingReportRow[] = [];

    for (const row of snapRows) {
      const buckets = bucketsFromSitelineAgingBreakdown({
        amountAgedTotal: row.amountAgedTotal,
        amountAgedCurrent: row.amountAgedCurrent,
        amountAged30Days: row.amountAged30Days,
        amountAged60Days: row.amountAged60Days,
        amountAged90Days: row.amountAged90Days,
        amountAged120Days: row.amountAged120Days,
      });
      const projectTotal = AGING_BUCKETS.reduce((sum, k) => sum + buckets[k], 0);
      if (projectTotal <= 0) continue;

      const projectName: string =
        (row.projectName && String(row.projectName).trim()) ||
        row.internalProjectNumber ||
        row.contractId;

      const leadPmName = row.leadPmName ?? null;
      const leadPmEmail = row.leadPmEmail ?? null;

      if (search) {
        const matches =
          includesNormalized(projectName, search) ||
          includesNormalized(row.projectNumber ?? null, search) ||
          includesNormalized(row.internalProjectNumber ?? null, search) ||
          includesNormalized(leadPmName, search) ||
          includesNormalized(leadPmEmail, search);
        if (!matches) continue;
      }

      draftRows.push({
        contractId: row.contractId,
        projectName,
        leadPmName,
        leadPmEmail,
        invoiceNumber: null,
        buckets: { ...buckets },
        projectTotal,
      });
    }

    draftRows.sort((a, b) => b.projectTotal - a.projectTotal);

    const contractIds = draftRows.map((r) => r.contractId).filter(Boolean) as string[];
    const invoiceByContract = await this.maxPayAppInvoiceDisplayByContractId(contractIds);
    for (const r of draftRows) {
      const inv = r.contractId ? invoiceByContract.get(r.contractId) : undefined;
      if (inv) {
        r.invoiceNumber = inv.number;
        r.invoiceDate = inv.startDate ? new Date(inv.startDate).toISOString() : null;
      }
    }

    const totals = emptyTotals();
    for (const r of draftRows) {
      for (const b of AGING_BUCKETS) totals[b] += r.buckets[b];
      totals.projectTotal += r.projectTotal;
    }

    return {
      buckets: [...AGING_BUCKETS],
      rows: draftRows,
      totals,
      source: 'siteline',
      sitelineDashboardRange,
      lastAgingBreakdownSync: latest.createdAt ? latest.createdAt.toISOString() : null,
      requestedRangeMatchesCache,
    };
  }

  /**
   * Latest non-PAID/DRAFT pay app per contract (display hint only; buckets are from Siteline).
   * Returns pay app number and `StartDate` for that row.
   */
  private async maxPayAppInvoiceDisplayByContractId(
    contractIds: string[],
  ): Promise<Map<string, { number: number; startDate: Date | null }>> {
    const out = new Map<string, { number: number; startDate: Date | null }>();
    if (!contractIds.length) return out;
    const apps = await this.payAppRepo.find({
      where: { contractId: In(contractIds) },
      select: ['contractId', 'number', 'startDate', 'status'],
    });
    for (const pa of apps) {
      if (pa.status === 'PAID' || pa.status === 'DRAFT') continue;
      if (typeof pa.number !== 'number' || !Number.isFinite(pa.number)) continue;
      const cur = out.get(pa.contractId);
      if (!cur || pa.number > cur.number) {
        out.set(pa.contractId, { number: pa.number, startDate: pa.startDate ?? null });
      }
    }
    return out;
  }

  private async getAgingReportFromLocalPayApps(
    filters: SitelineAgingFilters,
  ): Promise<AgingReportResponse> {
    const payApps = await this.payAppRepo.find({
      relations: ['contract'],
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    type BucketKey = (typeof AGING_BUCKETS)[number];
    const pivot = new Map<string, Record<BucketKey, number>>();
    const projectTotals = new Map<string, number>();
    const projectPmName = new Map<string, string | null>();
    const projectPmEmail = new Map<string, string | null>();
    const projectInvoiceNumber = new Map<string, number | null>();
    const projectInvoiceDate = new Map<string, string | null>();

    const search = (filters.search ?? '').trim().toLowerCase();
    const includeStatuses =
      filters.includeStatuses?.map((s) => s.trim()).filter(Boolean) ?? undefined;
    const excludeStatuses =
      filters.excludeStatuses?.map((s) => s.trim()).filter(Boolean) ?? undefined;

    for (const pa of payApps) {
      if (pa.status === 'PAID') continue;

      const contract = pa.contract;
      if (!contract) continue;

      const key = contract.projectName ?? contract.projectNumber ?? contract.id;

      const billed = Number(pa.billed ?? 0);
      const retention = Number(pa.retention ?? 0);
      const netDollars = (billed - retention) / 100;

      // Siteline aging dashboard buckets align with billing period end date.
      // Fall back to due date only when billing end is missing.
      const anchorDate = pa.endDate ? new Date(pa.endDate) : pa.dueDate ? new Date(pa.dueDate) : null;
      const daysPastDue = anchorDate
        ? Math.floor((today.getTime() - anchorDate.getTime()) / MS_PER_DAY)
        : 0;
      // Match Siteline: exclude future-cycle items from aging totals.
      if (daysPastDue < 0) continue;

      const status = normalizeStatus(pa.status);
      if (filters.overdueOnly && daysPastDue <= 0) continue;
      if (typeof filters.minDaysPastDue === 'number' && daysPastDue < filters.minDaysPastDue)
        continue;
      if (typeof filters.maxDaysPastDue === 'number' && daysPastDue > filters.maxDaysPastDue)
        continue;
      if (typeof filters.minNetDollars === 'number' && netDollars < filters.minNetDollars)
        continue;
      if (typeof filters.maxNetDollars === 'number' && netDollars > filters.maxNetDollars)
        continue;
      if (includeStatuses && includeStatuses.length) {
        if (!status || !includeStatuses.includes(status)) continue;
      }
      if (excludeStatuses && excludeStatuses.length) {
        if (status && excludeStatuses.includes(status)) continue;
      }

      if (search) {
        const cAny = contract as any;
        const pmName: string | null = cAny.leadPmName ?? null;
        const pmEmail: string | null = cAny.leadPmEmail ?? null;
        const matches =
          includesNormalized(contract.projectName ?? null, search) ||
          includesNormalized(contract.projectNumber ?? null, search) ||
          includesNormalized(contract.internalProjectNumber ?? null, search) ||
          includesNormalized(pmName, search) ||
          includesNormalized(pmEmail, search);
        if (!matches) continue;
      }

      const bucket = getBucket(daysPastDue);
      if (!pivot.has(key)) {
        pivot.set(key, {
          Current: 0,
          '1-30 Days': 0,
          '31-60 Days': 0,
          '61-90 Days': 0,
          '91-120 Days': 0,
          '>120 Days': 0,
        });
      }
      const row = pivot.get(key)!;
      row[bucket] += netDollars;
      projectTotals.set(key, (projectTotals.get(key) ?? 0) + netDollars);

      if (typeof pa.number === 'number') {
        const current = projectInvoiceNumber.get(key);
        if (current === undefined || current === null || pa.number > current) {
          projectInvoiceNumber.set(key, pa.number);
          projectInvoiceDate.set(
            key,
            pa.startDate ? new Date(pa.startDate).toISOString() : null,
          );
        }
      }

      const existingPmName = projectPmName.get(key);
      const existingPmEmail = projectPmEmail.get(key);
      if (!existingPmName && !existingPmEmail) {
        const cAny = contract as any;
        const pmName: string | null = cAny.leadPmName ?? null;
        const pmEmail: string | null = cAny.leadPmEmail ?? null;
        if (pmName || pmEmail) {
          projectPmName.set(key, pmName ?? null);
          projectPmEmail.set(key, pmEmail ?? null);
        }
      }
    }

    const totals: Record<BucketKey, number> & { projectTotal: number } = {
      Current: 0,
      '1-30 Days': 0,
      '31-60 Days': 0,
      '61-90 Days': 0,
      '91-120 Days': 0,
      '>120 Days': 0,
      projectTotal: 0,
    };

    const rows: AgingReportRow[] = [];
    const sortedProjects = [...pivot.keys()].sort((a, b) => {
      const totalA = projectTotals.get(a) ?? 0;
      const totalB = projectTotals.get(b) ?? 0;
      return totalB - totalA;
    });

    for (const projectName of sortedProjects) {
      const buckets = pivot.get(projectName)!;
      const projectTotal = projectTotals.get(projectName) ?? 0;
      rows.push({
        projectName,
        leadPmName: projectPmName.get(projectName) ?? null,
        leadPmEmail: projectPmEmail.get(projectName) ?? null,
        invoiceNumber: projectInvoiceNumber.get(projectName) ?? null,
        invoiceDate: projectInvoiceDate.get(projectName) ?? null,
        buckets: { ...buckets },
        projectTotal,
      });
      for (const b of AGING_BUCKETS) totals[b] += buckets[b];
      totals.projectTotal += projectTotal;
    }

    return {
      buckets: [...AGING_BUCKETS],
      rows,
      totals,
      source: 'local_pay_apps',
    };
  }

  /**
   * Overdue aging view: pay apps at least N days past due (default N=51 → legacy >50 days) with net > 0.
   * Based on synced Siteline_PayApps + Siteline_Contracts, reusing the same
   * net dollars and days-past-due calculations as the main aging report.
   */
  async getOverdueOver50(filters: SitelineAgingFilters = {}): Promise<AgingOverdueResponse> {
    const payApps = await this.payAppRepo.find({
      relations: ['contract'],
    });

    const minDaysRequired =
      typeof filters.minDaysPastDue === 'number' && Number.isFinite(filters.minDaysPastDue)
        ? Math.max(0, Math.floor(filters.minDaysPastDue))
        : 51;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const items: AgingOverdueRow[] = [];
    const pmCache = new Map<string, { name: string | null; email: string | null }>();

    const search = (filters.search ?? '').trim().toLowerCase();
    const includeStatuses =
      filters.includeStatuses?.map((s) => s.trim()).filter(Boolean) ?? undefined;
    const excludeStatuses =
      filters.excludeStatuses?.map((s) => s.trim()).filter(Boolean) ?? undefined;

    for (const pa of payApps) {
      // Skip explicitly paid/draft items, but allow null/other statuses through.
      if (pa.status === 'PAID' || pa.status === 'DRAFT') continue;

      const contract = pa.contract;
      if (!contract) continue;

      const billed = Number(pa.billed ?? 0);
      const retention = Number(pa.retention ?? 0);
      const netDollars = (billed - retention) / 100;

      const dueDate = pa.dueDate ? new Date(pa.dueDate) : null;
      const daysPastDue = dueDate
        ? Math.floor((today.getTime() - dueDate.getTime()) / MS_PER_DAY)
        : 0;

      if (daysPastDue < minDaysRequired) continue;
      if (netDollars <= 0) continue;

      const status = normalizeStatus(pa.status);
      if (filters.overdueOnly && daysPastDue <= 0) continue;
      if (typeof filters.maxDaysPastDue === 'number' && daysPastDue > filters.maxDaysPastDue)
        continue;
      if (typeof filters.minNetDollars === 'number' && netDollars < filters.minNetDollars)
        continue;
      if (typeof filters.maxNetDollars === 'number' && netDollars > filters.maxNetDollars)
        continue;
      if (includeStatuses && includeStatuses.length) {
        if (!status || !includeStatuses.includes(status)) continue;
      }
      if (excludeStatuses && excludeStatuses.length) {
        if (status && excludeStatuses.includes(status)) continue;
      }

      // Try DB-cached PM first
      let leadPmName: string | null = (contract as any).leadPmName ?? null;
      let leadPmEmail: string | null = (contract as any).leadPmEmail ?? null;

      // If still missing, fetch from Siteline aging data once per contract
      if (!leadPmName && !leadPmEmail) {
        let cached = pmCache.get(contract.id);
        if (!cached) {
          try {
            const detail = (await this.siteline.getContract(contract.id)) as any;
            const primaryPm = detail?.leadPMs?.[0];
            const first = primaryPm?.firstName ?? '';
            const last = primaryPm?.lastName ?? '';
            const fullName = `${first} ${last}`.trim() || null;
            const email = primaryPm?.email ?? null;
            cached = { name: fullName, email };
          } catch {
            cached = { name: null, email: null };
          }
          pmCache.set(contract.id, cached);
        }
        leadPmName = cached.name;
        leadPmEmail = cached.email;
      }

      if (search) {
        const matches =
          includesNormalized(contract.projectName ?? null, search) ||
          includesNormalized(contract.projectNumber ?? null, search) ||
          includesNormalized(contract.internalProjectNumber ?? null, search) ||
          includesNormalized(leadPmName, search) ||
          includesNormalized(leadPmEmail, search);
        if (!matches) continue;
      }

      items.push({
        contractId: contract.id,
        projectName: contract.projectName ?? null,
        projectNumber: contract.projectNumber ?? null,
        internalProjectNumber: contract.internalProjectNumber ?? null,
        companyId: null, // Siteline company id is not stored on contract entity today
        leadPmName,
        leadPmEmail,
        invoiceNumber: pa.number ?? null,
        invoiceDate: pa.startDate ? new Date(pa.startDate).toISOString() : null,
        dueDate: dueDate ? dueDate.toISOString() : null,
        daysPastDue,
        netDollars,
        status: pa.status ?? null,
      });
    }

    return { items };
  }
}
