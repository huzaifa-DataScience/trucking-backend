/* eslint-disable */
/**
 * Read latest line-items XLSX blobs from SQL and print sheet names + first rows.
 * Uses ../.env for DB_* (no secrets in source).
 *
 *   node scripts/inspect-trimble-xlsx.js
 */
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const { Connection, Request } = require('tedious');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

let pw = process.env.DB_PASSWORD || '';
if ((pw.startsWith('"') && pw.endsWith('"')) || (pw.startsWith("'") && pw.endsWith("'"))) {
  pw = pw.slice(1, -1);
}

const conn = new Connection({
  server: process.env.DB_HOST || 'localhost',
  authentication: {
    type: 'default',
    options: { userName: process.env.DB_USERNAME || 'sa', password: pw },
  },
  options: {
    port: parseInt(process.env.DB_PORT || '1433', 10),
    database: process.env.DB_DATABASE || 'GoFormzDB',
    encrypt: process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: process.env.DB_TRUST_CERT !== 'false',
    rowCollectionOnRequestCompletion: true,
  },
});

function run(q) {
  return new Promise((resolve, reject) => {
    const r = new Request(q, (err, _rc, rows) => {
      if (err) return reject(err);
      resolve(
        rows.map((row) => {
          const o = {};
          row.forEach((c) => (o[c.metadata.colName] = c.value));
          return o;
        }),
      );
    });
    conn.execSql(r);
  });
}

async function dumpOne(row) {
  const payload = row.Payload;
  if (!payload || !payload.length) {
    console.log(`=== Project ${row.ProjectId} — no Payload`);
    return;
  }
  const buf = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  const outDir = '/tmp/trimble-sample';
  fs.mkdirSync(outDir, { recursive: true });
  const filePath = path.join(outDir, `line-items-project-${row.ProjectId}.xlsx`);
  fs.writeFileSync(filePath, buf);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);

  console.log('');
  console.log(`=== Project ${row.ProjectId}  ${row.ProjectName} ===`);
  console.log(`   file: ${filePath} (${buf.length} bytes)`);
  wb.eachSheet((ws, id) => {
    console.log(`   sheet ${id}: ${ws.name}  (${ws.rowCount} rows x ${ws.columnCount} cols)`);
    let printed = 0;
    ws.eachRow({ includeEmpty: false }, (r, rn) => {
      if (printed >= 8) return;
      const vals = r.values.slice(1, 22);
      console.log('     r' + rn + ': ' + JSON.stringify(vals));
      printed++;
    });
  });
}

conn.on('connect', async (err) => {
  if (err) {
    console.error('conn err:', err.message);
    process.exit(1);
  }
  try {
    const rows = await run(`
      WITH latest AS (
        SELECT Id, ProjectId, ProjectName, Payload,
               ROW_NUMBER() OVER (PARTITION BY ProjectId ORDER BY FetchedAt DESC) AS rn
        FROM dbo.Trimble_LineItemRawExports
      )
      SELECT TOP 3 Id, ProjectId, ProjectName, Payload
      FROM latest WHERE rn = 1 AND Payload IS NOT NULL
      ORDER BY DATALENGTH(Payload) DESC
    `);
    if (rows.length === 0) {
      console.log('No rows in Trimble_LineItemRawExports with Payload — run Trimble sync first.');
    }
    for (const r of rows) await dumpOne(r);
  } catch (e) {
    console.error('err:', e.message);
  } finally {
    conn.close();
  }
});
conn.connect();
