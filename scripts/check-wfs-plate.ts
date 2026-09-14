/**
 * Self-check: Dashboard Pro Loans v44 math vs Mohamed's Excel snapshot.
 * Usage: npx ts-node scripts/check-wfs-plate.ts
 */
import {
  WFS_COMPANIES,
  addAging,
  agingTable,
  availCredit,
  companyByPlaidName,
  companyPlate,
  emptyAging,
  emptyStatic,
  groupPlate,
  v44Charts,
  filterHistory,
  isWfsCompanyKey,
  resolveHistoryWindow,
  kpiDelta,
  money,
  nextSnapshotDate,
} from '../src/wfs/wfs-plate';

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

function eq(a: number, b: number, msg: string): void {
  if (money(a) !== money(b)) throw new Error(`${msg}: ${a} !== ${b}`);
}

eq(availCredit(4600000, 3700000), 900000, 'loc credit');
eq(availCredit(0, 2216187), 0, 'g3 loc 0 → credit 0');

const goel = companyPlate(
  WFS_COMPANIES[0],
  {
    ar: { current: 1677188.69, d31: 1379488.4, d61: 1224508.7, d90: 2770530.31, retainage: 1320536.13, total: 8372252.23 },
    ap: { current: 530390.24, d31: 501565.69, d61: 392489.66, d90: 697113, retainage: 119013.2, total: 2240571.79 },
    plaidOperating: 2422593.01,
  },
  { ...emptyStatic(), locLimit: 4600000, locDrawn: 3700000, pnotes: 1200000, equipmentLoan: 4132.56 },
);
eq(goel.availCredit, 900000, 'goel avail credit');
eq(goel.otherLoans, 4132.56, 'goel equipment in other loans');
eq(goel.totalDebt, 4904132.56, 'goel total debt = notes + loc drawn + equipment');
eq(goel.netArAp ?? 0, 6131680.44, 'goel net AR-AP');
eq(goel.equity, 3650140.89, 'v44 goel equity = net − debt + bank');
eq(goel.availCash, 2422593.01, 'v44 avail cash = bank (not + unused LOC)');

const dcb = companyPlate(
  WFS_COMPANIES[1],
  {
    ar: { current: 742644.37, d31: 546454.27, d61: 366841.07, d90: 648498.3, retainage: 923295.64, total: 3227733.65 },
    ap: { current: 45546.77, d31: 3250, d61: 4286, d90: 1233700.7, retainage: 0, total: 1286783.47 },
    plaidOperating: 534886.54,
  },
  { ...emptyStatic(), locLimit: 500000, extraCash: 14516.15 },
);
eq(dcb.bank, 549402.69, 'dcb bank + fidelity');
eq(dcb.availCredit, 500000, 'dcb unused LOC');
eq(dcb.equity, 2490352.87, 'dcb equity');
eq(dcb.availCash, 549402.69, 'dcb avail cash = bank');

const goelDc = companyPlate(
  WFS_COMPANIES[2],
  {
    ar: { current: 530914.01, d31: 811882.58, d61: 237881.36, d90: 253724.69, retainage: 862098.05, total: 2696500.69 },
    ap: { current: -126706.36, d31: 220251.01, d61: 1157.29, d90: 307400.34, retainage: 13800, total: 415902.28 },
    plaidOperating: 1767775.9,
  },
  { ...emptyStatic(), locLimit: 200000 },
);
eq(goelDc.equity, 4048374.31, 'goel dc equity');
eq(goelDc.availCash, 1767775.9, 'goel dc avail cash = bank');

const ati = companyPlate(WFS_COMPANIES[3], { ar: null, ap: null, plaidOperating: 141147.03 }, emptyStatic());
eq(ati.equity, 141147.03, 'ati equity = bank');

const g3 = companyPlate(
  WFS_COMPANIES[4],
  { ar: null, ap: null, plaidOperating: 275959.66 },
  { ...emptyStatic(), extraCash: 60916.28, propertyValue: 2500000, mortgages: 2216187 },
);
eq(g3.bank, 336875.94, 'g3 bank');
eq(g3.borrowing, 2216187, 'g3 mortgages');
eq(g3.availCredit, 0, 'g3 avail credit stays 0');
eq(g3.equity, 620688.94, 'g3 equity = net − debt + bank + property');

const dmvDemo = companyPlate(WFS_COMPANIES[5], { ar: null, ap: null, plaidOperating: 21324.42 }, emptyStatic());
const dmvInsul = companyPlate(WFS_COMPANIES[6], { ar: null, ap: null, plaidOperating: 14185.13 }, emptyStatic());

