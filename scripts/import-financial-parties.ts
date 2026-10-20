/** Add Project Financials company contacts that the suggestion list does not already have. */
import 'dotenv/config';
import { readFileSync } from 'fs';

const sql = require('mssql');

type Row = {
  company: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  role: string;
};

function clean(row: Row): Row | null {
  const company = row.company.replace(/\s+/g, ' ').trim();
  if (company.length < 3 || company.length > 80) return null;
  if (/[;@]/.test(company)) return null;
  if (/,/.test(company) && /\d{3,}/.test(company)) return null;
  return {
    company,
    contactName: row.contactName?.replace(/\s+/g, ' ').trim() || null,
    email: row.email?.trim().toLowerCase() || null,
    phone: row.phone?.trim() || null,
    role: row.role,
  };
}

async function main() {
  const parsed = JSON.parse(readFileSync('/tmp/financial-parties.json', 'utf8')) as Row[];
  const source: Row[] = [];
  for (const row of parsed) {
    const item = clean(row);
    if (!item) continue;
    source.push(item);
    source.push({ ...item, role: 'invite_contact' });
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
    requestTimeout: 120000,
  });
  const existing = await db.request().query(
    `SELECT PartyId AS id, Role AS role, Company AS company, Email AS email, Phone AS phone, ContactName AS contactName
     FROM dbo.Bid_Parties`,
  );
  const byKey = new Map<string, { id: number; email: string | null; phone: string | null; contactName: string | null }>();
  for (const row of existing.recordset) {
    const company = String(row.company ?? '').trim().toLowerCase();
    if (!company || company.includes(',')) continue;
    const email = String(row.email ?? '').trim().toLowerCase();
    byKey.set(`${row.role}|${company}|${email}`, row);
  }
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  for (const row of source) {
    const companyKey = row.company.toLowerCase();
    const email = row.email ?? '';
    const exact = byKey.get(`${row.role}|${companyKey}|${email}`);
    const blank = email ? byKey.get(`${row.role}|${companyKey}|`) : undefined;
    const hit = exact ?? blank;
    if (hit) {
      const contactName = hit.contactName || row.contactName;
      const phone = hit.phone || row.phone;
      const nextEmail = hit.email || row.email;
      if (contactName !== hit.contactName || phone !== hit.phone || nextEmail !== hit.email) {
        await db.request()
          .input('id', hit.id)
          .input('contactName', contactName)
          .input('phone', phone)
          .input('email', nextEmail)
          .query(`UPDATE dbo.Bid_Parties SET ContactName=@contactName, Phone=@phone, Email=@email, UpdatedAt=SYSUTCDATETIME() WHERE PartyId=@id`);
        updated += 1;
        hit.contactName = contactName;
        hit.phone = phone;
        hit.email = nextEmail;
      } else skipped += 1;
      continue;
    }
    const dedupe = `${row.role}|${companyKey.slice(0, 180)}|${email.slice(0, 150)}`;
    let insertedRow: { recordset?: { id: number }[] };
    try {
      insertedRow = await db.request()
        .input('role', row.role)
        .input('name', row.company)
        .input('company', row.company)
        .input('contactName', row.contactName)
        .input('email', row.email)
        .input('phone', row.phone)
        .input('dedupe', dedupe)
        .query(`
          IF NOT EXISTS (SELECT 1 FROM dbo.Bid_Parties WHERE DedupeKey=@dedupe)
          INSERT INTO dbo.Bid_Parties (Role, Name, Company, ContactName, Email, Phone, DedupeKey)
          OUTPUT INSERTED.PartyId AS id
          VALUES (@role, @name, @company, @contactName, @email, @phone, @dedupe)
        `);
    } catch {
      skipped += 1;
      continue;
    }
    const id = insertedRow.recordset?.[0]?.id;
    if (id) {
      inserted += 1;
      byKey.set(`${row.role}|${companyKey}|${email}`, { id, email: row.email, phone: row.phone, contactName: row.contactName });
    } else skipped += 1;
  }
  console.log(`financial parties inserted=${inserted} updated=${updated} already=${skipped}`);
  await db.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
