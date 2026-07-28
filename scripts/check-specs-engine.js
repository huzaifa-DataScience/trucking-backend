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
  rollupMike,
  sumQtyReceived,
  pickStructshareItem,
  parseLineItemName,
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
      const got = sumQtyReceived(lineItems, size, thick, keyword);
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
  const { resolveMaterial } = require('../dist/bidding/specs/specs-engine');
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

  const pipe = resolveMaterial('Fiberglass with ASJ', helpers);
  if (pipe.matchMode !== 'pipe' || pipe.keyword !== 'fiberglass') {
    console.log('FAIL resolveMaterial pipe ASJ', pipe);
    process.exit(1);
  }
  console.log(`OK  resolveMaterial pipe → ${pipe.specPhrase} mode=${pipe.matchMode}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
