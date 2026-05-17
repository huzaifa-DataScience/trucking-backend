/**
 * One-off: fill LeadPmEmail / leadPmEmail from Goel convention (firstname.lastname@goelservices.com).
 * Uses the same helpers as Siteline sync. Does not start Nest/Trimble.
 *
 *   npx ts-node scripts/backfill-siteline-pm-emails.ts
 * Or: npm run backfill-siteline-pm-emails
 */
import 'dotenv/config';
import { resolveLeadPmEmailFromFullName } from '../src/siteline/siteline-pm-email.util';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const mssql = require('mssql');

type NameEmailRow = { id: string | number; leadPmName: string | null; leadPmEmail: string | null };

function dbConfig() {
  return {
    server: process.env.DB_HOST!,
    port: parseInt(process.env.DB_PORT || '1433', 10),
    user: process.env.DB_USERNAME!,
    password: String(process.env.DB_PASSWORD ?? '').replace(/^"|"$/g, ''),
    database: process.env.DB_DATABASE!,
    options: {
      encrypt: process.env.DB_ENCRYPT === 'true',
      trustServerCertificate: process.env.DB_TRUST_CERT === 'true',
    },
  };
}

async function backfillTable(
  pool: { request: () => { query: (q: string) => Promise<{ recordset: NameEmailRow[] }>; input: (n: string, t: unknown, v: unknown) => unknown } },
  label: string,
  selectSql: string,
  update: (id: string | number, email: string) => Promise<void>,
): Promise<number> {
  const result = await pool.request().query(selectSql);
  const rows = result.recordset as NameEmailRow[];
  let updated = 0;
  for (const row of rows) {
    const derived = resolveLeadPmEmailFromFullName(row.leadPmEmail, row.leadPmName);
    if (!derived) continue;
    const current = row.leadPmEmail?.trim().toLowerCase() ?? '';
    if (current === derived) continue;
    await update(row.id, derived);
    updated += 1;
  }
  console.log(`${label}: scanned=${rows.length}, updated=${updated}`);
  return updated;
}

async function run() {
  const pool = await mssql.connect(dbConfig());
  try {
    const contracts = await backfillTable(
      pool,
      'Siteline_Contracts',
      `
        SELECT id, leadPmName, leadPmEmail
        FROM dbo.Siteline_Contracts
        WHERE leadPmName IS NOT NULL
          AND LTRIM(RTRIM(leadPmName)) <> ''
          AND (leadPmEmail IS NULL OR LTRIM(RTRIM(leadPmEmail)) = '')
      `,
      async (id, email) => {
        await pool
          .request()
          .input('id', mssql.NVarChar(50), String(id))
          .input('email', mssql.NVarChar(255), email)
          .query(`UPDATE dbo.Siteline_Contracts SET leadPmEmail = @email WHERE id = @id`);
      },
    );

    const aging = await backfillTable(
      pool,
      'Siteline_AgingContracts',
      `
        SELECT Id AS id, LeadPmName AS leadPmName, LeadPmEmail AS leadPmEmail
        FROM dbo.Siteline_AgingContracts
        WHERE LeadPmName IS NOT NULL
          AND LTRIM(RTRIM(LeadPmName)) <> ''
          AND (LeadPmEmail IS NULL OR LTRIM(RTRIM(LeadPmEmail)) = '')
      `,
      async (id, email) => {
        await pool
          .request()
          .input('id', mssql.Int, Number(id))
          .input('email', mssql.NVarChar(255), email)
          .query(`UPDATE dbo.Siteline_AgingContracts SET LeadPmEmail = @email WHERE Id = @id`);
      },
    );

    console.log(`Done. Total rows updated: ${contracts + aging}`);
  } finally {
    await pool.close();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
