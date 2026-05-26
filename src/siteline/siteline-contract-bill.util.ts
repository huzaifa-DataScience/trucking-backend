import { Repository } from 'typeorm';
import { SitelineContract } from '../database/entities';
import { isSitelineContractActive } from './siteline-active-contract.util';

export function sitelineLatestTotalValueToDollars(
  v: string | null | undefined,
): number | null {
  if (v == null || String(v).trim() === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.round((n / 100) * 100) / 100;
}

/**
 * Siteline contract total for reports when Clearstory comparison is unavailable.
 * Prefer the aging row's contract id; fall back to job # on internal/project number.
 */
export async function resolveSitelineBillDollars(
  contractRepo: Repository<SitelineContract>,
  opts: { contractId?: string | null; jobNumber?: string },
): Promise<number | null> {
  const contractId = opts.contractId?.trim();
  if (contractId) {
    const row = await contractRepo.findOne({ where: { id: contractId } });
    const fromId = sitelineLatestTotalValueToDollars(row?.latestTotalValue);
    if (fromId != null) return fromId;
  }

  const job = opts.jobNumber?.trim();
  if (!job) return null;

  const byJob = await contractRepo.find({
    where: [{ internalProjectNumber: job }, { projectNumber: job }],
    order: { lastSyncedAt: 'DESC' },
  });
  const deduped = Array.from(new Map(byJob.map((c) => [c.id, c])).values());
  const active = deduped.filter((c) => isSitelineContractActive(c.status));
  const matched = active.length > 0 ? active : deduped;
  if (!matched.length) return null;

  const rawSum = matched.reduce((sum, c) => {
    const n = Number(c.latestTotalValue ?? 0);
    return Number.isFinite(n) ? sum + n : sum;
  }, 0);
  if (rawSum > 0) return sitelineLatestTotalValueToDollars(String(rawSum))!;

  return sitelineLatestTotalValueToDollars(matched[0].latestTotalValue);
}
