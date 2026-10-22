/** Mike recap CSV → duct / hydronic / plumbing quantity sums for the takeoff comparison. */

export type RecapScopeTotals = { duct: number; hydronic: number; plumbing: number };

/** Fixed comparison boxes. Label is `recap-a-duct` … `recap-b-plumbing`. One file per box. */
export const RECAP_GROUPS = ['a', 'b'] as const;
export const RECAP_SCOPES = ['duct', 'hydronic', 'plumbing'] as const;
export type RecapGroup = (typeof RECAP_GROUPS)[number];
export type RecapScope = (typeof RECAP_SCOPES)[number];
export const RECAP_SLOT_LABELS = [
  'recap-a-duct',
  'recap-a-hydronic',
  'recap-a-plumbing',
  'recap-b-duct',
  'recap-b-hydronic',
  'recap-b-plumbing',
] as const;

export type RecapSideTotals = { duct: number | null; hydronic: number | null; plumbing: number | null };
export type RecapSlotTotals = { a: RecapSideTotals; b: RecapSideTotals };

export function emptyRecapSlots(): RecapSlotTotals {
  const side = (): RecapSideTotals => ({ duct: null, hydronic: null, plumbing: null });
  return { a: side(), b: side() };
}

export function parseRecapSlotLabel(
  label: string | null | undefined,
): { group: RecapGroup; scope: RecapScope } | null {
  const match = /^recap-([ab])-(duct|hydronic|plumbing)$/.exec((label ?? '').trim());
  if (!match) return null;
  return { group: match[1] as RecapGroup, scope: match[2] as RecapScope };
}

const HYDRONIC_CODES = new Set([
  'CHW', 'CHWS', 'CHWR', 'CHB', 'HWH', 'HWS', 'HWR', 'HHW', 'HHWS', 'HHWR',
  'CON', 'REF', 'CFS', 'CWS', 'STM', 'GLY', 'HWC', 'CWR',
]);

export function recapScope(systemAndType: string): 'duct' | 'hydronic' | 'plumbing' | null {
  const s = systemAndType.replace(/\s+/g, ' ').trim();
  if (!s || s.startsWith('~')) return null;
  const parts = s.split(' ');
  const discipline = (parts[0] ?? '').toUpperCase();
  const code = (parts[1] ?? '').toUpperCase();
  const name = s.toLowerCase();
  if (discipline === 'D') return 'duct';
  if (discipline === 'E') return null;
  if (
    HYDRONIC_CODES.has(code) ||
    /chilled|hot water heat|heating hot|condenser|refrigerant|chilled beam|cooling tower|hydronic|glycol|\bsteam\b/.test(name)
  ) {
    return 'hydronic';
  }
  if (discipline === 'H') return 'hydronic';
  if (discipline === 'P') return 'plumbing';
  return null;
}

/** Null when the file is not a Mike recap (no System-and-Type / Quantity header). */
export function parseRecapCsv(text: string): RecapScopeTotals | null {
  const rows = text.split(/\r?\n/).filter((line) => line.trim()).map(splitCsvLine);
  const header = rows.find((row) => row.some((cell) => cell.trim() === 'System-and-Type') && row.some((cell) => cell.trim() === 'Quantity'));
  if (!header) return null;
  const sysIdx = header.findIndex((cell) => cell.trim() === 'System-and-Type');
  const qtyIdx = header.findIndex((cell) => cell.trim() === 'Quantity');
  const totals: RecapScopeTotals = { duct: 0, hydronic: 0, plumbing: 0 };
  for (const row of rows) {
    if (row === header) continue;
    const scope = recapScope(row[sysIdx] ?? '');
    const qty = Number(String(row[qtyIdx] ?? '').replace(/,/g, '').trim());
    if (!scope || !Number.isFinite(qty)) continue;
    totals[scope] += qty;
  }
  return {
    duct: round2(totals.duct),
    hydronic: round2(totals.hydronic),
    plumbing: round2(totals.plumbing),
  };
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else quoted = !quoted;
    } else if (ch === ',' && !quoted) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
