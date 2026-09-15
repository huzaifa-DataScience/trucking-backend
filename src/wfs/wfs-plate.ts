/** Dashboard Pro Loans v44 plate. Computed only; do not persist. */

export const WFS_COMPANY_KEYS = [
  'goel',
  'dcb',
  'goel_dc',
  'ati',
  'g3',
  'dmv_demo',
  'dmv_insul',
] as const;
export type WfsCompanyKey = (typeof WFS_COMPANY_KEYS)[number];

export type WfsCompanyKind = 'arap' | 'cash' | 'property';

export type WfsCompanyDef = {
  key: WfsCompanyKey;
  label: string;
  ourEntityId: number | null;
  kind: WfsCompanyKind;
  plaidCompanies: string[];
  arView: string | null;
  apView: string | null;
};

export const WFS_COMPANIES: WfsCompanyDef[] = [
  {
    key: 'goel',
    label: 'Goel Services',
    ourEntityId: 1,
    kind: 'arap',
    plaidCompanies: ['Goel Services, Inc.'],
    arView: 'v_wfs_AR_GC',
    apView: 'v_wfs_AP_GC',
  },
  {
    key: 'dcb',
    label: 'DCB',
    ourEntityId: 3,
    kind: 'arap',
    plaidCompanies: ['Delaware Cornerstone Builders, Inc.'],
    arView: 'v_wfs_AR_CB',
    apView: 'v_wfs_AP_CB',
  },
  {
    key: 'goel_dc',
    label: 'Goel DC',
    ourEntityId: 2,
    kind: 'arap',
    plaidCompanies: ['Goel DC, LLC'],
    arView: 'v_wfs_AR_GoelDC',
    apView: 'v_wfs_AP_GoelDC',
  },
  {
    key: 'ati',
    label: 'Apprentice Training',
    ourEntityId: null,
    kind: 'cash',
    plaidCompanies: ['Apprentice Training, Inc.'],
    arView: null,
    apView: null,
  },
  {
    key: 'g3',
    label: 'G3 Holding',
    ourEntityId: null,
    kind: 'property',
    plaidCompanies: ['G3 Holdings, LLC'],
    arView: null,
    apView: null,
  },
  {
    key: 'dmv_demo',
    label: 'DMV Demolition',
    ourEntityId: null,
    kind: 'cash',
    plaidCompanies: ['DMV Demolition Contractors Association'],
    arView: null,
    apView: null,
  },
  {
    key: 'dmv_insul',
    label: 'DMV Insulation',
    ourEntityId: null,
    kind: 'cash',
    plaidCompanies: ['DMV Insulation Contractors Association'],
    arView: null,
    apView: null,
  },
];

export const WFS_CADENCE = 'Monthly — Mon. After 2nd Fri.';

export type AgingBuckets = {
  current: number;
  d31: number;
  d61: number;
  d90: number;
  retainage: number;
  total: number;
};

export type CompanyStatic = {
  locLimit: number;
  locDrawn: number;
  pnotes: number;
  extraCash: number;
  propertyValue: number;
  mortgages: number;
  equipmentLoan: number;
};

export type CompanyLive = {
  ar: AgingBuckets | null;
  ap: AgingBuckets | null;
  plaidOperating: number;
};

/** One v44 company row (columns A–L). */
export type WfsCompanyRow = {
  key: WfsCompanyKey;
  label: string;
  ourEntityId: number | null;
  kind: WfsCompanyKind;
  bank: number;
  pnotes: number;
  locLimit: number;
  borrowing: number;
  availCredit: number;
  otherLoans: number;
  totalDebt: number;
  ar: number | null;
  ap: number | null;
  netArAp: number | null;
  availCash: number;
  equity: number;
  agingAr: AgingBuckets | null;
  agingAp: AgingBuckets | null;
};

export type WfsTotals = {
  bank: number;
  pnotes: number;
  locLimit: number;
  borrowing: number;
  availCredit: number;
  otherLoans: number;
  totalDebt: number;
  ar: number;
  ap: number;
  netArAp: number;
  availCash: number;
  equity: number;
  agingAr: AgingBuckets;
  agingAp: AgingBuckets;
};

