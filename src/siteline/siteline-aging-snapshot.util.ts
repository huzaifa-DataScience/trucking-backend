import { In, Repository } from 'typeorm';
import {
  SitelineAgingContract,
  SitelineAgingSummary,
  SitelineContract,
  SitelineEntityConfig,
} from '../database/entities';
import { SITELINE_ENTITY_IDS } from './siteline-entity-config.service';

/**
 * Load aging contract rows from the latest snapshot **per company** (`EntityId` 1/2/3).
 * Email jobs and cron must use this — not `ORDER BY id DESC LIMIT 1` on summaries alone.
 *
 * Siteline often returns the same contract in multiple entity dashboards (GOEL + GOEL DC)
 * with different company attribution per API token. We dedupe by job number / contract id
 * and keep the row that matches `Siteline_Contracts.EntityId` when available.
 */
export async function loadAgingContractsFromLatestPerEntitySnapshots(
  agingSummaryRepo: Repository<SitelineAgingSummary>,
  agingContractRepo: Repository<SitelineAgingContract>,
  entityIds: readonly number[] = SITELINE_ENTITY_IDS,
): Promise<SitelineAgingContract[]> {
  const merged: SitelineAgingContract[] = [];

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

    merged.push(...contracts);
  }

  if (merged.length <= 1) return merged;

  const contractRepo = agingContractRepo.manager.getRepository(SitelineContract);
  const configRepo = agingContractRepo.manager.getRepository(SitelineEntityConfig);
  const contractIds = [...new Set(merged.map((r) => r.contractId))];
  const contractRows = await contractRepo.find({
    where: { id: In(contractIds) },
    select: { id: true, entityId: true },
  });
  const canonicalEntityByContract = new Map(
    contractRows
      .filter((r) => r.entityId != null)
      .map((r) => [r.id, Math.trunc(r.entityId!)]),
  );

  const configs = await configRepo.find();
  const entityBySitelineCompany = new Map<string, number>();
  for (const c of configs) {
    const cid = c.sitelineCompanyId?.trim().toLowerCase();
    if (cid) entityBySitelineCompany.set(cid, c.entityId);
  }

  return dedupeAgingContractsCrossEntity(
    merged,
    canonicalEntityByContract,
    entityBySitelineCompany,
  );
}

/** Exported for tests — one row per job (and per contract id without job number). */
export function dedupeAgingContractsCrossEntity(
  rows: SitelineAgingContract[],
  canonicalEntityByContract: Map<string, number>,
  entityBySitelineCompany: Map<string, number>,
): SitelineAgingContract[] {
  const byJob = new Map<string, SitelineAgingContract[]>();
  const noJob: SitelineAgingContract[] = [];

  for (const row of rows) {
    const job = row.internalProjectNumber?.trim() || row.projectNumber?.trim() || '';
    if (!job) {
      noJob.push(row);
      continue;
    }
    const key = job.toLowerCase();
    const list = byJob.get(key) ?? [];
    list.push(row);
    byJob.set(key, list);
  }

  const out: SitelineAgingContract[] = [];
  for (const group of byJob.values()) {
    out.push(pickCanonicalAgingRow(group, canonicalEntityByContract, entityBySitelineCompany));
  }

  const seenContracts = new Set(out.map((r) => r.contractId));
  for (const row of noJob) {
    if (seenContracts.has(row.contractId)) continue;
    seenContracts.add(row.contractId);
    out.push(row);
  }

  return out;
}

function pickCanonicalAgingRow(
  group: SitelineAgingContract[],
  canonicalEntityByContract: Map<string, number>,
  entityBySitelineCompany: Map<string, number>,
): SitelineAgingContract {
  if (group.length === 1) return group[0];

  const score = (row: SitelineAgingContract): number => {
    const canonical = canonicalEntityByContract.get(row.contractId);
    if (canonical != null && row.entityId === canonical) return 100;
    const co = row.companyId?.trim().toLowerCase() ?? '';
    const fromCo = co ? entityBySitelineCompany.get(co) : undefined;
    if (fromCo != null && row.entityId === fromCo) return 50;
    return 0;
  };

  return [...group].sort((a, b) => {
    const diff = score(b) - score(a);
    if (diff !== 0) return diff;
    return (a.entityId ?? 99) - (b.entityId ?? 99);
  })[0];
}
