/**
 * Coverage: Specs Plumb Insulation types × Trimble company catalog.
 * Usage: npx ts-node --transpile-only scripts/report-spec-insulation-dims.ts
 */
import 'dotenv/config';
import * as ExcelJS from 'exceljs';
import * as path from 'path';
import * as sql from 'mssql';
import { implyMaterialFields } from '../src/bidding/process/spec-sheet';
import { resolveMaterial, type HelperMapEntry } from '../src/bidding/specs/specs-engine';
import {
  expandSpecMaterialsForKind,
  specSheetExcelMaterials,
  type ExcelSpecMaterial,
  type TrimbleCatalogRow,
} from '../src/bidding/specs/spec-trimble-materials';

function cell(c: ExcelJS.Cell): unknown {
  const v = c.value;
  if (v == null) return null;
  if (typeof v === 'object' && v !== null) {
    if ('result' in v) return (v as { result: unknown }).result;
    if ('richText' in v) {
      return (v as { richText: { text: string }[] }).richText.map((t) => t.text).join('');
    }
    if ('text' in v) return (v as { text: string }).text;
  }
  return v;
}
const s = (v: unknown) => String(v ?? '').trim();

function envPassword(): string {
  let password = process.env.DB_PASSWORD ?? '';
  if (password.length && (password.startsWith('"') || password.startsWith("'"))) {
    password = password.slice(1, -1);
  }
  return password;
}

async function loadTrimbleSql(): Promise<TrimbleCatalogRow[] | null> {
  const host = process.env.DB_HOST;
  if (!host) return null;
  const pool = await sql.connect({
    server: host,
    port: parseInt(process.env.DB_PORT || '1433', 10),
    user: process.env.DB_USERNAME,
    password: envPassword(),
    database: process.env.DB_DATABASE,
    options: {
      encrypt: process.env.DB_ENCRYPT === 'true',
      trustServerCertificate: process.env.DB_TRUST_CERT !== 'false',
    },
    requestTimeout: 120000,
  });
  try {
    const rs = await pool.request().query(`
      SELECT [Record ID] AS recordId, [Item Name] AS itemName, [Units] AS units
      FROM dbo.Trimble_CompanyItems
    `);
    return (rs.recordset || [])
      .map((r: { recordId?: unknown; itemName?: unknown; units?: unknown }) => ({
        recordId: r.recordId == null ? '' : String(r.recordId),
        itemName: String(r.itemName ?? '').trim(),
        units: String(r.units ?? '').trim(),
      }))
      .filter((r: TrimbleCatalogRow) => r.itemName);
  } finally {
    await pool.close();
  }
}

async function loadTrimbleXlsx(): Promise<TrimbleCatalogRow[]> {
  const co = new ExcelJS.Workbook();
  await co.xlsx.readFile(path.join(__dirname, '..', 'Company_Items.xlsx'));
  const ws = co.worksheets[0];
  const trimble: TrimbleCatalogRow[] = [];
  ws.eachRow({ includeEmpty: false }, (row, n) => {
    if (n === 1) return;
    const itemName = s(cell(row.getCell(2)));
    if (!itemName) return;
    trimble.push({
      recordId: String(cell(row.getCell(1)) ?? n),
      itemName,
      units: s(cell(row.getCell(6))),
    });
  });
  return trimble;
}

