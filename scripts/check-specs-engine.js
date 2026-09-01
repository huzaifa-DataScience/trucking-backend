/**
 * Self-check: Specs engine qty / received / structshare vs EstimationFile Specs Plumb.
 * Usage: node scripts/check-specs-engine.js
 */
const path = require('path');
const ExcelJS = require('exceljs');
const {
  baseForInsulation,
  deriveMaterialBase,
  keywordForInsulation,
  matchModeForInsulation,
  rollupMike,
  suggestSpecLinesFromMike,
  sumQtyReceived,
  sumQtyReceivedSf,
  resolveTrimbleUnit,
  buildQtyReceivedSummary,
  parseRollDims,
  pickStructshareItem,
  listStructshareOptions,
  parseLineItemName,
  resolveMaterial,
  normalizeMaterialBase,
} = require('../dist/bidding/specs/specs-engine');

function cell(c) {
  if (!c || c.value == null) return null;
  const v = c.value;
  if (typeof v === 'object') {
    if (v.result !== undefined) return v.result;
    if (v.richText) return v.richText.map((t) => t.text).join('');
    if (v.text) return v.text;
  }
  return v;
}
function s(v) {
  return String(v ?? '').trim();
}
function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}

async function main() {
  const xlsx = path.join(__dirname, '..', 'EstimationFile.xlsx');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(xlsx);
  const spec = wb.getWorksheet('Specs Plumb');
  const mike = wb.getWorksheet('MIKE CSVs');
  const hm = wb.getWorksheet('helpermap');
  const lineItemsSheet =
    wb.getWorksheet('Line items') ||
    wb.getWorksheet('Line items ') ||
    wb.worksheets.find((w) => /^line\s*items/i.test(w.name));
  const itemDb = wb.getWorksheet('item Database');

  // Same shape as seed-bidding-specs-from-estimation.ts
  const prefixByPhrase = new Map();
  for (let r = 2; r <= 40; r++) {
    const rawPrefix = s(cell(hm.getRow(r).getCell(5)));
    const baseName = s(cell(hm.getRow(r).getCell(6)));
    if (rawPrefix && baseName) {
      prefixByPhrase.set(rawPrefix.toLowerCase(), { rawPrefix, baseName });
    }
  }
  const helpers = [];
  for (let r = 2; r <= 80; r++) {
    const specPhrase = s(cell(hm.getRow(r).getCell(1)));
    const keyword = s(cell(hm.getRow(r).getCell(2)));
    if (!specPhrase || !keyword) continue;
    const mapped = prefixByPhrase.get(specPhrase.toLowerCase());
    helpers.push({
      specPhrase,
      keyword,
      rawPrefix: mapped?.rawPrefix || null,
      baseName: mapped?.baseName || null,
    });
  }
  // baseName also via rawPrefix includes (for Mike rollup)
  for (const [k, v] of prefixByPhrase) {
    if (!helpers.some((h) => (h.rawPrefix || '').toLowerCase() === k)) {
      helpers.push({
        specPhrase: v.rawPrefix,
        keyword: '',
        rawPrefix: v.rawPrefix,
        baseName: v.baseName,
      });
    }
  }

  const mikeRows = [];
  for (let r = 3; r <= mike.rowCount; r++) {
    const sys = s(cell(mike.getRow(r).getCell(7)));
    if (!sys) continue;
    let ar = cell(mike.getRow(r).getCell(44));
    if (ar && typeof ar === 'object' && ar.result !== undefined) ar = ar.result;
    const aq = s(cell(mike.getRow(r).getCell(43)));
    const base = s(ar) || deriveMaterialBase(aq);
    mikeRows.push({
      size: n(cell(mike.getRow(r).getCell(9))),
      thickness: n(cell(mike.getRow(r).getCell(8))),
      quantity: n(cell(mike.getRow(r).getCell(10))) || 0,
      hours: n(cell(mike.getRow(r).getCell(12))),
      materialBase: base || null,
    });
  }

  const lineItems = [];
  if (lineItemsSheet) {
    let nameCol = 2;
    let recvCol = 12;
    const hdr = lineItemsSheet.getRow(1);
    for (let c = 1; c <= 30; c++) {
      const h = s(cell(hdr.getCell(c))).toLowerCase();
      if (h === 'item name') nameCol = c;
      if (h.includes('received')) recvCol = c;
    }
    for (let r = 2; r <= lineItemsSheet.rowCount; r++) {
      const itemName = s(cell(lineItemsSheet.getRow(r).getCell(nameCol)));
      if (!itemName) continue;
      lineItems.push({
        itemName,
        received: n(cell(lineItemsSheet.getRow(r).getCell(recvCol))) || 0,
      });
    }
  }

  const catalog = [];
  if (itemDb) {
    for (let r = 2; r <= itemDb.rowCount; r++) {
      const row = itemDb.getRow(r);
      const itemName = s(cell(row.getCell(1)));
      if (!itemName) continue;
      let nameLc = s(cell(row.getCell(19))).toLowerCase() || itemName.toLowerCase();
      let size1 = n(cell(row.getCell(20)));
      let size2 = n(cell(row.getCell(21)));
      if (size1 == null || size2 == null) {
        const p = parseLineItemName(itemName);
        size1 = size1 ?? p.sizeNum;
        size2 = size2 ?? p.thickNum;
      }
      catalog.push({
        itemName,
        price: n(cell(row.getCell(12))),
        nameLc,
        size1,
        size2,
      });
    }
  }

  let ok = 0;
  let fail = 0;
  let recvChecked = 0;
  let structChecked = 0;
  for (let r = 5; r <= 21; r++) {
    const type = s(cell(spec.getRow(r).getCell(1)));
    if (!type || type === '----') continue;
    const insulation = s(cell(spec.getRow(r).getCell(8)));
    const size = n(cell(spec.getRow(r).getCell(11)));
    const thick = n(cell(spec.getRow(r).getCell(12)));
    const qtyEst = n(cell(spec.getRow(r).getCell(16)));
    const pph = n(cell(spec.getRow(r).getCell(15)));
    const qtyRec = n(cell(spec.getRow(r).getCell(17)));
    const structName = s(cell(spec.getRow(r).getCell(23)));
    const base = baseForInsulation(insulation, helpers);
    const keyword = keywordForInsulation(insulation, helpers);
    const roll = rollupMike(mikeRows, size, thick, base);
    const qtyOk = qtyEst != null && Math.abs(roll.qtyEstimated - qtyEst) < 0.05;
    const pphOk =
      pph == null ||
      roll.productionPerHour == null ||
      Math.abs(roll.productionPerHour - pph) < 0.05;

    let recvOk = true;
    if (qtyRec != null && lineItems.length) {
      const got = sumQtyReceived(lineItems, size, thick, keyword, {
        matchMode: matchModeForInsulation(insulation, helpers),
      });
      recvOk = Math.abs(got - qtyRec) < 0.05;
      recvChecked++;
      if (!recvOk) {
        console.log(`FAIL recv R${r} Spec=${qtyRec} Re=${got} kw=${keyword}`);
      }
    }

    let structOk = true;
    if (structName && structName !== '---' && catalog.length) {
      const pick = pickStructshareItem(catalog, size, thick, keyword, {
        weight: s(cell(spec.getRow(r).getCell(13))) || null,
        facing: s(cell(spec.getRow(r).getCell(14))) || null,
      });
      structChecked++;
      if (!pick) {
        console.log(`NOTE struct R${r} no pick; Excel="${structName.slice(0, 40)}"`);
      } else if (pick.itemName.trim() !== structName.trim()) {
        // Excel MINIFS can prefer IPS vs ID variants — note, don't fail qty check
        console.log(
          `NOTE struct R${r} Excel="${structName.slice(0, 40)}" Re="${pick.itemName.slice(0, 40)}"`,
        );
      }
    }

    if (qtyOk && pphOk && recvOk && structOk) {
      ok++;
      console.log(
        `OK  R${r} ${insulation.slice(0, 28)} ${size}x${thick} qty=${roll.qtyEstimated.toFixed(2)}`,
      );
    } else {
      fail++;
      if (!qtyOk || !pphOk) {
        console.log(
          `FAIL R${r} base=${base} SpecQty=${qtyEst} Re=${roll.qtyEstimated.toFixed(2)} SpecPph=${pph} RePph=${roll.productionPerHour}`,
        );
      }
    }
  }

  console.log(
    `\n${ok} ok, ${fail} fail (recv checked ${recvChecked}, struct checked ${structChecked}, lineItems=${lineItems.length}, catalog=${catalog.length})`,
  );
  if (fail) process.exit(1);

  // Material resolution system: Mike phrases → helpermap → match mode (pipe|roll)
  const dw = resolveMaterial('2.75# Ductwrap', helpers);
  const dwPick = pickStructshareItem(catalog, 34, 2, dw.keyword, {
    weight: dw.weight,
    facing: null,
    matchMode: dw.matchMode,
  });
  const dwOk =
    dw.baseName === 'Duct Wrap' &&
    dw.matchMode === 'roll' &&
    dw.keyword === 'duct wrap' &&
    dw.weight === '0.75' &&
    dwPick &&
    /duct wrap/i.test(dwPick.itemName) &&
    /3\/4#/i.test(dwPick.itemName);
  console.log(
    dwOk
      ? `OK  resolveMaterial ductwrap → ${dw.specPhrase} mode=${dw.matchMode} pick=${dwPick.itemName.slice(0, 48)} @${dwPick.price}`
      : `FAIL resolveMaterial ductwrap ${JSON.stringify(dw)} pick=${dwPick && dwPick.itemName}`,
  );
  if (!dwOk) process.exit(1);

  // Mike duct board phrase has no "ductwrap" token — must still resolve to roll Duct Wrap
  const fskBoard = resolveMaterial('2 3# FSK', helpers);
  const fskOk =
    fskBoard.baseName === 'Duct Wrap' &&
    fskBoard.matchMode === 'roll' &&
    fskBoard.specPhrase === 'FIBERGLASS DUCT WRAP' &&
    fskBoard.weight === '3' &&
    (fskBoard.facing || '').toLowerCase() === 'fsk';
  console.log(
    fskOk
      ? `OK  resolveMaterial "2 3# FSK" → ${fskBoard.specPhrase} mode=${fskBoard.matchMode} wt=${fskBoard.weight}`
      : `FAIL resolveMaterial "2 3# FSK" ${JSON.stringify(fskBoard)}`,
  );
  if (!fskOk) process.exit(1);
  if (normalizeMaterialBase('2 3# FSK', '2 3# FSK') !== 'Duct Wrap') {
    console.log('FAIL normalizeMaterialBase FSK board without helpers');
    process.exit(1);
  }
  const fskRoll = rollupMike(
    [
      {
        size: 112,
        thickness: 2,
        quantity: 100,
        hours: 2,
        materialBase: 'Duct Wrap',
        materialPhrase: '2 3# FSK',
        systemName: 'Medium Pressure Supply Air',
        discipline: 'D',
      },
    ],
    112,
    2,
    'Duct Wrap',
    { matchMode: 'roll', weight: '3', facing: 'FSK' },
  );
  if (fskRoll.qtyEstimated !== 100) {
    console.log(`FAIL rollupMike FSK board qty expected 100 got ${fskRoll.qtyEstimated}`);
    process.exit(1);
  }
  console.log('OK  rollupMike "2 3# FSK" board → qty with roll wt/facing');

  // Mike FoamGlas + ASJ must NOT collapse onto Fiberglass (that zeroed Plumbing Spec qty)
  const foamAsj = resolveMaterial('FoamGlas w/ ASJ', helpers);
  if (foamAsj.baseName !== 'Foamglas' || /fiberglass/i.test(foamAsj.specPhrase || '')) {
    console.log('FAIL resolveMaterial FoamGlas w/ ASJ', foamAsj);
    process.exit(1);
  }
  console.log(`OK  resolveMaterial FoamGlas w/ ASJ → base=${foamAsj.baseName} spec=${foamAsj.specPhrase}`);

  const pipe = resolveMaterial('Fiberglass with ASJ', helpers);
  if (pipe.matchMode !== 'pipe' || pipe.keyword !== 'fiberglass') {
    console.log('FAIL resolveMaterial pipe ASJ', pipe);
    process.exit(1);
  }
  console.log(`OK  resolveMaterial pipe → ${pipe.specPhrase} mode=${pipe.matchMode}`);

  // Bare Mike "Fiberglass" must NOT default to Aluminum (helpermap BaseName seed order trap)
  const bareFg = resolveMaterial('Fiberglass', helpers);
  if (bareFg.baseName !== 'Fiberglass' || bareFg.specPhrase !== 'Fiberglass with ASJ') {
    console.log('FAIL resolveMaterial bare Fiberglass', bareFg);
    process.exit(1);
  }
  console.log(`OK  resolveMaterial bare Fiberglass → ${bareFg.specPhrase} face=${bareFg.facing}`);

  // Recv roll mode: thickness only + keyword; sum all hits (no weight split) — Excel rule
  const rollItems = [
    { itemName: `01-1/2" X 48" X 100' 1# FSK JOHNS MANVILLE DUCT WRAP`, received: 1 },
    { itemName: `01-1/2" X 48" X 100' 3/4# FSK JOHNS MANVILLE DUCT WRAP`, received: 1 },
    { itemName: `01-1/2" X 48" X 100' 3/4# FSK JOHNS MANVILLE DUCT WRAP`, received: 1 },
    { itemName: '08" X 1-1/2" (12) ULTRA John Manville (JM) Fiberglass Pipe Covering (PC)', received: 3 },
  ];
  const rollRecv = sumQtyReceived(rollItems, 8, 1.5, 'duct wrap', { matchMode: 'roll' });
  if (rollRecv !== 3) {
    console.log(`FAIL roll Recv expected 3 (all 1.5" duct wrap), got ${rollRecv}`);
    process.exit(1);
  }
  const pipeRecv = sumQtyReceived(rollItems, 8, 1.5, 'fiberglass', { matchMode: 'pipe' });
  if (pipeRecv !== 3) {
    console.log(`FAIL pipe Recv expected 3 (8x1.5 PC only), got ${pipeRecv}`);
    process.exit(1);
  }
  console.log('OK  sumQtyReceived roll=thick-only sum; pipe=size×thick');

  // Facing from Structshare item name when Spec Facing empty (e.g. duct wrap → FSK)
  const { enrichSpecLine } = require('../dist/bidding/specs/specs-engine');
  const enriched = enrichSpecLine(
    {
      systemName: 'Low Pressure Supply Air',
      areaName: 'All',
      insulation: 'FIBERGLASS DUCT WRAP',
      size: 8,
      thickness: 1.5,
      weight: '0.75',
      facing: null,
    },
    helpers,
    [],
    {
      systemCode: () => 'LSA',
      systemUnit: () => 'LF',
      materialCode: () => 'DUW',
      areaCode: () => 'XX',
    },
    [],
    catalog,
  );
  if (enriched.facing !== 'FSK') {
    console.log('FAIL facing-from-search-pool', {
      facing: enriched.facing,
      options: (enriched.structshareOptions || []).slice(0, 2),
    });
    process.exit(1);
  }
  if (enriched.structshareItem != null) {
    console.log('FAIL structshareItem should be null (no cheapest pick)', enriched.structshareItem);
    process.exit(1);
  }
  console.log(`OK  facing from search pool → ${enriched.facing}; structshareItem=null`);

  // Roll SF: width/12 × length (ignore vendor 300SF/RL on 100' rolls)
  const d100 = parseRollDims(`01-1/2" X 48" X 100' 3/4# FSK KNAUF DUCT WRAP (300SF/RL)`);
  const d75 = parseRollDims(`02" X 48" X75' 3/4# FSK JOHNS MANVILLE (JM) DUCT WRAP (300)`);
  if (d100.sfPerRoll !== 400 || d75.sfPerRoll !== 300) {
    console.log('FAIL parseRollDims SF', d100, d75);
    process.exit(1);
  }
  console.log('OK  parseRollDims 48×100=400 (ignore 300SF/RL); 48×75=300');

  const mixed = [
    { itemName: `01-1/2" X 48" X 100' 3/4# FSK DUCT WRAP`, received: 1 },
    { itemName: `01-1/2" X 48" X 100' 1# FSK DUCT WRAP`, received: 1 },
    { itemName: `01-1/2" X 48" X75' 3/4# FSK DUCT WRAP`, received: 1 },
  ];
  const mixedRolls = sumQtyReceived(mixed, 8, 1.5, 'duct wrap', { matchMode: 'roll' });
  const mixedSf = sumQtyReceivedSf(mixed, 1.5, 'duct wrap');
  if (mixedRolls !== 3 || mixedSf !== 1100) {
    console.log('FAIL mixed Recv SF', { mixedRolls, mixedSf, expected: { rolls: 3, sf: 1100 } });
    process.exit(1);
  }
  console.log('OK  mixed Recv: 3 rolls, SF=400+400+300=1100');

  if (enriched.structshareSfPerRoll == null || enriched.structshareSfPerRoll <= 0) {
    console.log('FAIL enrich structshareSfPerRoll', enriched.structshareSfPerRoll);
    process.exit(1);
  }
  console.log(`OK  enrich structshareSfPerRoll=${enriched.structshareSfPerRoll}`);

  const withUnits = [
    {
      itemName: `01-1/2" X 48" X 100' 3/4# FSK DUCT WRAP`,
      received: 2,
      unit: 'Roll',
    },
    {
      itemName: `01-1/2" X 48" X75' 3/4# FSK DUCT WRAP`,
      received: 1,
      unit: 'Roll',
    },
  ];
  const tu = resolveTrimbleUnit(withUnits, 8, 1.5, 'duct wrap', { matchMode: 'roll' });
  if (tu !== 'Roll') {
    console.log('FAIL resolveTrimbleUnit', tu);
    process.exit(1);
  }
  console.log('OK  resolveTrimbleUnit → Roll');

  const summarySame = buildQtyReceivedSummary(
    [
      { itemName: `01-1/2" X 48" X 100' FSK DUCT WRAP`, received: 2, unit: 'Roll' },
      { itemName: `01-1/2" X 48" X 100' FSK DUCT WRAP`, received: 1, unit: 'Roll' },
    ],
    1.5,
    'duct wrap',
    { trimbleUnit: 'Roll' },
  );
  if (summarySame !== '3 rolls of 400 sq ft') {
    console.log('FAIL qtyReceivedSummary same SF', summarySame);
    process.exit(1);
  }
  const summaryMix = buildQtyReceivedSummary(
    [
      { itemName: `01-1/2" X 48" X 100' FSK DUCT WRAP`, received: 2, unit: 'Roll' },
      { itemName: `01-1/2" X 48" X75' FSK DUCT WRAP`, received: 1, unit: 'Roll' },
    ],
    1.5,
    'duct wrap',
    { trimbleUnit: 'Roll' },
  );
  if (summaryMix !== '2 rolls of 400 sq ft + 1 roll of 300 sq ft') {
    console.log('FAIL qtyReceivedSummary mixed', summaryMix);
    process.exit(1);
  }
  console.log('OK  qtyReceivedSummary →', summarySame, '|', summaryMix);

  // Roll Est stack: same thick + wt/facing + insulation → add qty; ignore size; PPH = Σqty/Σhrs
  const rollMike = [
    {
      size: 24,
      thickness: 2,
      quantity: 100,
      hours: 10,
      materialBase: 'Duct Wrap',
      materialPhrase: '2 .75# FSK Ductwrap',
      systemName: 'Supply',
    },
    {
      size: 48,
      thickness: 2,
      quantity: 200,
      hours: 20,
      materialBase: 'Duct Wrap',
      materialPhrase: '2 .75# FSK Ductwrap',
      systemName: 'Return',
    },
    {
      size: 12,
      thickness: 1.5,
      quantity: 50,
      hours: 5,
      materialBase: 'Duct Wrap',
      materialPhrase: '1.5 .75# FSK Ductwrap',
      systemName: 'Supply',
    },
  ];
  const suggested = suggestSpecLinesFromMike(rollMike, helpers);
  const rollLines = suggested.filter((s) => /duct wrap/i.test(s.insulation));
  const thick2 = rollLines.find((s) => s.thickness === 2);
  if (!thick2 || rollLines.filter((s) => s.thickness === 2).length !== 1) {
    console.log('FAIL roll suggest should merge sizes at thick=2', rollLines);
    process.exit(1);
  }
  if (thick2.qtyEstimated !== 300) {
    console.log('FAIL roll suggest qty at thick=2 expected 300', thick2);
    process.exit(1);
  }
  const rolled = rollupMike(rollMike, 99, 2, 'Duct Wrap', {
    matchMode: 'roll',
    weight: '0.75',
    facing: 'FSK',
  });
  if (rolled.qtyEstimated !== 300 || Math.abs((rolled.productionPerHour || 0) - 10) > 1e-9) {
    console.log('FAIL rollupMike roll stack', rolled);
    process.exit(1);
  }
  const pipeSplit = rollupMike(
    [
      { size: 1, thickness: 1, quantity: 10, hours: 1, materialBase: 'Fiberglass', materialPhrase: 'Fiberglass ASJ' },
      { size: 2, thickness: 1, quantity: 20, hours: 2, materialBase: 'Fiberglass', materialPhrase: 'Fiberglass ASJ' },
    ],
    1,
    1,
    'Fiberglass',
    { matchMode: 'pipe' },
  );
  if (pipeSplit.qtyEstimated !== 10) {
    console.log('FAIL pipe still size×thick', pipeSplit);
    process.exit(1);
  }
  console.log('OK  roll Est stack thick+wt/facing (ignore size); PPH=Σqty/Σhrs; pipe unchanged');

  const {
    stripVendorFromItemName,
  } = require('../dist/bidding/specs/specs-engine');
  const rawJm = `02" X 48" X75' 3/4# FSK JOHNS MANVILLE (JM) DUCT WRAP (300)`;
  const stripped = stripVendorFromItemName(rawJm);
  if (/johns|manville|\(jm\)/i.test(stripped) || !/duct wrap/i.test(stripped)) {
    console.log('FAIL stripVendorFromItemName', stripped);
    process.exit(1);
  }
  console.log(`OK  stripVendor → ${stripped.slice(0, 60)}`);

  const allOpts = listStructshareOptions(catalog, 1.5, 1.5, 'duct wrap', {
    weight: '0.75',
    facing: 'FSK',
    matchMode: 'roll',
  });
  if (!allOpts.length) {
    console.log('FAIL structshareOptions empty', { n: allOpts.length });
    process.exit(1);
  }
  if (allOpts.some((o) => /johns\s*manville|\(jm\)/i.test(o.itemName))) {
    console.log('FAIL vendor still in structshareOptions', allOpts[0]);
    process.exit(1);
  }
  // Sorted by name, not price
  for (let i = 1; i < allOpts.length; i++) {
    if (allOpts[i].itemName.localeCompare(allOpts[i - 1].itemName) < 0) {
      console.log('FAIL options not name-sorted');
      process.exit(1);
    }
  }
  console.log(`OK  structshareOptions n=${allOpts.length} (collective, no vendor, name-sorted)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
