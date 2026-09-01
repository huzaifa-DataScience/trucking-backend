/**
 * Self-check: Company_Items.xlsx layout we ingest into Trimble_CompanyItems.
 * Usage: node scripts/check-company-items-xlsx.js
 * Skips (exit 0) if the sample workbook is not on disk (gitignored).
 */
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

const file = path.join(__dirname, '..', 'Company_Items.xlsx');
if (!fs.existsSync(file)) {
  console.log('skip: Company_Items.xlsx not present');
  process.exit(0);
}

(async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.getWorksheet('Company_Items') || wb.worksheets[0];
  if (!ws) throw new Error('no worksheet');
  const headers = [];
  ws.getRow(1).eachCell((cell, col) => {
    headers[col] = String(cell.value ?? '').trim();
  });
  const need = ['Record ID', 'Item Name', 'Units', 'Cost Code', 'Budget Category'];
  for (const h of need) {
    if (!headers.includes(h)) throw new Error(`missing header ${h}: ${headers.filter(Boolean).join(', ')}`);
  }
  if (ws.rowCount < 10) throw new Error(`expected data rows, got rowCount=${ws.rowCount}`);
  console.log(`ok: sheet=${ws.name} rows=${ws.rowCount} cols=${need.length}+ headers`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
