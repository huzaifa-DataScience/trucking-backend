import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { pfJobKey, PfCostBlock, pfCost } from './project-financials.util';

/** Same company split as WFS / Siteline entity ids. */
export const PF_FOUNDATION_COMPANIES = [
  { schema: 'GC', entityId: 1, tables: ['job_history', 'his_job_history'] },
  { schema: 'GoelDC', entityId: 2, tables: ['job_history'] },
  { schema: 'CB', entityId: 3, tables: ['job_history'] },
] as const;

export type FoundationCostMaps = {
  ok: boolean;
  byEntityJob: Map<string, PfCostBlock>;
  byJob: Map<string, PfCostBlock[]>;
};

const log = new Logger('FoundationJobCost');

function n(v: unknown): number {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}

function costSql(db: string, schema: string, table: string): string {
  return `
    SELECT
      LTRIM(RTRIM(job_no)) AS jobNo,
      SUM(CASE WHEN LTRIM(RTRIM(cost_class_no)) = '1' THEN ISNULL(cost, 0) ELSE 0 END) AS lab,
      SUM(CASE WHEN LTRIM(RTRIM(cost_class_no)) = '2' THEN ISNULL(cost, 0) ELSE 0 END) AS mat,
      SUM(CASE WHEN LTRIM(RTRIM(cost_class_no)) = '3' THEN ISNULL(cost, 0) ELSE 0 END) AS sub,
      SUM(CASE WHEN LTRIM(RTRIM(cost_class_no)) IN ('4', '5') THEN ISNULL(cost, 0) ELSE 0 END) AS equ,
      SUM(CASE WHEN LTRIM(RTRIM(cost_class_no)) = '6' THEN ISNULL(cost, 0) ELSE 0 END) AS bur,
      SUM(CASE WHEN LTRIM(RTRIM(cost_class_no)) = '7' THEN ISNULL(cost, 0) ELSE 0 END) AS ins,
      SUM(CASE WHEN LTRIM(RTRIM(cost_class_no)) = '8' THEN ISNULL(cost, 0) ELSE 0 END) AS oth,
      SUM(CASE WHEN LTRIM(RTRIM(cost_class_no)) = '9' THEN ISNULL(cost, 0) ELSE 0 END) AS dis,
      SUM(CASE WHEN LTRIM(RTRIM(cost_class_no)) = '1' THEN ISNULL(units, 0) ELSE 0 END) AS labHours
    FROM [${db}].[${schema}].[${table}] WITH (NOLOCK)
    WHERE record_status <> 'D'
    GROUP BY LTRIM(RTRIM(job_no))
  `;
}

async function loadSchema(
  ds: DataSource,
  db: string,
  schema: string,
  tables: readonly string[],
): Promise<Record<string, unknown>[] | null> {
  for (const table of tables) {
    try {
      return await ds.query(costSql(db, schema, table));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      log.warn(`Foundation ${schema}.${table} skipped: ${msg}`);
    }
  }
  return null;
}

export async function loadFoundationJobCosts(
  ds: DataSource,
  db: string,
): Promise<FoundationCostMaps> {
  const byEntityJob = new Map<string, PfCostBlock>();
  const byJob = new Map<string, PfCostBlock[]>();
  let ok = false;

  for (const co of PF_FOUNDATION_COMPANIES) {
    const rows = await loadSchema(ds, db, co.schema, co.tables);
    if (!rows) continue;
    ok = true;
    for (const raw of rows) {
      const key = pfJobKey(raw.jobNo == null ? null : String(raw.jobNo));
      if (!key) continue;
      const cost = pfCost({
        lab: n(raw.lab),
        mat: n(raw.mat),
        sub: n(raw.sub),
        equ: n(raw.equ),
        bur: n(raw.bur),
        ins: n(raw.ins),
        oth: n(raw.oth),
        dis: n(raw.dis),
        labHours: n(raw.labHours),
      });
      byEntityJob.set(`${co.entityId}:${key}`, cost);
      const list = byJob.get(key) ?? [];
      list.push(cost);
      byJob.set(key, list);
    }
  }

  return { ok, byEntityJob, byJob };
}

export function pickFoundationCost(
  maps: FoundationCostMaps,
  entityId: number | null,
  jobKey: string,
): PfCostBlock | null {
  if (entityId != null) {
    const hit = maps.byEntityJob.get(`${entityId}:${jobKey}`);
    if (hit) return hit;
  }
  const list = maps.byJob.get(jobKey) ?? [];
  if (!list.length) return null;
  if (list.length === 1) return list[0];
  return list.reduce((acc, row) =>
    pfCost({
      lab: acc.lab + row.lab,
      mat: acc.mat + row.mat,
      sub: acc.sub + row.sub,
      equ: acc.equ + row.equ,
      bur: acc.bur + row.bur,
      ins: acc.ins + row.ins,
      oth: acc.oth + row.oth,
      dis: acc.dis + row.dis,
      labHours: acc.labHours + row.labHours,
    }),
  );
}

export function emptyFoundationMaps(): FoundationCostMaps {
  return { ok: false, byEntityJob: new Map(), byJob: new Map() };
}
