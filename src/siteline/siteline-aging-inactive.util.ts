import { Repository } from 'typeorm';
import { SitelineAgingContract, SitelineContract } from '../database/entities';
import { isSitelineContractActive } from './siteline-active-contract.util';

type AgingRowPick = Pick<
  SitelineAgingContract,
  'contractId' | 'internalProjectNumber' | 'projectNumber'
>;

/**
 * True when synced Siteline_Contracts shows this aging row is not an active project
 * (e.g. COMPLETED). Used to auto-exclude closed jobs from gap alerts and PM emails.
 */
export async function isInactiveSitelineAgingRow(
  contractRepo: Repository<SitelineContract>,
  row: AgingRowPick,
): Promise<boolean> {
  const contractId = row.contractId?.trim();
  if (contractId) {
    const byId = await contractRepo.findOne({ where: { id: contractId } });
    if (byId && !isSitelineContractActive(byId.status)) {
      return true;
    }
  }

  const keys = [row.internalProjectNumber?.trim(), row.projectNumber?.trim()].filter(
    (k): k is string => Boolean(k),
  );

  for (const key of keys) {
    const matches = await contractRepo.find({
      where: [{ internalProjectNumber: key }, { projectNumber: key }],
    });
    const deduped = Array.from(new Map(matches.map((c) => [c.id, c])).values());
    if (deduped.length > 0 && deduped.every((c) => !isSitelineContractActive(c.status))) {
      return true;
    }
  }

  return false;
}

export function isInactiveComparisonStatus(status: string | null | undefined): boolean {
  return status === 'inactive_clearstory' || status === 'inactive_siteline';
}