async function main() {
  const est = new ExcelJS.Workbook();
  await est.xlsx.readFile(path.join(__dirname, '..', 'EstimationFile.xlsx'));
  const list = est.getWorksheet('List');
  const hm = est.getWorksheet('helpermap');
  if (!list || !hm) throw new Error('Missing List/helpermap');

  const prefixes: Array<{ rawPrefix: string; baseName: string }> = [];
  for (let r = 2; r <= 40; r++) {
    const rawPrefix = s(cell(hm.getRow(r).getCell(5)));
    const baseName = s(cell(hm.getRow(r).getCell(6)));
    if (rawPrefix && baseName) prefixes.push({ rawPrefix, baseName });
  }
  const helpers: HelperMapEntry[] = [];
  const seenH = new Set<string>();
  for (let r = 2; r <= 100; r++) {
    const specPhrase = s(cell(hm.getRow(r).getCell(1)));
    const keyword = s(cell(hm.getRow(r).getCell(2)));
    if (!specPhrase || !keyword) continue;
    const key = specPhrase.toLowerCase();
    if (seenH.has(key)) continue;
    seenH.add(key);
    let best: { rawPrefix: string; baseName: string } | null = null;
    const lower = specPhrase.toLowerCase();
    for (const p of prefixes) {
      if (!lower.includes(p.rawPrefix.toLowerCase())) continue;
      if (!best || p.rawPrefix.length > best.rawPrefix.length) best = p;
    }
    helpers.push({
      specPhrase,
      keyword,
      keyword2: s(cell(hm.getRow(r).getCell(3))) || null,
      rawPrefix: best?.rawPrefix ?? null,
      baseName: best?.baseName ?? null,
    });
  }

  const excel: ExcelSpecMaterial[] = [];
  const add = (kind: string, description: string, code: string, fieldJacket: string) => {
    if (!description || description === '---' || description === 'System') return;
    if (!code || code === '---') return;
    if (excel.some((x) => x.kind === kind && x.description.toLowerCase() === description.toLowerCase())) {
      return;
    }
    const implied = implyMaterialFields(description, fieldJacket || null);
    excel.push({
      id: excel.length + 1,
      description,
      code,
      kind,
      facing: implied.facing,
      jacket: implied.jacket,
      thicknessIn: implied.thicknessIn,
      weight: implied.weight,
      sortOrder: excel.length,
    });
  };
  for (let r = 2; r <= 80; r++) {
    const row = list.getRow(r);
    add('hydronic', s(cell(row.getCell(52))), s(cell(row.getCell(46))), s(cell(row.getCell(48))));
  }
  for (let r = 2; r <= 80; r++) {
    const row = list.getRow(r);
    add('plumbing', s(cell(row.getCell(67))), s(cell(row.getCell(68))), '');
  }
  for (let r = 2; r <= 80; r++) {
    const row = list.getRow(r);
    add('duct', s(cell(row.getCell(70))), s(cell(row.getCell(69))), '');
  }

  const insulation = specSheetExcelMaterials(excel);
  let source = 'sql Trimble_CompanyItems';
  let trimble: TrimbleCatalogRow[] = [];
  try {
    const sqlRows = await loadTrimbleSql();
    if (sqlRows?.length) trimble = sqlRows;
    else throw new Error('empty');
  } catch {
    source = 'Company_Items.xlsx';
    trimble = await loadTrimbleXlsx();
  }

  const opts = expandSpecMaterialsForKind(insulation, helpers, trimble);
  const line = (o: (typeof opts)[0]) => {
    const res = resolveMaterial(o.description, helpers);
    const sizes = o.sizes.map((x) => x.value).join(',') || '—';
    const thick = o.thicknesses.map((x) => x.value).join(',') || '—';
    return `${o.code.padEnd(5)} ${String(o.skuCount).padStart(5)}  sz=${String(o.sizes.length).padStart(2)} [${sizes}]  th=${String(o.thicknesses.length).padStart(2)} [${thick}]  kw=${res.keyword || 'NONE'}  ${o.description}`;
  };

  const both = opts.filter((o) => o.sizes.length && o.thicknesses.length);
  const thickOnly = opts.filter((o) => !o.sizes.length && o.thicknesses.length);
  const sizeOnly = opts.filter((o) => o.sizes.length && !o.thicknesses.length);
  const skuNoDims = opts.filter((o) => o.skuCount > 0 && !o.sizes.length && !o.thicknesses.length);
  const none = opts.filter((o) => o.skuCount === 0);

  console.log(`catalog=${source} skus=${trimble.length} insulationTypes=${opts.length}`);
  console.log(`\n=== SIZE + THICKNESS (${both.length}) — FE shows both ===`);
  for (const o of both) console.log(line(o));
  console.log(`\n=== THICKNESS ONLY (${thickOnly.length}) — wrap/roll; size blank OK ===`);
  for (const o of thickOnly) console.log(line(o));
  console.log(`\n=== SIZE ONLY (${sizeOnly.length}) ===`);
  for (const o of sizeOnly) console.log(line(o));
  console.log(`\n=== SKU HIT, NO PARSED DIMS (${skuNoDims.length}) ===`);
  for (const o of skuNoDims) console.log(line(o));
  console.log(`\n=== NO TRIMBLE MATCH (${none.length}) — no size/thick to show ===`);
  for (const o of none) console.log(line(o));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
