/** Load /tmp/trucking-log-import.json. Re-running updates the same Excel rows. Does not boot the API. */
import 'dotenv/config';
import { readFileSync } from 'fs';
import { disposalLabel, haulerLabel } from '../src/operations/haul-cost';

const sql = require('mssql');

type Card = {
  sourceRow: number;
  company: string;
  category: string | null;
  label: string;
  unit?: string | null;
  ratePerLoad?: number;
  ratePerHour?: number;
  showUpHours?: number | null;
  costPerLoad?: number;
  costPerTon?: number;
  costPerCy?: number;
  truckSizeCy?: number;
  tonsIncluded?: number;
  address?: string | null;
  phone?: string | null;
  contact?: string | null;
  email?: string | null;
  coi?: string | null;
};

type Haul = {
  sourceRow: number;
  ticketDate: string;
  jobNumber: string | null;
  jobName?: string | null;
  haulerLabel: string | null;
  hours: number | null;
  disposalLabel: string | null;
  goelTicketNumber: string | null;
  haulingTicketNumber: string | null;
  disposalTicketNumber: string | null;
  wasteManifestNumber: string | null;
  transferJobNumber: string | null;
  weightTons: number | null;
  [key: string]: unknown;
};

const QTY = [
  'lightTubes', 'metalsDirect', 'metalsReclaimed', 'insulation', 'wood', 'paper', 'aggregates',
  'plastics', 'drywall', 'boardFeetWood', 'dirt', 'lumber', 'brickDeconstructed', 'brickPallets',
  'roofing', 'landfill', 'rc57', 'rc6', 'rc2', 'cr57', 'dirtTons',
];

async function pool() {
  let password = process.env.DB_PASSWORD || '';
  if (password.startsWith('"') || password.startsWith("'")) password = password.slice(1, -1);
  return sql.connect({
    server: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '1433', 10),
    user: process.env.DB_USERNAME,
    password,
    database: process.env.DB_DATABASE || 'GoFormzDB',
    options: {
      encrypt: process.env.DB_ENCRYPT === 'true',
      trustServerCertificate: process.env.DB_TRUST_CERT !== 'false',
    },
    requestTimeout: 120000,
  });
}

async function existing(db: any, table: string, idCol: string) {
  const rows = await db.request().query(
    `SELECT ${idCol} AS id, SourceRow AS sourceRow FROM dbo.${table} WHERE SourceRow IS NOT NULL`,
  );
  return new Map<number, number>(rows.recordset.map((r: { id: number; sourceRow: number }) => [Number(r.sourceRow), Number(r.id)]));
}

async function run(db: any, text: string, params: unknown[]) {
  const req = db.request();
  params.forEach((value, i) => req.input(`p${i}`, value));
  const named = text.replace(/@(\d+)/g, (_, n) => `@p${n}`);
  return req.query(named);
}

function firstLabel(cards: Card[], ids: Map<number, number>, labelOf: (card: Card) => string) {
  const out = new Map<string, number>();
  for (const card of cards) {
    const label = (card.label || labelOf(card)).trim();
    const id = ids.get(card.sourceRow);
    if (label && id != null && !out.has(label)) out.set(label, id);
  }
  return out;
}

