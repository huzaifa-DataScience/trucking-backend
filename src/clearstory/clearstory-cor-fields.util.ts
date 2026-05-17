/** Clearstory COR `tmTags` / `manualTmTag` from ChangeOrderRequest API (swagger). */

function strOpt(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

function intOpt(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/** Prefer detail payload when present (merged list + GET /cors/{id}). */
export function extractCorTmFields(
  list: unknown,
  detail?: unknown | null,
): {
  tmTagNumbers: string | null;
  manualTmTag: string | null;
  tmTagCount: number | null;
} {
  const l = list as Record<string, unknown> | null | undefined;
  const d = detail as Record<string, unknown> | null | undefined;

  const tagsRaw = Array.isArray(d?.tmTags) ? d.tmTags : Array.isArray(l?.tmTags) ? l.tmTags : [];
  const numbers: string[] = [];
  for (const t of tagsRaw) {
    const row = t as Record<string, unknown>;
    const label = strOpt(row.paddedTagNumber) ?? strOpt(row.number);
    if (label) numbers.push(label);
  }

  const manualTmTag = strOpt(d?.manualTmTag ?? l?.manualTmTag);
  const tmTagNumbers = numbers.length ? [...new Set(numbers)].join(', ') : null;
  const countFromApi = intOpt(d?.tmTagCount ?? l?.tmTagCount);
  const tmTagCount = countFromApi ?? (numbers.length > 0 ? numbers.length : null);

  return { tmTagNumbers, manualTmTag, tmTagCount };
}

/** PJ / UI column: linked tag number(s), else manual entry. */
export function displayTmTagNumber(cor: {
  tmTagNumbers?: string | null;
  manualTmTag?: string | null;
}): string {
  const linked = cor.tmTagNumbers?.trim();
  if (linked) return linked;
  return cor.manualTmTag?.trim() ?? '';
}
