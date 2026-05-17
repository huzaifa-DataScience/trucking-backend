import { ClearstoryCor } from '../database/entities';

/** Non-empty `TmTagNumbers` on the COR row (linked T&M tags from Clearstory API). */
export function corHasTmTagNumbers(cor: Pick<ClearstoryCor, 'tmTagNumbers'>): boolean {
  return Boolean(cor.tmTagNumbers?.trim());
}

export function isCorStatusInReview(status: string | null | undefined): boolean {
  const s = String(status ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
  return s === 'in_review' || s === 'inreview';
}

/**
 * Data-quality error: Status is In Review but the COR already has linked T&M tag number(s).
 * A COR should not stay In Review once T&M tags are attached — PM must update Clearstory.
 */
export function isInReviewWithTmTagViolation(cor: ClearstoryCor): boolean {
  return isCorStatusInReview(cor.status) && corHasTmTagNumbers(cor);
}

export const IN_REVIEW_TM_TAG_ERROR_MESSAGE =
  'Status is In Review but TM Tag Number is set — update Clearstory (COR cannot be in review with T&M tags).';
