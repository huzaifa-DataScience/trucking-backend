import { SitelineAgingContract } from '../database/entities';

/** Cents in Siteline aging breakdown → dollars. */
export function agingCentsToDollars(cents: string | number | null | undefined): number {
  const v = Number(cents ?? 0);
  return Number.isFinite(v) ? v / 100 : 0;
}

/**
 * Sum AR (cents) in aging buckets strictly older than `minDaysPastDueExclusive` days.
 * Aligns with legacy pay-app rule `daysPastDue > 50` when threshold is 50.
 *
 * Siteline field mapping (see `bucketsFromSitelineAgingBreakdown`):
 * - amountAgedCurrent: 0–30
 * - amountAged30Days: 31–60
 * - amountAged60Days: 61–90
 * - amountAged90Days: 91–120
 * - amountAged120Days: >120
 */
export function overdueCentsFromAgingContract(
  row: Pick<
    SitelineAgingContract,
    | 'amountAgedCurrent'
    | 'amountAged30Days'
    | 'amountAged60Days'
    | 'amountAged90Days'
    | 'amountAged120Days'
  >,
  minDaysPastDueExclusive: number,
): number {
  const t = Math.max(0, Math.floor(minDaysPastDueExclusive));
  let cents = 0;
  if (t < 30) cents += Number(row.amountAgedCurrent ?? 0);
  if (t < 60) cents += Number(row.amountAged30Days ?? 0);
  if (t < 90) cents += Number(row.amountAged60Days ?? 0);
  if (t < 120) cents += Number(row.amountAged90Days ?? 0);
  cents += Number(row.amountAged120Days ?? 0);
  return cents;
}

export function totalAgedCentsFromAgingContract(
  row: Pick<
    SitelineAgingContract,
    | 'amountAgedCurrent'
    | 'amountAged30Days'
    | 'amountAged60Days'
    | 'amountAged90Days'
    | 'amountAged120Days'
  >,
): number {
  return (
    Number(row.amountAgedCurrent ?? 0) +
    Number(row.amountAged30Days ?? 0) +
    Number(row.amountAged60Days ?? 0) +
    Number(row.amountAged90Days ?? 0) +
    Number(row.amountAged120Days ?? 0)
  );
}
