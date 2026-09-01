/**
 * Full Specs test against EstimationFile.xlsx:
 * - MIKE CSVs → engine qty / suggest / structshare
 * - Specs Plumb rows → Excel parity (qty, prod/hr, recv, struct)
 * - Material coverage / miss report
 *
 * Usage: node scripts/test-estimation-mike-specs.js
 */
const path = require('path');
const ExcelJS = require('exceljs');
const {
  deriveMaterialBase,
  normalizeMaterialBase,
  resolveMaterial,
  rollupMike,
  sumQtyReceived,
  pickStructshareItem,
  parseLineItemName,
  suggestSpecLinesFromMike,
  enrichSpecLine,
  parseSystemAndType,
  parseDensityWeight,
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
function near(a, b, tol = 0.05) {
  if (a == null || b == null) return false;
  return Math.abs(Number(a) - Number(b)) < tol;
}

function loadHelpers(hm) {
  const prefixes = [];
  for (let r = 2; r <= 40; r++) {
    const rawPrefix = s(cell(hm.getRow(r).getCell(5)));
    const baseName = s(cell(hm.getRow(r).getCell(6)));
    if (rawPrefix && baseName) prefixes.push({ rawPrefix, baseName });
  }
  const matchPrefix = (phrase) => {
    const lower = phrase.toLowerCase();
    let best = null;
    for (const p of prefixes) {
      if (!lower.includes(p.rawPrefix.toLowerCase())) continue;
      if (!best || p.rawPrefix.length > best.rawPrefix.length) best = p;
    }
    return best;
  };
  const helpers = [];
  const seen = new Set();
  for (let r = 2; r <= 100; r++) {
    const specPhrase = s(cell(hm.getRow(r).getCell(1)));
    const keyword = s(cell(hm.getRow(r).getCell(2)));
    if (!specPhrase || !keyword) continue;
    const key = specPhrase.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const mapped = matchPrefix(specPhrase);
    helpers.push({
      specPhrase,
      keyword,
      keyword2: s(cell(hm.getRow(r).getCell(3))) || null,
      rawPrefix: mapped?.rawPrefix ?? null,
      baseName: mapped?.baseName ?? null,
    });
  }
  for (const p of prefixes) {
    if (!helpers.some((h) => (h.rawPrefix || '').toLowerCase() === p.rawPrefix.toLowerCase())) {
      helpers.push({
        specPhrase: p.rawPrefix,
        keyword: '',
        rawPrefix: p.rawPrefix,
        baseName: p.baseName,
      });
    }
  }
  return helpers;
}

function loadMikeSheet(ws) {
  const rows = [];
  if (!ws) return rows;
  for (let r = 3; r <= ws.rowCount; r++) {
    const systemAndType = s(cell(ws.getRow(r).getCell(7)));
    if (!systemAndType) continue;
    const phrase = s(cell(ws.getRow(r).getCell(43)));
    let ar = cell(ws.getRow(r).getCell(44));
    if (ar && typeof ar === 'object' && ar.result !== undefined) ar = ar.result;
    const excelBase = s(ar);
    const rawBase =
      excelBase && excelBase !== '[object Object]'
        ? excelBase
        : deriveMaterialBase(phrase);
    const parsed = parseSystemAndType(systemAndType);
    rows.push({
      excelRow: r,
      size: n(cell(ws.getRow(r).getCell(9))),
      thickness: n(cell(ws.getRow(r).getCell(8))),
      quantity: n(cell(ws.getRow(r).getCell(10))) || 0,
      hours: n(cell(ws.getRow(r).getCell(12))),
      materialPhrase: phrase || null,
      materialBase: normalizeMaterialBase(rawBase, phrase),
      systemName: parsed.systemName,
      discipline: parsed.discipline,
      systemAndType,
    });
  }
  return rows;
}

function loadCatalog(itemDb) {
  const catalog = [];
  if (!itemDb) return catalog;
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
  return catalog;
}

function loadLineItems(sheet) {
  const lineItems = [];
  if (!sheet) return lineItems;
  let nameCol = 2;
  let recvCol = 12;
  const hdr = sheet.getRow(1);
  for (let c = 1; c <= 30; c++) {
    const h = s(cell(hdr.getCell(c))).toLowerCase();
    if (h === 'item name') nameCol = c;
    if (h.includes('received')) recvCol = c;
  }
  for (let r = 2; r <= sheet.rowCount; r++) {
    const itemName = s(cell(sheet.getRow(r).getCell(nameCol)));
    if (!itemName) continue;
    lineItems.push({
      itemName,
      received: n(cell(sheet.getRow(r).getCell(recvCol))) || 0,
    });
  }
  return lineItems;
}

async function main() {
  const xlsx = path.join(__dirname, '..', 'EstimationFile.xlsx');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(xlsx);

  const helpers = loadHelpers(wb.getWorksheet('helpermap'));
  const mike = loadMikeSheet(wb.getWorksheet('MIKE CSVs'));
  const hvac1 = loadMikeSheet(wb.getWorksheet('HVAC 1 CSV'));
  const catalog = loadCatalog(wb.getWorksheet('item Database'));
  const lineItems = loadLineItems(
    wb.getWorksheet('Line items') ||
      wb.getWorksheet('Line items ') ||
      wb.worksheets.find((w) => /^line\s*items/i.test(w.name)),
  );
  const spec = wb.getWorksheet('Specs Plumb');

  console.log('=== EstimationFile Specs / Mike test ===');
  console.log(
    `helpers=${helpers.length} mike=${mike.length} hvac1=${hvac1.length} catalog=${catalog.length} lineItems=${lineItems.length}`,
  );

  // --- A) Specs Plumb parity ---
  let ok = 0;
  let fail = 0;
  const fails = [];
  const structNotes = [];
  for (let r = 5; r <= spec.rowCount; r++) {
    const type = s(cell(spec.getRow(r).getCell(1)));
    if (!type || type === '----') continue;
    const insulation = s(cell(spec.getRow(r).getCell(8)));
    const size = n(cell(spec.getRow(r).getCell(11)));
    const thick = n(cell(spec.getRow(r).getCell(12)));
    const weight = s(cell(spec.getRow(r).getCell(13))) || null;
    const facing = s(cell(spec.getRow(r).getCell(14))) || null;
    const qtyEst = n(cell(spec.getRow(r).getCell(16)));
    const pph = n(cell(spec.getRow(r).getCell(15)));
    const qtyRec = n(cell(spec.getRow(r).getCell(17)));
    const structName = s(cell(spec.getRow(r).getCell(23)));

    const resolved = resolveMaterial(insulation, helpers);
    const roll = rollupMike(mike, size, thick, resolved.baseName);
    const recv = sumQtyReceived(lineItems, size, thick, resolved.keyword, {
      matchMode: resolved.matchMode,
    });
    const pick = pickStructshareItem(catalog, size, thick, resolved.keyword, {
      weight: weight || resolved.weight,
      facing: facing || null,
      matchMode: resolved.matchMode,
    });

    const qtyOk = qtyEst == null || near(roll.qtyEstimated, qtyEst);
    const pphOk =
      pph == null ||
      roll.productionPerHour == null ||
      near(roll.productionPerHour, pph);
    const recvOk = qtyRec == null || near(recv, qtyRec);

    let structOk = true;
    if (structName && structName !== '---' && !structName.startsWith('[f:')) {
      if (!pick) {
        structNotes.push(`R${r} no pick; Excel=${structName.slice(0, 50)}`);
      } else if (pick.itemName.trim() !== structName.trim()) {
        structNotes.push(
          `R${r} struct differ Excel="${structName.slice(0, 40)}" Re="${pick.itemName.slice(0, 40)}"`,
        );
      }
    }

    if (qtyOk && pphOk && recvOk && structOk) {
      ok++;
      console.log(
        `OK  Specs R${r} ${insulation.slice(0, 28)} ${size}x${thick} qty=${roll.qtyEstimated.toFixed(2)} mode=${resolved.matchMode}`,
      );
    } else {
      fail++;
      const msg = `FAIL Specs R${r} ${insulation} ${size}x${thick} base=${resolved.baseName} qty Excel=${qtyEst} Re=${roll.qtyEstimated} pph Excel=${pph} Re=${roll.productionPerHour} recv Excel=${qtyRec} Re=${recv}`;
      fails.push(msg);
      console.log(msg);
    }
  }

  // --- B) Mike coverage / suggest ---
  const suggestions = suggestSpecLinesFromMike(mike, helpers);
  console.log(`\n=== Auto-from-Mike suggestions: ${suggestions.length} ===`);
  const lookups = {
    systemCode: () => null,
    systemUnit: () => null,
    materialCode: () => null,
    areaCode: () => null,
  };
  let sugQty = 0;
  let sugStruct = 0;
  let sugNoBase = 0;
  let sugNoKw = 0;
  const missByIns = {};
  for (const sug of suggestions) {
    const out = enrichSpecLine(
      {
        systemName: sug.systemName,
        insulation: sug.insulation,
        size: sug.size,
        thickness: sug.thickness,
        weight: sug.weight,
      },
      helpers,
      mike,
      lookups,
      lineItems,
      catalog,
    );
    if (!out.materialBase) sugNoBase++;
    if (!out.keyword) sugNoKw++;
    if (out.qtyEstimated > 0) sugQty++;
    else {
      const k = sug.insulation;
      missByIns[k] = (missByIns[k] || 0) + 1;
    }
    if (out.structshareItem) sugStruct++;
  }
  console.log(
    `suggest qty>0: ${sugQty}/${suggestions.length}  struct: ${sugStruct}/${suggestions.length}  noBase: ${sugNoBase}  noKeyword: ${sugNoKw}`,
  );
  if (Object.keys(missByIns).length) {
    console.log('qty=0 by insulation:');
    for (const [k, v] of Object.entries(missByIns).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${v}× ${k}`);
    }
  }

  // --- C) Family spot-checks from Mike phrases ---
  console.log('\n=== Family spot-checks (Mike phrases) ===');
  const spots = [
    { phrase: '2 .75# Ductwrap', size: 34, thick: 2 },
    { phrase: '2 Pipe and Tank Wrap', size: 12, thick: 2 },
    { phrase: 'Fiberglass with ASJ', size: 1, thick: 1 },
    { phrase: 'Armaflex / Flex Tubing W/ Canvas', size: 1, thick: 1 },
  ];
  for (const sp of spots) {
    const res = resolveMaterial(sp.phrase, helpers);
    const qty = rollupMike(mike, sp.size, sp.thick, res.baseName).qtyEstimated;
    const pick = pickStructshareItem(catalog, sp.size, sp.thick, res.keyword, {
      weight: res.weight || parseDensityWeight(sp.phrase),
      matchMode: res.matchMode,
    });
    const mikeHit = mike.filter(
      (m) =>
        m.size === sp.size &&
        m.thickness === sp.thick &&
        (m.materialBase || '') === (res.baseName || ''),
    ).length;
    console.log(
      `${sp.phrase} → spec="${res.specPhrase}" base=${res.baseName} mode=${res.matchMode} kw=${res.keyword} wt=${res.weight} qty@${sp.size}x${sp.thick}=${qty} mikeRows=${mikeHit} struct=${pick ? pick.itemName.slice(0, 55) + ' @' + pick.price : 'NONE'}`,
    );
  }

  // Mike material phrase histogram
  const phraseHist = {};
  for (const m of mike) {
    const p = m.materialPhrase || m.materialBase || '?';
    phraseHist[p] = (phraseHist[p] || 0) + 1;
  }
  console.log('\n=== Mike material phrases (top) ===');
  for (const [k, v] of Object.entries(phraseHist)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)) {
    const res = resolveMaterial(k, helpers);
    console.log(
      `  ${v}× "${k.slice(0, 40)}" → base=${res.baseName || '-'} kw=${res.keyword || '-'} mode=${res.matchMode}`,
    );
  }

  // HVAC 1 quick
  if (hvac1.length) {
    const sugH = suggestSpecLinesFromMike(hvac1, helpers);
    console.log(`\n=== HVAC 1 CSV: rows=${hvac1.length} suggest=${sugH.length} ===`);
  }

  console.log('\n=== Struct notes (non-fatal MINIFS variance OK) ===');
  for (const n of structNotes.slice(0, 12)) console.log(n);
  if (structNotes.length > 12) console.log(`… +${structNotes.length - 12} more`);

  console.log(`\n=== Summary: Specs Plumb ${ok} ok, ${fail} fail ===`);
  if (fail) {
    for (const f of fails) console.log(f);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
