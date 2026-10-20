/** Replace comma-joined Bid_Parties rows with one row per contact. */
import 'dotenv/config';
import { readFileSync } from 'fs';

const sql = require('mssql');

type Row = {
  role: string;
  company: string | null;
  contactName: string | null;
  email: string | null;
  phone: string | null;
};

function dedupeKey(role: string, name: string, email: string) {
  return `${role}|${name.toLowerCase().slice(0, 180)}|${email.toLowerCase().slice(0, 150)}`;
}

async function main() {
  const source = JSON.parse(readFileSync('/tmp/clean-parties.json', 'utf8')) as Row[];
  const seen = new Set<string>();
  const rows: Array<Row & { name: string; dedupe: string }> = [];
  for (const row of source) {
    const contactName = row.contactName?.trim() || null;
    const company = row.company?.trim() || null;
    const name = contactName || company;
    const email = row.email?.trim().toLowerCase() || '';
    if (!name || !row.role) continue;
    const dedupe = dedupeKey(row.role, name, email);
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    rows.push({ ...row, contactName, company, email: email || null, name, dedupe });
  }

  let password = process.env.DB_PASSWORD || '';
  if (password.startsWith('"') || password.startsWith("'")) password = password.slice(1, -1);
  const db = await sql.connect({
    server: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '1433', 10),
    user: process.env.DB_USERNAME,
    password,
    database: process.env.DB_DATABASE || 'GoFormzDB',
    options: { encrypt: process.env.DB_ENCRYPT === 'true', trustServerCertificate: process.env.DB_TRUST_CERT !== 'false' },
    requestTimeout: 180000,
  });

  const q = () => db.request();
  let updated: { rowsAffected: number[] } = { rowsAffected: [0] };
  let dupes: { rowsAffected: number[] } = { rowsAffected: [0] };
  let inserted: { rowsAffected: number[] } = { rowsAffected: [0] };
  let blobs: { rowsAffected: number[] } = { rowsAffected: [0] };
  let stubs: { rowsAffected: number[] } = { rowsAffected: [0] };
  let personCompanies: { rowsAffected: number[] } = { rowsAffected: [0] };
  await q().query(`
    IF OBJECT_ID('dbo.Bid_PartyCleanStage') IS NOT NULL DROP TABLE dbo.Bid_PartyCleanStage;
    CREATE TABLE dbo.Bid_PartyCleanStage (
      Role nvarchar(40) NOT NULL,
      Name nvarchar(200) NOT NULL,
      Company nvarchar(200) NULL,
      ContactName nvarchar(200) NULL,
      Email nvarchar(200) NULL,
      Phone nvarchar(40) NULL,
      DedupeKey nvarchar(400) NOT NULL
    )
  `);

  const size = 100;
  for (let i = 0; i < rows.length; i += size) {
    const chunk = rows.slice(i, i + size);
    const request = q();
    const values = chunk.map((row, n) => {
      request.input(`r${n}`, row.role);
      request.input(`n${n}`, row.name);
      request.input(`c${n}`, row.company);
      request.input(`t${n}`, row.contactName);
      request.input(`e${n}`, row.email);
      request.input(`p${n}`, row.phone);
      request.input(`d${n}`, row.dedupe);
      return `(@r${n},@n${n},@c${n},@t${n},@e${n},@p${n},@d${n})`;
    });
    await request.query(`
      INSERT INTO dbo.Bid_PartyCleanStage (Role, Name, Company, ContactName, Email, Phone, DedupeKey)
      VALUES ${values.join(',')}
    `);
  }

  updated = await q().query(`
    UPDATE p
    SET Name = c.Name,
        Company = COALESCE(c.Company, p.Company),
        ContactName = COALESCE(c.ContactName, p.ContactName),
        Phone = COALESCE(c.Phone, p.Phone),
        DedupeKey = c.DedupeKey,
        UpdatedAt = SYSUTCDATETIME()
    FROM dbo.Bid_Parties p
    INNER JOIN (
      SELECT Role, Email, MIN(PartyId) AS PartyId
      FROM dbo.Bid_Parties
      WHERE Email IS NOT NULL
        AND Email NOT LIKE '%,%'
        AND (Company IS NULL OR Company NOT LIKE '%,[A-Za-z(]%')
      GROUP BY Role, Email
    ) one ON one.PartyId = p.PartyId
    INNER JOIN dbo.Bid_PartyCleanStage c ON c.Role = p.Role AND c.Email = p.Email
    WHERE NOT EXISTS (
      SELECT 1 FROM dbo.Bid_Parties o WHERE o.DedupeKey = c.DedupeKey AND o.PartyId <> p.PartyId
    )
  `);

  dupes = await q().query(`
    DELETE p
    FROM dbo.Bid_Parties p
    INNER JOIN dbo.Bid_Parties keep
      ON keep.Role = p.Role AND keep.Email = p.Email AND keep.PartyId < p.PartyId
    WHERE p.Email IS NOT NULL AND p.Email NOT LIKE '%,%'
  `);

  inserted = await q().query(`
    INSERT INTO dbo.Bid_Parties (Role, Name, Company, ContactName, Email, Phone, DedupeKey)
    SELECT c.Role, c.Name, c.Company, c.ContactName, c.Email, c.Phone, c.DedupeKey
    FROM dbo.Bid_PartyCleanStage c
    WHERE NOT EXISTS (SELECT 1 FROM dbo.Bid_Parties p WHERE p.DedupeKey = c.DedupeKey)
  `);

  blobs = await q().query(`
    DELETE FROM dbo.Bid_Parties
    WHERE Email LIKE '%,%'
       OR Phone LIKE '%,%'
       OR ContactName LIKE '%,[A-Za-z(]%'
       OR Company LIKE '%,[A-Za-z(]%'
       OR Name LIKE '%,[A-Za-z(]%'
  `);

  stubs = await q().query(`
    DELETE FROM dbo.Bid_Parties
    WHERE Phone = '(703) 350-4151' AND Email IS NULL AND LEN(ISNULL(Company, '')) <= 20
  `);

  personCompanies = await q().query(`
    DELETE p
    FROM dbo.Bid_Parties p
    WHERE p.Email IS NULL
      AND EXISTS (
        SELECT 1 FROM dbo.Bid_Parties o
        WHERE o.Email IS NOT NULL
          AND o.ContactName = p.Company
          AND ISNULL(o.Company, '') <> p.Company
      )
  `);

  await q().query(`DROP TABLE dbo.Bid_PartyCleanStage`);
  const brian = await db.request().query(`
    SELECT Role, Name, Company, ContactName, Email, Phone
    FROM dbo.Bid_Parties
    WHERE Email = 'bchamberlain@denver-elek.com'
  `);
  const left = await db.request().query(`
    SELECT COUNT(*) AS n FROM dbo.Bid_Parties
    WHERE Email LIKE '%,%' OR Company LIKE '%,[A-Za-z(]%' OR ContactName LIKE '%,[A-Za-z(]%'
  `);

  console.log(JSON.stringify({
    prepared: rows.length,
    updated: updated.rowsAffected[0],
    dupesRemoved: dupes.rowsAffected[0],
    inserted: inserted.rowsAffected[0],
    blobsRemoved: blobs.rowsAffected[0],
    stubsRemoved: stubs.rowsAffected[0],
    personCompaniesRemoved: personCompanies.rowsAffected[0],
    commaRowsLeft: left.recordset[0].n,
    brian: brian.recordset,
  }));
  await db.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