const totals = groupPlate([goel, dcb, goelDc, ati, g3, dmvDemo, dmvInsul]);
eq(totals.bank, 5253304.12, 'group bank');
eq(totals.availCash, 5253304.12, 'v44 KPI available cash = bank');
eq(totals.equity, 10986213.59, 'v44 group equity');
eq(totals.otherLoans, 4132.56, 'equipment in other loans');
eq(totals.totalDebt, 7120319.56, 'group total debt');
eq(totals.ar, 14296486.57, 'group AR');
eq(totals.ap, 3943257.54, 'group AP');
eq(totals.netArAp, 10353229.03, 'group net');

const aging = agingTable([goel, dcb, goelDc]);
assert(aging.length === 6 && aging[0].type === 'ar' && aging[1].type === 'ap', 'aging box rows');
eq(addAging(goel.agingAr ?? emptyAging(), addAging(dcb.agingAr ?? emptyAging(), goelDc.agingAr ?? emptyAging())).total, 14296486.57, 'aging AR sum');

const dEq = kpiDelta(10986213.59, 10299475.82);
eq(dEq.delta ?? 0, 686737.77, 'v44 equity Δ vs Aug 31');
assert(dEq.deltaPct != null && Math.abs(dEq.deltaPct - 0.06667696) < 1e-6, 'v44 equity Δ%');
const snap = (
  date: string,
  totalEquity: number,
  availableCash: number,
  goel: { equity: number; ar: number; ap: number },
  dcb: { equity: number; ar: number; ap: number },
  goelDc: { equity: number; ar: number; ap: number },
) => ({
  date,
  totalEquity,
  availableCash,
  goelEquity: goel.equity,
  goelCash: 0,
  goelAr: goel.ar,
  goelAp: goel.ap,
  goelDcEquity: goelDc.equity,
  goelDcCash: 0,
  goelDcAr: goelDc.ar,
  goelDcAp: goelDc.ap,
  dcbEquity: dcb.equity,
  dcbCash: 0,
  dcbAr: dcb.ar,
  dcbAp: dcb.ap,
});
const charts = v44Charts(
  [
    snap(
      '2026-08-31',
      10299475.82,
      5528271.36,
      { equity: 1, ar: 8, ap: 2 },
      { equity: 2, ar: 3, ap: 1 },
      { equity: 3, ar: 2, ap: 1 },
    ),
    snap(
      '2026-09-07',
      10986213.59,
      5253304.12,
      { equity: goel.equity, ar: goel.ar ?? 0, ap: goel.ap ?? 0 },
      { equity: dcb.equity, ar: dcb.ar ?? 0, ap: dcb.ap ?? 0 },
      { equity: goelDc.equity, ar: goelDc.ar ?? 0, ap: goelDc.ap ?? 0 },
    ),
  ],
  [goel, dcb, goelDc, ati, g3, dmvDemo, dmvInsul],
);
assert(charts.equityCash.length === 2 && charts.equityCash[1].label === 'Sep-26', 'equity vs cash labels');
assert(charts.arVsAp.length === 3 && charts.arVsAp[0].key === 'goel', 'AR vs AP latest');
assert(charts.equityByCompany[1].other === money(10986213.59 - goel.equity - dcb.equity - goelDc.equity), 'other equity');
assert(charts.arAging.length === 3 && charts.arAging[0].key === 'goel' && charts.arAging[0].total === goel.ar, 'AR aging stacks');
assert(charts.cashMix.length === 7 && charts.cashMix[0].availCash === goel.availCash, 'cash mix');
assert(charts.aging.length === 6 && charts.aging[0].type === 'ar', 'aging alias');
assert(charts.arByCompany[1].goel === goel.ar && charts.apByCompany[1].dcb === dcb.ap, 'AR/AP company trends');
const win = resolveHistoryWindow('3m', undefined, undefined, '2026-09-13');
assert(win.range === '3m' && win.from === '2026-06-13' && win.to === '2026-09-13', '3m window');
assert(filterHistory([{ date: '2026-05-01' }, { date: '2026-08-07' }], win).length === 1, 'history filter');
assert(resolveHistoryWindow(undefined, '2026-08-01', '2026-08-31').range === 'custom', 'custom from/to');

assert(nextSnapshotDate(new Date('2026-09-13T00:00:00Z')) === '2026-09-14', 'Mon after 2nd Fri Sep 2026');
assert(isWfsCompanyKey('goel') && !isWfsCompanyKey('siteline'), 'company key guard');
assert(companyByPlaidName('Goel Services, Inc.')?.key === 'goel', 'plaid name map');

console.log('check-wfs-plate: ok');
