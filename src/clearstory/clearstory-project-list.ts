/**
 * Server copy of the Clearstory Projects page's filter + sort rules (frontend `lib/filters/types.ts`
 * `rowMatchesGroups` and the page's `compareValues`), so a paged list orders and filters exactly as
 * the page did when it held every row.
 */

export interface ProjectFilterCondition {
  field: string;
  op?: string;
  value?: string;
  values?: string[];
  start?: string;
  end?: string;
}

export interface ProjectFilterGroup {
  conditions: ProjectFilterCondition[];
}

type Row = Record<string, unknown>;

function fieldValue(row: Row, key: string): string {
  const raw = row[key];
  return raw == null ? '' : String(raw);
}

function conditionMatches(row: Row, c: ProjectFilterCondition): boolean {
  if (c.op === 'in' || (c.values && c.values.length > 0)) {
    const picked = (c.values ?? []).map((v) => String(v).toLowerCase());
    if (picked.length === 0) return true;
    return picked.includes(fieldValue(row, c.field).toLowerCase());
  }
  if (c.op === 'is') {
    if (!c.value) return true;
    return fieldValue(row, c.field).toLowerCase() === String(c.value).toLowerCase();
  }
  if (c.op === 'contains') {
    if (!c.value?.trim()) return true;
    return fieldValue(row, c.field).toLowerCase().includes(c.value.trim().toLowerCase());
  }
  // between (date range): inclusive; an empty bound means unbounded on that side.
  const raw = fieldValue(row, c.field) || (c.field === 'bidDate' ? fieldValue(row, 'updatedAt') : '');
  if (!raw) return false;
  const t = new Date(raw.slice(0, 10)).getTime();
  if (Number.isNaN(t)) return false;
  if (c.start) {
    const startT = new Date(c.start).getTime();
    if (!Number.isNaN(startT) && t < startT) return false;
  }
  if (c.end) {
    const endT = new Date(c.end).getTime();
    if (!Number.isNaN(endT) && t > endT) return false;
  }
  return true;
}

/** Groups are OR'd together; conditions within a group are AND'd. Empty groups / conditions match everything. */
export function rowMatchesGroups(row: Row, groups: ProjectFilterGroup[]): boolean {
  const active = groups.filter((g) => Array.isArray(g?.conditions) && g.conditions.length > 0);
  if (active.length === 0) return true;
  return active.some((g) => g.conditions.every((c) => conditionMatches(row, c)));
}

/** `filters` query param (JSON array of groups); anything malformed means "no filter". */
export function parseProjectFilterGroups(raw?: string): ProjectFilterGroup[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((g): g is ProjectFilterGroup => !!g && typeof g === 'object' && Array.isArray((g as ProjectFilterGroup).conditions))
      .map((g) => ({
        conditions: g.conditions
          .filter((c) => !!c && typeof c === 'object' && typeof c.field === 'string')
          .map((c) => ({
            field: c.field,
            op: typeof c.op === 'string' ? c.op : undefined,
            value: typeof c.value === 'string' ? c.value : undefined,
            values: Array.isArray(c.values) ? c.values.map(String) : undefined,
            start: typeof c.start === 'string' ? c.start : undefined,
            end: typeof c.end === 'string' ? c.end : undefined,
          })),
      }));
  } catch {
    return [];
  }
}

function normalizeMoney(value: unknown): number | undefined {
  if (value == null) return undefined;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

/** Blanks last; then numbers, number-like text, dates, and finally text. */
function compareValues(a: unknown, b: unknown): number {
  const aEmpty = a === null || a === undefined || a === '';
  const bEmpty = b === null || b === undefined || b === '';
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;

  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);

  const aStr = typeof a === 'string' ? a : String(a);
  const bStr = typeof b === 'string' ? b : String(b);

  const aNum = Number(aStr);
  const bNum = Number(bStr);
  if (aStr !== '' && bStr !== '' && !Number.isNaN(aNum) && !Number.isNaN(bNum)) return aNum - bNum;

  const aDate = Date.parse(aStr);
  const bDate = Date.parse(bStr);
  if (!Number.isNaN(aDate) && !Number.isNaN(bDate)) return aDate - bDate;

  return aStr.localeCompare(bStr);
}

/**
 * Sorted copy, as the page sorted it. Descending swaps the arguments (so blanks stay first-then-last the
 * same way the page had them); without `sortBy` the given order is kept.
 */
export function sortProjectRows<T extends Row>(rows: T[], sortBy?: string, sortDir?: string): T[] {
  if (!sortBy) return rows;
  const withValues = rows.map((row) => ({
    row,
    value: sortBy === 'baseContractValue' ? normalizeMoney(row.baseContractValue) : row[sortBy],
  }));
  withValues.sort((a, b) => (sortDir === 'desc' ? compareValues(b.value, a.value) : compareValues(a.value, b.value)));
  return withValues.map((w) => w.row);
}