export function money(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

export function emptyAging(): AgingBuckets {
  return { current: 0, d31: 0, d61: 0, d90: 0, retainage: 0, total: 0 };
}

export function emptyStatic(): CompanyStatic {
  return {
    locLimit: 0,
    locDrawn: 0,
    pnotes: 0,
    extraCash: 0,
    propertyValue: 0,
    mortgages: 0,
    equipmentLoan: 0,
  };
}

export function addAging(a: AgingBuckets, b: AgingBuckets): AgingBuckets {
  return {
    current: money(a.current + b.current),
    d31: money(a.d31 + b.d31),
    d61: money(a.d61 + b.d61),
    d90: money(a.d90 + b.d90),
    retainage: money(a.retainage + b.retainage),
    total: money(a.total + b.total),
  };
}

/** v44: Avail Credit = IF(LOC=0, 0, LOC − Borrowing). */
export function availCredit(locLimit: number, borrowing: number): number {
  return locLimit === 0 ? 0 : money(locLimit - borrowing);
}

export function companyPlate(def: WfsCompanyDef, live: CompanyLive, stat: CompanyStatic): WfsCompanyRow {
  const bank = money(live.plaidOperating + stat.extraCash);
  const pnotes = money(stat.pnotes);
  const locLimit = money(stat.locLimit);
  const borrowing = money(def.kind === 'property' ? stat.mortgages : stat.locDrawn);
  const otherLoans = money(stat.equipmentLoan);
  const credit = availCredit(locLimit, borrowing);
  const totalDebt = money(pnotes + borrowing + otherLoans);
  const ar = live.ar ? money(live.ar.total) : null;
  const ap = live.ap ? money(live.ap.total) : null;
  const netArAp = ar != null && ap != null ? money(ar - ap) : ar != null ? ar : ap != null ? money(-ap) : null;
  const net = netArAp ?? 0;
  const propertyAdd = def.kind === 'property' ? money(stat.propertyValue) : 0;
  const equity = money(net - totalDebt + bank + propertyAdd);
  return {
    key: def.key,
    label: def.label,
    ourEntityId: def.ourEntityId,
    kind: def.kind,
    bank,
    pnotes,
    locLimit,
    borrowing,
    availCredit: credit,
    otherLoans,
    totalDebt,
    ar,
    ap,
    netArAp,
    availCash: bank,
    equity,
    agingAr: live.ar,
    agingAp: live.ap,
  };
}

export function groupPlate(rows: WfsCompanyRow[]): WfsTotals {
  let agingAr = emptyAging();
  let agingAp = emptyAging();
  let bank = 0;
  let pnotes = 0;
  let locLimit = 0;
  let borrowing = 0;
  let credit = 0;
  let otherLoans = 0;
  let totalDebt = 0;
  let ar = 0;
  let ap = 0;
  let equity = 0;
  for (const r of rows) {
    if (r.agingAr) agingAr = addAging(agingAr, r.agingAr);
    if (r.agingAp) agingAp = addAging(agingAp, r.agingAp);
    bank += r.bank;
    pnotes += r.pnotes;
    locLimit += r.locLimit;
    borrowing += r.borrowing;
    credit += r.availCredit;
    otherLoans += r.otherLoans;
    totalDebt += r.totalDebt;
    ar += r.ar ?? 0;
    ap += r.ap ?? 0;
    equity += r.equity;
  }
  return {
    bank: money(bank),
    pnotes: money(pnotes),
    locLimit: money(locLimit),
    borrowing: money(borrowing),
    availCredit: money(credit),
    otherLoans: money(otherLoans),
    totalDebt: money(totalDebt),
    ar: money(ar),
    ap: money(ap),
    netArAp: money(ar - ap),
    availCash: money(bank),
    equity: money(equity),
    agingAr,
    agingAp,
  };
}

export function agingTable(rows: WfsCompanyRow[]): {
  companyKey: WfsCompanyKey;
  label: string;
  type: 'ar' | 'ap';
  current: number;
  d31: number;
  d61: number;
  d90: number;
  retainage: number;
  total: number;
}[] {
  const out: ReturnType<typeof agingTable> = [];
  for (const r of rows) {
    if (r.agingAr) out.push({ companyKey: r.key, label: r.label, type: 'ar', ...r.agingAr });
    if (r.agingAp) out.push({ companyKey: r.key, label: r.label, type: 'ap', ...r.agingAp });
  }
  return out;
}

/** Monday after the 2nd Friday of the month (v44 cadence). If that Monday is past, next month. */
export function nextSnapshotDate(from = new Date()): string {
  const ymd = (d: Date) => d.toISOString().slice(0, 10);
  const monday = (year: number, monthIndex: number) => {
    const first = new Date(Date.UTC(year, monthIndex, 1));
    const firstFri = 1 + ((5 - first.getUTCDay() + 7) % 7);
    return new Date(Date.UTC(year, monthIndex, firstFri + 7 + 3));
  };
  const today = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  let d = monday(today.getUTCFullYear(), today.getUTCMonth());
  if (d.getTime() <= today.getTime()) d = monday(today.getUTCFullYear(), today.getUTCMonth() + 1);
  return ymd(d);
}

export function axisLabel(ymd: string): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const [y, m] = ymd.split('-').map(Number);
  if (!y || !m) return ymd;
  return `${months[m - 1]}-${String(y).slice(2)}`;
}

