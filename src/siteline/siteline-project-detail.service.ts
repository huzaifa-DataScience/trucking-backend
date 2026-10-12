import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  ClearstoryCor,
  ClearstoryProject,
  SitelineAgingContract,
  SitelineContract,
  SitelinePayApp,
} from '../database/entities';

/** Siteline stores money in cents (bigint, sometimes returned as string). */
function cents(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n / 100 : null;
}

/** Clearstory amounts are dollars (decimal, sometimes returned as string). */
function dollars(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const iso = (d: Date | null | undefined): string | null => d?.toISOString?.() ?? null;

/** Job numbers can be zero-padded in one system and not the other ("09838" vs "9838"). */
function jobNumberVariants(raw: string | null | undefined): string[] {
  const s = (raw ?? '').trim();
  if (!s) return [];
  const bare = s.replace(/^0+(?=\d)/, '');
  return [...new Set([s, bare, bare.padStart(5, '0')])];
}

export type ProjectDetailPayApp = {
  id: string;
  number: number | null;
  status: string | null;
  billed: number | null;
  retention: number | null;
  /** billed − retention: what the GC owes on this pay app. */
  amountDue: number | null;
  periodStart: string | null;
  periodEnd: string | null;
  dueDate: string | null;
};

export type ProjectDetailCor = {
  id: string;
  corNumber: string | null;
  title: string | null;
  status: string | null;
  requestedAmount: number | null;
  dateSubmitted: string | null;
  daysInReview: number | null;
};

export type SitelineProjectDetail = {
  contract: {
    id: string;
    entityId: number | null;
    projectName: string | null;
    internalProjectNumber: string | null;
    contractNumber: string | null;
    billingType: string | null;
    status: string | null;
    percentComplete: number | null;
    contractValue: number | null;
    leadPmName: string | null;
    leadPmEmail: string | null;
    lastSyncedAt: string | null;
  };
  averageDaysToPaid: number | null;
  payApps: ProjectDetailPayApp[];
  clearstory: {
    projectId: number;
    name: string | null;
    customerName: string | null;
    baseContractValue: number | null;
    cors: ProjectDetailCor[];
  } | null;
};

/**
 * One project's billing picture, read from synced tables only (no live Siteline/Clearstory calls):
 * Siteline contract + pay apps + latest aging row, and the Clearstory project matched by job number.
 */
@Injectable()
export class SitelineProjectDetailService {
  constructor(
    @InjectRepository(SitelineContract) private readonly contracts: Repository<SitelineContract>,
    @InjectRepository(SitelinePayApp) private readonly payApps: Repository<SitelinePayApp>,
    @InjectRepository(SitelineAgingContract) private readonly aging: Repository<SitelineAgingContract>,
    @InjectRepository(ClearstoryProject) private readonly csProjects: Repository<ClearstoryProject>,
    @InjectRepository(ClearstoryCor) private readonly csCors: Repository<ClearstoryCor>,
  ) {}

  async getDetail(contractId: string): Promise<SitelineProjectDetail> {
    const c = await this.contracts.findOne({ where: { id: contractId } });
    if (!c) throw new NotFoundException('No synced Siteline contract with that id.');

    const [apps, agingRow] = await Promise.all([
      this.payApps.find({ where: { contractId }, order: { number: 'DESC' } }),
      this.aging.findOne({ where: { contractId }, order: { snapshotId: 'DESC' } }),
    ]);

    const jobs = jobNumberVariants(c.internalProjectNumber);
    const project = jobs.length
      ? await this.csProjects.findOne({ where: { jobNumber: In(jobs) }, order: { updatedAt: 'DESC' } })
      : null;
    const cors = project
      ? await this.csCors.find({ where: { projectId: project.id }, order: { dateSubmitted: 'DESC' } })
      : [];

    return {
      contract: {
        id: c.id,
        entityId: c.entityId ?? null,
        projectName: c.projectName ?? null,
        internalProjectNumber: c.internalProjectNumber ?? null,
        contractNumber: c.contractNumber ?? null,
        billingType: c.billingType ?? null,
        status: c.status ?? null,
        percentComplete: c.percentComplete == null ? null : Number(c.percentComplete),
        contractValue: cents(c.latestTotalValue),
        leadPmName: c.leadPmName ?? null,
        leadPmEmail: c.leadPmEmail ?? null,
        lastSyncedAt: iso(c.lastSyncedAt),
      },
      averageDaysToPaid: agingRow?.averageDaysToPaid == null ? null : Number(agingRow.averageDaysToPaid),
      payApps: apps.map((p) => {
        const billed = cents(p.billed);
        const retention = cents(p.retention);
        return {
          id: p.id,
          number: p.number ?? null,
          status: p.status ?? null,
          billed,
          retention,
          // Round to the cent: cents/100 arithmetic leaves float noise (125475.95000000001).
          amountDue: billed == null ? null : Math.round((billed - (retention ?? 0)) * 100) / 100,
          periodStart: iso(p.startDate),
          periodEnd: iso(p.endDate),
          dueDate: iso(p.dueDate),
        };
      }),
      clearstory: project
        ? {
            projectId: Number(project.id),
            name: project.name ?? null,
            customerName: project.customerName ?? null,
            baseContractValue: dollars(project.baseContractValue),
            cors: cors.map((r) => ({
              id: String(r.id),
              corNumber: r.corNumber ?? null,
              title: r.title ?? null,
              status: r.status ?? null,
              requestedAmount: dollars(r.requestedAmount),
              dateSubmitted: iso(r.dateSubmitted as Date | null),
              daysInReview: r.daysInReview == null ? null : Number(r.daysInReview),
            })),
          }
        : null,
    };
  }
}
