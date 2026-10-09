import { Repository } from 'typeorm';
import { SitelineContract } from '../database/entities';
import {
  jobNumberLookupVariants,
  sitelineContractMatchesJob,
} from '../common/job-number-match.util';
import { isSitelineContractActive } from './siteline-active-contract.util';

export function sitelineLatestTotalValueToDollars(
  v: string | null | undefined,
): number | null {
  if (v == null || String(v).trim() === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.round((n / 100) * 100) / 100;
}

/** Contracts for this job only. 21138a is not included in 21138. */
export async function findSitelineContractsForJob(
  contractRepo: Repository<SitelineContract>,
  job: string,
): Promise<SitelineContract[]> {
  const trimmed = job.trim();
  if (!trimmed) return [];
  const variants = jobNumberLookupVariants(trimmed);
  const qb = contractRepo.createQueryBuilder('c');
  const parts: string[] = [];
  const params: Record<string, string> = { pn: `${trimmed}%` };
  variants.forEach((v, i) => {
    parts.push(`c.internalProjectNumber = :ip${i}`, `c.projectNumber = :ip${i}`);
    params[`ip${i}`] = v;
  });
  parts.push('c.projectName LIKE :pn');
  const rows = await qb.where(parts.join(' OR '), params).getMany();
  const deduped = Array.from(new Map(rows.map((c) => [c.id, c])).values());
  return deduped.filter((c) => sitelineContractMatchesJob(c, trimmed));
}

/**
 * Siteline contract total for one job. Letter-suffix jobs stay separate.
 * A contract id is used only when no job number is passed.
 */
export async function resolveSitelineBillDollars(
  contractRepo: Repository<SitelineContract>,
  opts: { contractId?: string | null; jobNumber?: string },
): Promise<number | null> {
  const job = opts.jobNumber?.trim();
  if (job) {
    const byJob = await findSitelineContractsForJob(contractRepo, job);
    const active = byJob.filter((c) => isSitelineContractActive(c.status));
    const matched = active.length > 0 ? active : byJob;
    if (matched.length) {
      const rawSum = matched.reduce((sum, c) => {
        const n = Number(c.latestTotalValue ?? 0);
        return Number.isFinite(n) ? sum + n : sum;
      }, 0);
      if (rawSum > 0) return sitelineLatestTotalValueToDollars(String(rawSum))!;
      return sitelineLatestTotalValueToDollars(matched[0].latestTotalValue);
    }
  }

  const contractId = opts.contractId?.trim();
  if (!contractId) return null;
  const row = await contractRepo.findOne({ where: { id: contractId } });
  return sitelineLatestTotalValueToDollars(row?.latestTotalValue);
}
