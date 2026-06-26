import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClearstoryContractComparisonService } from '../clearstory/clearstory-contract-comparison.service';
import { SitelineAgingContract, SitelineAgingSummary, SitelineContract } from '../database/entities';
import {
  agingCentsToDollars,
  totalAgedCentsFromAgingContract,
} from './siteline-aging-overdue.util';
import { resolveLeadPmEmailFromFullName } from './siteline-pm-email.util';
import { SitelineEntityConfigService } from './siteline-entity-config.service';
import { isInactiveSitelineAgingRow, isInactiveComparisonStatus } from './siteline-aging-inactive.util';

export type SitelineReconciliationGapReason =
  | 'NO_CLEARSTORY_PROJECT'
  | 'CLEARSTORY_EMPTY'
  | 'NOT_COMPARABLE';

export interface SitelineReconciliationGapItem {
  contractId: string;
  projectName: string | null;
  projectNumber: string | null;
  internalProjectNumber: string | null;
  leadPmName: string | null;
  leadPmEmail: string | null;
  netDollars: number;
  daysPastDue: number | null;
  clearstoryProjectId: string | null;
  clearstoryJobNumber: string | null;
  matchKeyTried: string | null;
  gapReason: SitelineReconciliationGapReason;
}

@Injectable()
export class SitelineReconciliationGapsService {
  constructor(
    private readonly contractComparison: ClearstoryContractComparisonService,
    private readonly entityConfig: SitelineEntityConfigService,
    @InjectRepository(SitelineAgingSummary)
    private readonly agingSummaryRepo: Repository<SitelineAgingSummary>,
    @InjectRepository(SitelineAgingContract)
    private readonly agingContractRepo: Repository<SitelineAgingContract>,
    @InjectRepository(SitelineContract)
    private readonly sitelineContractRepo: Repository<SitelineContract>,
  ) {}

  async findGaps(entityId?: number): Promise<{
    items: SitelineReconciliationGapItem[];
    evaluatedAt: string;
    entityId: number | null;
    entityName: string;
  }> {
    const evaluatedAt = new Date().toISOString();
    const snapshot = await this.getLatestSnapshot(entityId);
    if (!snapshot) {
      return {
        items: [],
        evaluatedAt,
        entityId: entityId ?? null,
        entityName: await this.resolveEntityName(entityId),
      };
    }

    const where: { snapshotId: number; entityId?: number } = { snapshotId: snapshot.id };
    if (entityId != null) {
      where.entityId = entityId;
    }

    const contracts = await this.agingContractRepo.find({ where });
    const items: SitelineReconciliationGapItem[] = [];
    const seen = new Set<string>();

    for (const row of contracts) {
      const totalCents = totalAgedCentsFromAgingContract(row);
      if (totalCents <= 0) continue;

      if (await isInactiveSitelineAgingRow(this.sitelineContractRepo, row)) {
        continue;
      }

      const netDollars = agingCentsToDollars(totalCents);
      const gap = await this.evaluateContractGap(row, netDollars);
      if (!gap) continue;

      const dedupeKey = `${row.contractId}|${gap.gapReason}|${gap.matchKeyTried ?? ''}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      items.push(gap);
    }

    items.sort((a, b) => b.netDollars - a.netDollars);

    return {
      items,
      evaluatedAt,
      entityId: entityId ?? snapshot.entityId ?? null,
      entityName: await this.resolveEntityName(entityId ?? snapshot.entityId ?? undefined),
    };
  }

  private async getLatestSnapshot(
    entityId?: number,
  ): Promise<SitelineAgingSummary | null> {
    if (entityId != null) {
      const rows = await this.agingSummaryRepo.find({
        where: { entityId },
        order: { id: 'DESC' },
        take: 1,
      });
      return rows[0] ?? null;
    }
    const rows = await this.agingSummaryRepo.find({
      order: { id: 'DESC' },
      take: 1,
    });
    return rows[0] ?? null;
  }

  private async resolveEntityName(entityId?: number): Promise<string> {
    if (entityId == null) return 'All companies';
    const configs = await this.entityConfig.listConfigs();
    const match = configs.find((c) => c.entityId === entityId);
    return match?.entityName ?? `Entity ${entityId}`;
  }

  private async evaluateContractGap(
    row: SitelineAgingContract,
    netDollars: number,
  ): Promise<SitelineReconciliationGapItem | null> {
    const keys = [
      row.internalProjectNumber?.trim(),
      row.projectNumber?.trim(),
    ].filter((k): k is string => Boolean(k));

    if (!keys.length) {
      return {
        contractId: row.contractId,
        projectName: row.projectName ?? null,
        projectNumber: row.projectNumber ?? null,
        internalProjectNumber: row.internalProjectNumber ?? null,
        leadPmName: row.leadPmName ?? null,
        leadPmEmail: resolveLeadPmEmailFromFullName(row.leadPmEmail, row.leadPmName),
        netDollars,
        daysPastDue: null,
        clearstoryProjectId: null,
        clearstoryJobNumber: null,
        matchKeyTried: null,
        gapReason: 'NOT_COMPARABLE',
      };
    }

    let lastTriedKey: string | null = null;

    for (const key of keys) {
      lastTriedKey = key;
      const cmp = await this.contractComparison.getByJobNumber(key);
      if (!cmp) {
        continue;
      }
      if (isInactiveComparisonStatus(cmp.comparison.status)) {
        return null;
      }

      const csValue = cmp.clearstory.approvedCoIssuedContractValue;
      const csEmpty =
        csValue < 0.01 &&
        cmp.clearstory.totalApprovedCoIssued < 0.01 &&
        cmp.clearstory.totalInReview < 0.01;

      if (csEmpty && cmp.comparison.status !== 'match') {
        return {
          contractId: row.contractId,
          projectName: row.projectName ?? null,
          projectNumber: row.projectNumber ?? null,
          internalProjectNumber: row.internalProjectNumber ?? null,
          leadPmName: row.leadPmName ?? null,
          leadPmEmail: resolveLeadPmEmailFromFullName(row.leadPmEmail, row.leadPmName),
          netDollars,
          daysPastDue: null,
          clearstoryProjectId: String(cmp.project.id),
          clearstoryJobNumber: cmp.project.jobNumber,
          matchKeyTried: `jobNumber=${key}`,
          gapReason: 'CLEARSTORY_EMPTY',
        };
      }

      return null;
    }

    if (lastTriedKey) {
      return {
        contractId: row.contractId,
        projectName: row.projectName ?? null,
        projectNumber: row.projectNumber ?? null,
        internalProjectNumber: row.internalProjectNumber ?? null,
        leadPmName: row.leadPmName ?? null,
        leadPmEmail: resolveLeadPmEmailFromFullName(row.leadPmEmail, row.leadPmName),
        netDollars,
        daysPastDue: null,
        clearstoryProjectId: null,
        clearstoryJobNumber: null,
        matchKeyTried: `jobNumber=${lastTriedKey}`,
        gapReason: 'NO_CLEARSTORY_PROJECT',
      };
    }

    return null;
  }
}
