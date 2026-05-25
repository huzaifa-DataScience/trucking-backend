import { Repository } from 'typeorm';
import { SitelineAgingContract, SitelineAgingSummary } from '../database/entities';
import { SITELINE_ENTITY_IDS } from './siteline-entity-config.service';

/**
 * Load aging contract rows from the latest snapshot **per company** (`EntityId` 1/2/3).
 * Email jobs and cron must use this — not `ORDER BY id DESC LIMIT 1` on summaries alone.
 */
export async function loadAgingContractsFromLatestPerEntitySnapshots(
  agingSummaryRepo: Repository<SitelineAgingSummary>,
  agingContractRepo: Repository<SitelineAgingContract>,
  entityIds: readonly number[] = SITELINE_ENTITY_IDS,
): Promise<SitelineAgingContract[]> {
  const merged: SitelineAgingContract[] = [];
  const seen = new Set<string>();

  for (const entityId of entityIds) {
    const summaries = await agingSummaryRepo.find({
      where: { entityId },
      order: { id: 'DESC' },
      take: 1,
    });
    const latest = summaries[0];
    if (!latest) continue;

    const contracts = await agingContractRepo.find({
      where: { snapshotId: latest.id, entityId },
    });

    for (const row of contracts) {
      const key = `${entityId}|${row.contractId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(row);
    }
  }

  return merged;
}
