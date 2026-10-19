/**
 * Sort + page a list the same way the frontend tables did (lib/sort.ts): text A–Z ignoring case with
 * numbers in natural order, dates compared as dates, blanks last in both directions.
 */
export type SortValue = string | number | null | undefined;

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
const isBlank = (v: SortValue) => v == null || v === '' || (typeof v === 'number' && Number.isNaN(v));

/** Date-like text ("2026-10-12", ISO) → timestamp; anything else is returned as-is. */
export function asDate(value: string | null | undefined): SortValue {
  if (!value) return null;
  const t = /\d[/-]\d/.test(value) ? Date.parse(value) : NaN;
  return Number.isNaN(t) ? value : t;
}

export function sortRows<T>(rows: readonly T[], value: (row: T) => SortValue, dir: 'asc' | 'desc'): T[] {
  return [...rows].sort((x, y) => {
    const a = value(x);
    const b = value(y);
    if (isBlank(a) || isBlank(b)) return isBlank(a) === isBlank(b) ? 0 : isBlank(a) ? 1 : -1;
    const c = typeof a === 'number' && typeof b === 'number' ? a - b : collator.compare(String(a), String(b));
    return dir === 'asc' ? c : -c;
  });
}

/** Sorted (when `sortBy` is a known column) and sliced to one page; page is clamped, pageSize ≤ 200. */
export function pageOf<T>(
  rows: readonly T[],
  accessors: Record<string, (row: T) => SortValue>,
  opts: { page?: number; pageSize?: number; sortBy?: string; sortDir?: string },
) {
  const value = opts.sortBy ? accessors[opts.sortBy] : undefined;
  const sorted = value ? sortRows(rows, value, opts.sortDir === 'desc' ? 'desc' : 'asc') : [...rows];
  const pageSize = Math.min(200, Math.max(1, opts.pageSize ?? 50));
  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const page = Math.min(pages, Math.max(1, opts.page ?? 1));
  return { items: sorted.slice((page - 1) * pageSize, page * pageSize), total: sorted.length, page, pageSize };
}
