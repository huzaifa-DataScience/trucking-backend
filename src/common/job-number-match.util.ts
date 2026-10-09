/**
 * Compare Siteline internal project numbers with Clearstory job numbers.
 * Leading-zero variants are the same (9920 === 09920). A spaced Clearstory
 * suffix stays the base job (12201 - 02 === 12201). A letter glued to the
 * number is a different job (21138a !== 21138).
 */

/** Job token at the start of a string. Keeps a letter suffix (21138a). Drops leading zeros. */
export function normalizeJobNumberKey(raw: string | null | undefined): string | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const m = s.match(/^0*(\d+)([A-Za-z]*)/);
  if (!m || !m[1]) return /^0+$/.test(s) ? '0' : s.toLowerCase();
  return m[1] + m[2].toLowerCase();
}

/** Job as written on the row: "21138a - Name" → "21138a". */
export function sitelineJobLabel(row: {
  projectName?: string | null;
  internalProjectNumber?: string | null;
  projectNumber?: string | null;
}): string {
  const name = String(row.projectName ?? '').trim();
  const written = name.match(/^(\d+[A-Za-z]*)/);
  if (written) return written[1];
  return row.internalProjectNumber?.trim() || row.projectNumber?.trim() || '';
}

/**
 * Grouping key. Project name wins when it starts with a job number, so 21138a
 * does not collapse into internal project number 21138.
 */
export function sitelineRowJobKey(row: {
  projectName?: string | null;
  internalProjectNumber?: string | null;
  projectNumber?: string | null;
}): string | null {
  const name = String(row.projectName ?? '').trim();
  if (/^\d/.test(name)) return normalizeJobNumberKey(name);
  return normalizeJobNumberKey(row.internalProjectNumber) ?? normalizeJobNumberKey(row.projectNumber);
}

export function sitelineContractMatchesJob(
  contract: {
    projectName?: string | null;
    internalProjectNumber?: string | null;
    projectNumber?: string | null;
  },
  job: string,
): boolean {
  const key = sitelineRowJobKey(contract);
  const want = normalizeJobNumberKey(job);
  return Boolean(key && want && key === want);
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