async function main() {
  const raw = JSON.parse(readFileSync('/tmp/trucking-log-import.json', 'utf8')) as {
    haulers: Card[];
    disposal: Card[];
    hauls: Haul[];
  };
  const db = await pool();
  await db.request().query(
    "IF COL_LENGTH('dbo.Ops_HaulTickets', 'JobName') IS NULL ALTER TABLE dbo.Ops_HaulTickets ADD JobName nvarchar(300) NULL",
  );
  const companies = await db.request().query('SELECT CompanyID, CompanyName FROM dbo.Ref_ExternalCompanies');
  const companyId = new Map<string, number>(
    companies.recordset.map((c: { CompanyID: number; CompanyName: string }) => [c.CompanyName.trim().toLowerCase(), c.CompanyID]),
  );
  const sites = await db.request().query('SELECT SiteID, SiteName FROM dbo.Ref_ExternalSites');
  const siteId = new Map<string, number>(
    sites.recordset.map((s: { SiteID: number; SiteName: string }) => [s.SiteName.trim().toLowerCase(), s.SiteID]),
  );
  const jobs = await db.request().query('SELECT JobID, JobNumber FROM dbo.Ref_Jobs WHERE JobNumber IS NOT NULL');
  const jobId = new Map<string, number>(
    jobs.recordset.map((j: { JobID: number; JobNumber: string }) => [String(j.JobNumber).trim(), j.JobID]),
  );

  const haulerIds = await upsertHaulers(db, raw.haulers, companyId);
  console.log(`hauler cards ${haulerIds.size}`);
  const disposalIds = await upsertDisposal(db, raw.disposal, siteId);
  console.log(`disposal cards ${disposalIds.size}`);
  const haulerByLabel = firstLabel(raw.haulers, haulerIds, (c) => haulerLabel(c.company, c.category));
  const disposalByLabel = firstLabel(raw.disposal, disposalIds, (c) => disposalLabel(c.company, c.unit, c.category));
  await upsertHauls(db, raw.hauls, haulerByLabel, disposalByLabel, jobId);
  const linked = raw.hauls.filter((h) => h.jobNumber && jobId.has(h.jobNumber)).length;
  console.log(`imported haulers=${haulerIds.size} disposal=${disposalIds.size} hauls=${raw.hauls.length} jobsLinked=${linked}`);
  await db.close();
}

async function insertChunks(db: any, table: string, columns: string[], rows: unknown[][], idCol: string) {
  const width = columns.length;
  const size = Math.max(1, Math.floor(1800 / width));
  const ids = new Map<number, number>();
  for (let i = 0; i < rows.length; i += size) {
    const slice = rows.slice(i, i + size);
    const params: unknown[] = [];
    const groups = slice.map((row) => {
      const start = params.length;
      params.push(...row);
      return `(${row.map((_, j) => `@${start + j}`).join(',')})`;
    });
    const inserted = await run(
      db,
      `INSERT INTO dbo.${table} (${columns.join(',')})
       OUTPUT INSERTED.${idCol} AS id, INSERTED.SourceRow AS sourceRow
       VALUES ${groups.join(',')}`,
      params,
    );
    for (const row of inserted.recordset) ids.set(Number(row.sourceRow), Number(row.id));
  }
  return ids;
}

async function upsertHaulers(db: any, cards: Card[], companyId: Map<string, number>) {
  const have = await existing(db, 'Ops_HaulerRates', 'HaulerRateId');
  const fresh = cards.filter((card) => !have.has(card.sourceRow));
  const ids = await insertChunks(
    db,
    'Ops_HaulerRates',
    ['CompanyId', 'CompanyName', 'Category', 'RatePerLoad', 'RatePerHour', 'Unit', 'ShowUpHours', 'Address', 'Phone', 'Contact', 'Email', 'Coi', 'SourceRow'],
    fresh.map((card) => [
      companyId.get(card.company.trim().toLowerCase()) ?? null,
      card.company,
      card.category,
      card.ratePerLoad ?? 0,
      card.ratePerHour ?? 0,
      card.unit ?? null,
      card.showUpHours ?? null,
      card.address ?? null,
      card.phone ?? null,
      card.contact ?? null,
      card.email ?? null,
      card.coi ?? null,
      card.sourceRow,
    ]),
    'HaulerRateId',
  );
  for (const [sourceRow, id] of ids) have.set(sourceRow, id);
  return have;
}

