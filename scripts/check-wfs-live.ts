/**
 * Live smoke: FoundationData + PlaidDB + Wfs_StaticItems → v44 plate.
 * Usage: npx ts-node scripts/check-wfs-live.ts
 */
// @ts-nocheck
import 'dotenv/config';
const sql = require('mssql');
import {
  WFS_COMPANIES,
  companyByPlaidName,
  companyPlate,
  emptyAging,
  emptyStatic,
  groupPlate,
  isWfsCompanyKey,
  money,
  type CompanyStatic,
  type WfsCompanyKey,
} from '../src/wfs/wfs-plate';

function n(v: unknown): number {
  const x = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(x) ? x : 0;
}

(async () => {
  let password = process.env.DB_PASSWORD || '';
  if (password.startsWith('"') || password.startsWith("'")) password = password.slice(1, -1);
  const pool = await sql.connect({
    server: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '1433', 10),
    user: process.env.DB_USERNAME,
    password,
    database: process.env.DB_DATABASE || 'GoFormzDB',
    options: {
      encrypt: process.env.DB_ENCRYPT === 'true',
      trustServerCertificate: process.env.DB_TRUST_CERT !== 'false',
    },
  });

  const staticRows = await pool.request().query(`SELECT CompanyKey, Kind, Amount FROM dbo.Wfs_StaticItems`);
  const byKey = {} as Record<WfsCompanyKey, CompanyStatic>;
  for (const def of WFS_COMPANIES) byKey[def.key] = emptyStatic();
  for (const r of staticRows.recordset) {
    if (!isWfsCompanyKey(r.CompanyKey)) continue;
    const row = byKey[r.CompanyKey];
    const amount = n(r.Amount);
    if (r.Kind === 'loc_limit') row.locLimit += amount;
    else if (r.Kind === 'loc_drawn') row.locDrawn += amount;
    else if (r.Kind === 'pnote') row.pnotes += amount;
    else if (r.Kind === 'extra_cash') row.extraCash += amount;
    else if (r.Kind === 'property_value') row.propertyValue += amount;
    else if (r.Kind === 'mortgage') row.mortgages += amount;
    else if (r.Kind === 'equipment_loan') row.equipmentLoan += amount;
  }

  const companies: ReturnType<typeof companyPlate>[] = [];
  for (const def of WFS_COMPANIES) {
    let ar = def.arView ? emptyAging() : null;
    let ap = def.apView ? emptyAging() : null;
    if (def.arView) {
      const q = await pool.request().query(`
        SELECT SUM([Current]) c, SUM([31-60 Days]) d31, SUM([61-90 Days]) d61,
               SUM([90+ Days]) d90, SUM(Retainage) ret, SUM(Total) tot
        FROM FoundationData.dbo.[${def.arView}]
      `);
      const x = q.recordset[0];
      ar = { current: money(n(x.c)), d31: money(n(x.d31)), d61: money(n(x.d61)), d90: money(n(x.d90)), retainage: money(n(x.ret)), total: money(n(x.tot)) };
    }
    if (def.apView) {
      const q = await pool.request().query(`
        SELECT SUM([Current]) c, SUM([31-60 Days]) d31, SUM([61-90 Days]) d61,
               SUM([90+ Days]) d90, SUM(Retainage) ret, SUM(Total) tot
        FROM FoundationData.dbo.[${def.apView}]
      `);
      const x = q.recordset[0];
      ap = { current: money(n(x.c)), d31: money(n(x.d31)), d61: money(n(x.d61)), d90: money(n(x.d90)), retainage: money(n(x.ret)), total: money(n(x.tot)) };
    }
    companies.push(companyPlate(def, { ar, ap, plaidOperating: 0 }, byKey[def.key]));
  }

  const plaid = await pool.request().query(`
    SELECT Company, current_balance FROM PlaidDB.dbo.vw_LatestPlaidBalances
    WHERE Business_Account_Type = 'Operating Account'
  `);
  const cash: Partial<Record<WfsCompanyKey, number>> = {};
  for (const r of plaid.recordset) {
    const def = companyByPlaidName(String(r.Company ?? ''));
    if (!def) continue;
    cash[def.key] = money((cash[def.key] ?? 0) + n(r.current_balance));
  }

  const live = WFS_COMPANIES.map((def, i) =>
    companyPlate(def, {
      ar: companies[i].agingAr,
      ap: companies[i].agingAp,
      plaidOperating: cash[def.key] ?? 0,
    }, byKey[def.key]),
  );
  const totals = groupPlate(live);
  if (!Number.isFinite(totals.equity) || !totals.ar) throw new Error('live plate empty');
  console.log('check-wfs-live: ok');
  console.log(JSON.stringify({
    equity: totals.equity,
    availCash: totals.availCash,
    ar: totals.ar,
    ap: totals.ap,
    companies: live.map((r) => ({ key: r.key, bank: r.bank, ar: r.ar, ap: r.ap, equity: r.equity })),
  }, null, 2));
  await pool.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