export function kpiDelta(live: number, prior: number | null): { delta: number | null; deltaPct: number | null } {
  if (prior == null) return { delta: null, deltaPct: null };
  const delta = money(live - prior);
  const deltaPct = prior === 0 ? null : Math.round(((live - prior) / prior) * 1e8) / 1e8;
  return { delta, deltaPct };
}

export type WfsHistoryPoint = {
  date: string;
  label: string;
  totalEquity: number;
  availableCash: number;
};

export type SnapPoint = {
  date: string;
  totalEquity: number;
  availableCash: number;
  goelEquity: number;
  goelCash: number;
  goelAr: number;
  goelAp: number;
  goelDcEquity: number;
  goelDcCash: number;
  goelDcAr: number;
  goelDcAp: number;
  dcbEquity: number;
  dcbCash: number;
  dcbAr: number;
  dcbAp: number;
};

export const WFS_HISTORY_RANGES = ['3m', '6m', '12m', 'all'] as const;
export type WfsHistoryRange = (typeof WFS_HISTORY_RANGES)[number];

export const WFS_HISTORY_PRESETS: { id: WfsHistoryRange; label: string }[] = [
  { id: '3m', label: 'Last 3 months' },
  { id: '6m', label: 'Last 6 months' },
  { id: '12m', label: 'Last 12 months' },
  { id: 'all', label: 'All history' },
];

function isYmd(raw: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) && !Number.isNaN(Date.parse(`${raw}T00:00:00Z`));
}

function addMonths(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + delta, d)).toISOString().slice(0, 10);
}

export function resolveHistoryWindow(
  rangeRaw?: string,
  fromRaw?: string,
  toRaw?: string,
  today = new Date().toISOString().slice(0, 10),
): { range: WfsHistoryRange | 'custom'; from: string | null; to: string | null } {
  const from = fromRaw && isYmd(fromRaw) ? fromRaw : null;
  const to = toRaw && isYmd(toRaw) ? toRaw : null;
  if (from || to) return { range: 'custom', from, to };
  const range = (WFS_HISTORY_RANGES as readonly string[]).includes(rangeRaw ?? '')
    ? (rangeRaw as WfsHistoryRange)
    : '12m';
  if (range === 'all') return { range, from: null, to: today };
  const months = range === '3m' ? 3 : range === '6m' ? 6 : 12;
  return { range, from: addMonths(today, -months), to: today };
}

export function filterHistory<T extends { date: string }>(
  rows: T[],
  window: { from: string | null; to: string | null },
): T[] {
  return rows.filter((r) => {
    if (!r.date) return false;
    if (window.from && r.date < window.from) return false;
    if (window.to && r.date > window.to) return false;
    return true;
  });
}

/** Dashboard Pro Loans v44 — 6 Excel charts (2×3). `snaps` already date-filtered. */
export function v44Charts(snaps: SnapPoint[], live: WfsCompanyRow[]) {
  return {
    equityCash: snaps.map((r) => ({
      date: r.date,
      label: axisLabel(r.date),
      totalEquity: money(r.totalEquity),
      availableCash: money(r.availableCash),
    })),
    arVsAp: live
      .filter((r) => r.ar != null || r.ap != null)
      .map((r) => ({ key: r.key, label: r.label, ar: r.ar ?? 0, ap: r.ap ?? 0 })),
    equityByCompany: snaps.map((r) => ({
      date: r.date,
      label: axisLabel(r.date),
      goel: money(r.goelEquity),
      dcb: money(r.dcbEquity),
      goelDc: money(r.goelDcEquity),
      other: money(r.totalEquity - r.goelEquity - r.dcbEquity - r.goelDcEquity),
    })),
    arAging: live
      .filter((r) => r.agingAr)
      .map((r) => ({ key: r.key, label: r.label, ...r.agingAr! })),
    aging: agingTable(live),
    cashMix: live.map((r) => ({ key: r.key, label: r.label, availCash: r.availCash })),
    arByCompany: snaps.map((r) => ({
      date: r.date,
      label: axisLabel(r.date),
      goel: money(r.goelAr),
      dcb: money(r.dcbAr),
      goelDc: money(r.goelDcAr),
    })),
    apByCompany: snaps.map((r) => ({
      date: r.date,
      label: axisLabel(r.date),
      goel: money(r.goelAp),
      dcb: money(r.dcbAp),
      goelDc: money(r.goelDcAp),
    })),
  };
}

export function isWfsCompanyKey(raw: string): raw is WfsCompanyKey {
  return (WFS_COMPANY_KEYS as readonly string[]).includes(raw);
}

export function companyByPlaidName(name: string): WfsCompanyDef | undefined {
  const n = name.trim().toLowerCase();
  return WFS_COMPANIES.find((c) => c.plaidCompanies.some((p) => p.toLowerCase() === n));
}
