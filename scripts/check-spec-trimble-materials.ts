/**
 * Spec-sheet materials: Excel List per kind (no HVAC/plumbing/duct zip) + Trimble SKU match.
 * Usage: npx ts-node --transpile-only scripts/check-spec-trimble-materials.ts
 */
import * as ExcelJS from 'exceljs';
import * as path from 'path';
import { implyMaterialFields, parseFamilyQuery } from '../src/bidding/process/spec-sheet';
import { resolveMaterial, type HelperMapEntry } from '../src/bidding/specs/specs-engine';
import {
  companyItemMatchesExcel,
  expandSpecMaterialsForKind,
  specSheetExcelMaterials,
  type ExcelSpecMaterial,
  type TrimbleCatalogRow,
} from '../src/bidding/specs/spec-trimble-materials';

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

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

function isDuctEncodedLabel(description: string): boolean {
  return /^\d+(?:\.\d+)?"\s/.test(description.trim());
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
  const matchPrefix = (phrase: string) => {
    const lower = phrase.toLowerCase();
    let best: { rawPrefix: string; baseName: string } | null = null;
    for (const p of prefixes) {
      if (!lower.includes(p.rawPrefix.toLowerCase())) continue;
      if (!best || p.rawPrefix.length > best.rawPrefix.length) best = p;
    }
    return best;
  };
  const helpers: HelperMapEntry[] = [];
  const seenH = new Set<string>();
  for (let r = 2; r <= 100; r++) {
    const specPhrase = s(cell(hm.getRow(r).getCell(1)));
    const keyword = s(cell(hm.getRow(r).getCell(2)));
    if (!specPhrase || !keyword) continue;
    const key = specPhrase.toLowerCase();
    if (seenH.has(key)) continue;
    seenH.add(key);
    const mapped = matchPrefix(specPhrase);
    helpers.push({
      specPhrase,
      keyword,
      keyword2: s(cell(hm.getRow(r).getCell(3))) || null,
      rawPrefix: mapped?.rawPrefix ?? null,
      baseName: mapped?.baseName ?? null,
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

  const hydronic = excel.filter((m) => m.kind === 'hydronic');
  const plumbing = excel.filter((m) => m.kind === 'plumbing');
  const duct = excel.filter((m) => m.kind === 'duct');
  assert(hydronic.length >= 60 && plumbing.length >= 20 && duct.length >= 20, 'kind counts');
  assert(
    hydronic.every((m) => !isDuctEncodedLabel(m.description)),
    'HVAC spec-sheet labels must not be List BR numbered duct names',
  );
  assert(
    plumbing.every((m) => !isDuctEncodedLabel(m.description)),
    'plumbing spec-sheet labels must not be numbered duct names',
  );
  assert(
    duct.some((m) => isDuctEncodedLabel(m.description)),
    'duct kind keeps encoded names like 1.5" 3/4lb Duct Wrap',
  );

  const zip = expandSpecMaterialsForKind(hydronic, helpers, []);
  assert(zip[0].description === hydronic[0].description, 'empty catalog keeps Excel names');
  assert(zip[0].skuCount === 0 && zip[0].sizes.length === 0, 'empty catalog has no dims');
  assert(!zip.some((m) => isDuctEncodedLabel(m.description)), 'HVAC dropdown without Trimble has no duct-encoded labels');

  const ins = specSheetExcelMaterials(excel);
  assert(ins.every((m) => !isDuctEncodedLabel(m.description)), 'insulation list is Specs Plumb H types, not 1.5" 3/4lb rows');
  assert(ins.some((m) => m.code === 'FGA'), 'shared list includes Fiberglass with ASJ');
  assert(ins.some((m) => /fiberglass duct wrap/i.test(m.description)), 'shared list includes FIBERGLASS DUCT WRAP');
  const insOpts = expandSpecMaterialsForKind(ins, helpers, []);
  assert(insOpts.every((o) => o.family && o.layer), 'family+layer classified without Trimble');
  assert(
    insOpts.filter((o) => o.family === 'fiberglass' && o.layer === 'insulation').length > 0,
    'fiberglass insulation options exist',
  );

  const fga = hydronic.find((m) => m.code === 'FGA');
  assert(fga, 'FGA in HVAC list');
  const fgp = hydronic.find((m) => /pvc/i.test(m.description) && /fiberglass/i.test(m.description));
  assert(fgp, 'Fiberglass w/ PVC in HVAC list');

  const pipeSku: TrimbleCatalogRow = {
    recordId: '1',
    itemName: '5.8" X 1" ASJ John Manville (JM) Fiberglass Pipe Covering (PC)',
    units: 'Linear Foot',
  };
  const pipeSku2: TrimbleCatalogRow = {
    recordId: '2',
    itemName: '2" X 1.5" ASJ JM Fiberglass Pipe Covering (PC)',
    units: 'Linear Foot',
  };
  const block: TrimbleCatalogRow = {
    recordId: '3',
    itemName: '12" X 24" X 2" Fiberglass Block',
    units: 'Each',
  };
  const wrapSku: TrimbleCatalogRow = {
    recordId: '4',
    itemName: `01-1/2" X 48" X 100' 3/4# Fiberglass Duct Wrap FSK`,
    units: 'ROLL',
  };
  assert(!companyItemMatchesExcel(block, fga!, helpers), 'Fiberglass Block (Each) does not match FGA');
  assert(companyItemMatchesExcel(pipeSku, fga!, helpers), 'ASJ pipe covering matches FGA');
  assert(
    companyItemMatchesExcel(pipeSku, fgp!, helpers),
    'PVC is a field jacket — FGP matches fiberglass SKUs without PVC in the name',
  );

  const synth = [pipeSku, pipeSku2, block, wrapSku];
  const hvacSynth = expandSpecMaterialsForKind(hydronic, helpers, synth);
  assert(hvacSynth.length === hydronic.length, 'one dropdown row per Excel type');
  const fgaOpt = hvacSynth.find((o) => o.code === 'FGA');
  assert(fgaOpt?.description === fga!.description, 'FGA description stays the List type');
  assert(fgaOpt && fgaOpt.skuCount === 2, `FGA skuCount 2, got ${fgaOpt?.skuCount}`);
  assert(fgaOpt.sizes.some((x) => x.value === 5.8) && fgaOpt.sizes.some((x) => x.value === 2), 'FGA sizes from SKU names');
  assert(
    fgaOpt.thicknesses.some((x) => x.value === 1) && fgaOpt.thicknesses.some((x) => x.value === 1.5),
    'FGA thicknesses from SKU names',
  );
  const fgpOpt = hvacSynth.find((o) => o.id === fgp!.id || o.code === fgp!.code);
  assert(fgpOpt && fgpOpt.skuCount >= 2, 'FGP gets the same fiberglass pipe SKUs');

  const ductSynth = expandSpecMaterialsForKind(specSheetExcelMaterials(excel), helpers, synth);
  const duw = ductSynth.find((o) => o.code === 'DUW');
  assert(duw && duw.skuCount >= 1, 'FIBERGLASS DUCT WRAP matches ROLL catalog rows');
  assert(duw!.sizes.length === 0, 'duct wrap type has no pipe NPS');
  assert(duw!.thicknesses.some((x) => x.value === 1.5), 'duct wrap thickness 1.5" from Trimble name');

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
  assert(trimble.length > 100, 'Company_Items loaded');

  const hvacOpts = expandSpecMaterialsForKind(hydronic, helpers, trimble);
  assert(hvacOpts.length === hydronic.length, 'catalog does not explode the material dropdown');
  assert(
    hvacOpts.every((o) => !isDuctEncodedLabel(o.description) && !isDuctEncodedLabel(o.excelDescription)),
    'HVAC dropdown must not be List BR numbered duct names',
  );
  const fgaLive = hvacOpts.find((o) => o.code === 'FGA');
  assert(fgaLive && fgaLive.skuCount > 10, `FGA should match pipe-covering SKUs, got ${fgaLive?.skuCount}`);
  assert(fgaLive!.sizes.length > 5, 'FGA has a size list');
  assert(!fgaLive!.thicknesses.some((t) => t.value >= 12), 'no roll-width junk as thickness');

  const ductOpts = expandSpecMaterialsForKind(specSheetExcelMaterials(excel), helpers, trimble);
  assert(ductOpts.every((o) => !isDuctEncodedLabel(o.description)), 'insulation list never lists 1.5" 3/4lb rows');
  const wrapLive = ductOpts.find((o) => o.code === 'DUW');
  assert(wrapLive && wrapLive.skuCount >= 1, 'DUW matches Roll rows in Company_Items');
  assert(ductOpts.every((o) => o.family && o.insulationFamily === o.family && o.layer), 'family+layer on every option');
  const fgIns = ductOpts.filter((o) => o.family === 'fiberglass' && o.layer === 'insulation');
  assert(fgIns.length > 0, 'fiberglass + insulation is not empty');
  assert(fgIns.some((o) => o.code === 'FGA'), 'FGA is fiberglass insulation');
  assert(parseFamilyQuery('Mineral wool') === 'mineral_wool', 'label parses to family id');
  const byFam: Record<string, number> = {};
  for (const o of ductOpts.filter((x) => x.layer === 'insulation')) {
    byFam[o.family] = (byFam[o.family] || 0) + 1;
  }

  const pc = '5.8" X 1" ASJ John Manville (JM) Fiberglass Pipe Covering (PC)';
  const resolved = resolveMaterial(pc, helpers);
  assert(/fiberglass with asj/i.test(resolved.specPhrase), `Trimble name resolves to FGA, got ${resolved.specPhrase}`);

  console.log(
    `ok: hydronic=${hydronic.length} plumbing=${plumbing.length} duct=${duct.length} ` +
      `fgaSkus=${fgaLive!.skuCount} fgaSizes=${fgaLive!.sizes.length} ductDuWrolls=${wrapLive!.skuCount} ` +
      `fgInsulation=${fgIns.length} insulationByFamily=${JSON.stringify(byFam)}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