async function upsertDisposal(db: any, cards: Card[], siteId: Map<string, number>) {
  const have = await existing(db, 'Ops_DisposalRates', 'DisposalRateId');
  const fresh = cards.filter((card) => !have.has(card.sourceRow));
  const ids = await insertChunks(
    db,
    'Ops_DisposalRates',
    ['SiteId', 'CompanyName', 'UnitLabel', 'Category', 'CostPerLoad', 'CostPerTon', 'CostPerCy', 'TruckSizeCy', 'TonsIncluded', 'Address', 'Phone', 'Contact', 'Email', 'SourceRow'],
    fresh.map((card) => [
      siteId.get(card.company.trim().toLowerCase()) ?? null,
      card.company,
      card.unit ?? null,
      card.category,
      card.costPerLoad ?? 0,
      card.costPerTon ?? 0,
      card.costPerCy ?? 0,
      card.truckSizeCy ?? 0,
      card.tonsIncluded ?? 0,
      card.address ?? null,
      card.phone ?? null,
      card.contact ?? null,
      card.email ?? null,
      card.sourceRow,
    ]),
    'DisposalRateId',
  );
  for (const [sourceRow, id] of ids) have.set(sourceRow, id);
  return have;
}

async function upsertHauls(
  db: any,
  hauls: Haul[],
  haulerByLabel: Map<string, number>,
  disposalByLabel: Map<string, number>,
  jobId: Map<string, number>,
) {
  const have = await existing(db, 'Ops_HaulTickets', 'HaulTicketId');
  const cols = [
    'TicketDate', 'JobId', 'JobNumber', 'HaulerRateId', 'Hours', 'DisposalRateId', 'GoelTicketNumber',
    'HaulingTicketNumber', 'DisposalTicketNumber', 'WasteManifestNumber', 'TransferJobNumber', 'WeightTons',
    'LightTubes', 'MetalsDirect', 'MetalsReclaimed', 'Insulation', 'Wood', 'Paper', 'Aggregates',
    'Plastics', 'Drywall', 'BoardFeetWood', 'Dirt', 'Lumber', 'BrickDeconstructed', 'BrickPallets',
    'Roofing', 'Landfill', 'Rc57', 'Rc6', 'Rc2', 'Cr57', 'DirtTons', 'SourceRow',
  ];
  let missedHauler = 0;
  let missedDisposal = 0;
  const fresh = hauls.filter((haul) => !have.has(haul.sourceRow));
  await insertChunks(
    db,
    'Ops_HaulTickets',
    cols,
    fresh.map((haul) => {
      const hauler = haul.haulerLabel ? haulerByLabel.get(haul.haulerLabel) ?? null : null;
      const disposal = haul.disposalLabel ? disposalByLabel.get(haul.disposalLabel) ?? null : null;
      if (haul.haulerLabel && hauler == null) missedHauler += 1;
      if (haul.disposalLabel && disposal == null) missedDisposal += 1;
      return [
        haul.ticketDate,
        haul.jobNumber ? jobId.get(haul.jobNumber) ?? null : null,
        haul.jobNumber,
        hauler,
        haul.hours,
        disposal,
        haul.goelTicketNumber,
        haul.haulingTicketNumber,
        haul.disposalTicketNumber,
        haul.wasteManifestNumber,
        haul.transferJobNumber,
        haul.weightTons,
        ...QTY.map((key) => haul[key] ?? null),
        haul.sourceRow,
      ];
    }),
    'HaulTicketId',
  );
  console.log(`unmatched hauler labels ${missedHauler}, unmatched destinations ${missedDisposal}`);
  await fillJobNames(db, hauls);
}

async function fillJobNames(db: any, hauls: Haul[]) {
  const named = hauls.filter((h) => h.jobName && h.jobName !== '---');
  const size = 80;
  for (let i = 0; i < named.length; i += size) {
    const slice = named.slice(i, i + size);
    const params: unknown[] = [];
    const values = slice.map((h) => {
      const start = params.length;
      params.push(h.sourceRow, h.jobName);
      return `(@${start}, @${start + 1})`;
    });
    await run(
      db,
      `UPDATE h SET JobName = n.JobName
       FROM dbo.Ops_HaulTickets h
       JOIN (VALUES ${values.join(',')}) AS n(SourceRow, JobName) ON n.SourceRow = h.SourceRow`,
      params,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
