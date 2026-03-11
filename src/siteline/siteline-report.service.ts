import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import { SitelineContract, SitelinePayApp } from '../database/entities';

const AGING_BUCKETS = [
  'Current',
  '1-30 Days',
  '31-60 Days',
  '61-90 Days',
  '91-120 Days',
  '>120 Days',
] as const;

function getBucket(daysPastDue: number): (typeof AGING_BUCKETS)[number] {
  if (daysPastDue <= 0) return 'Current';
  if (daysPastDue <= 30) return '1-30 Days';
  if (daysPastDue <= 60) return '31-60 Days';
  if (daysPastDue <= 90) return '61-90 Days';
  if (daysPastDue <= 120) return '91-120 Days';
  return '>120 Days';
}

export interface AgingReportRow {
  projectName: string;
  buckets: Record<(typeof AGING_BUCKETS)[number], number>;
  projectTotal: number;
}

export interface AgingReportResponse {
  buckets: readonly string[];
  rows: AgingReportRow[];
  totals: Record<(typeof AGING_BUCKETS)[number], number> & { projectTotal: number };
}

@Injectable()
export class SitelineReportService {
  constructor(
    @InjectRepository(SitelinePayApp)
    private readonly payAppRepo: Repository<SitelinePayApp>,
    @InjectRepository(SitelineContract)
    private readonly contractRepo: Repository<SitelineContract>,
  ) {}

  /**
   * Aging report from synced Siteline data (Siteline_Contracts + Siteline_PayApps).
   * Net Dollars = (Billed - Retention) / 100. Excludes pay apps with status PAID or DRAFT.
   * Buckets: Current, 1-30 Days, 31-60 Days, 61-90 Days, 91-120 Days, >120 Days past due.
   */
  async getAgingReport(): Promise<AgingReportResponse> {
    // Load all pay apps with their contracts; we'll filter PAID/DRAFT in code so that
    // rows with NULL status values are still included in the report.
    const payApps = await this.payAppRepo.find({
      relations: ['contract'],
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    type BucketKey = (typeof AGING_BUCKETS)[number];
    const pivot = new Map<string, Record<BucketKey, number>>();
    const projectTotals = new Map<string, number>();

    for (const pa of payApps) {
      // Skip explicitly paid/draft items, but allow null/other statuses through.
      if (pa.status === 'PAID' || pa.status === 'DRAFT') continue;

      const contract = pa.contract;
      if (!contract) continue;

      // Prefer project name; fall back to project number or contract id if needed.
      const key = contract.projectName ?? contract.projectNumber ?? contract.id;

      const billed = Number(pa.billed ?? 0);
      const retention = Number(pa.retention ?? 0);
      const netDollars = (billed - retention) / 100;

      const dueDate = pa.dueDate ? new Date(pa.dueDate) : null;
      const daysPastDue = dueDate
        ? Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))
        : 0;
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
      rows.push({ projectName, buckets: { ...buckets }, projectTotal });
      for (const b of AGING_BUCKETS) totals[b] += buckets[b];
      totals.projectTotal += projectTotal;
    }

    return {
      buckets: [...AGING_BUCKETS],
      rows,
      totals,
    };
  }
}
