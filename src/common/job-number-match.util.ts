/**
 * Compare Siteline internal project numbers with Clearstory job numbers.
 * Treats leading-zero variants as the same (9920 === 09920) and allows Clearstory
 * suffixes (12201 - 02 matches Siteline 12201).
 */

/** Leading digit run at the start of a job string, without leading zeros. */
export function normalizeJobNumberKey(raw: string | null | undefined): string | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const m = s.match(/^(\d+)/);
  if (!m) return s.toLowerCase();
  const digits = m[1].replace(/^0+/, '') || '0';
  return digits;
}

/** True when two job strings refer to the same numeric job (e.g. 9920 and 09920). */
export function jobNumbersEquivalent(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const ta = String(a ?? '').trim();
  const tb = String(b ?? '').trim();
  if (!ta || !tb) return false;
  if (ta === tb) return true;

  const na = normalizeJobNumberKey(ta);
  const nb = normalizeJobNumberKey(tb);
  return Boolean(na && nb && na === nb);
}

/**
 * Strings to try for an exact `JobNumber` column lookup (exact + common zero-pad).
 * Uses 5-digit pad when the input is numeric (Clearstory often stores 09920).
 */
export function jobNumberLookupVariants(job: string): string[] {
  const trimmed = job.trim();
  if (!trimmed) return [];

  const variants = new Set<string>([trimmed]);

  if (/^\d+$/.test(trimmed)) {
    const n = parseInt(trimmed, 10);
    if (Number.isFinite(n)) {
      variants.add(String(n));
      variants.add(String(n).padStart(5, '0'));
    }
  }

  return [...variants];
}
