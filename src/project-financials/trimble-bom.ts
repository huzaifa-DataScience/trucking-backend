import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { pfJobKey, roundMoney } from './project-financials.util';

export type PfTrimbleRollup = {
  projectIds: number[];
  itemCount: number;
  ordered: number;
  received: number;
  orderedMinusReceived: number;
  actualCost: number;
  laborHours: number;
  estLaborHours: number;
  bomBudget: number;
  remaining: number | null;
  pctUsed: number | null;
};

const log = new Logger('PfTrimbleBom');

const COLS = {
  ordered: ['ordered'],
  received: ['received'],
  actualCost: ['actual cost', 'actualcost'],
  laborHours: ['labor hours', 'laborhours'],
  estLaborHours: ['est. labor hours', 'est labor hours', 'rev. labor hours', 'rev labor hours'],
  bomBudget: ['est. total cost', 'est total cost', 'rev. total cost', 'rev total cost'],
  remaining: ['remaining'],
  pctUsed: ['% used', 'pct used', 'percent used'],
} as const;

function norm(name: string): string {
  return name.replace(/\u00a0/g, ' ').trim().replace(/\s+/g, ' ').toLowerCase();
}

function pickCol(available: string[], aliases: readonly string[]): string | null {
  const map = new Map(available.map((c) => [norm(c), c]));
  for (const a of aliases) {
    const hit = map.get(a);
    if (hit) return hit;
  }
  return null;
}

function bracket(name: string): string {
  return `[${name.replace(/\]/g, ']]')}]`;
}

function n(v: unknown): number {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}

export async function loadTrimbleBomByJob(
  ds: DataSource,
): Promise<{ ok: boolean; byJob: Map<string, PfTrimbleRollup> }> {
  const byJob = new Map<string, PfTrimbleRollup>();
  try {
    const projects: { Id: string | number; JobNumber: string | null }[] = await ds.query(
      `SELECT Id, JobNumber FROM dbo.Trimble_Projects WHERE JobNumber IS NOT NULL AND LTRIM(RTRIM(JobNumber)) <> ''`,
    );
    const projectKey = new Map<number, string>();
    for (const p of projects) {
      const key = pfJobKey(p.JobNumber);
      if (!key) continue;
      projectKey.set(Number(p.Id), key);
    }
    if (!projectKey.size) return { ok: true, byJob };

    const colRows: { COLUMN_NAME: string }[] = await ds.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = N'dbo' AND TABLE_NAME = N'Trimble_ProjectLineItems'`,
    );
    const available = colRows.map((r) => r.COLUMN_NAME);
    const col = {
      ordered: pickCol(available, COLS.ordered),
      received: pickCol(available, COLS.received),
      actualCost: pickCol(available, COLS.actualCost),
      laborHours: pickCol(available, COLS.laborHours),
      estLaborHours: pickCol(available, COLS.estLaborHours),
      bomBudget: pickCol(available, COLS.bomBudget),
      remaining: pickCol(available, COLS.remaining),
      pctUsed: pickCol(available, COLS.pctUsed),
    };

    const sums = Object.entries(col)
      .filter(([, name]) => name)
      .map(([alias, name]) => `SUM(TRY_CONVERT(float, ${bracket(name!)})) AS ${alias}`)
      .join(',\n          ');

    const sql = `
      SELECT ProjectId, COUNT_BIG(*) AS itemCount
        ${sums ? `,\n          ${sums}` : ''}
      FROM dbo.Trimble_ProjectLineItems
      GROUP BY ProjectId
    `;
    const rows: Record<string, unknown>[] = await ds.query(sql);

    for (const row of rows) {
      const pid = Number(row.ProjectId);
      const key = projectKey.get(pid);
      if (!key) continue;
      const ordered = n(row.ordered);
      const received = n(row.received);
      const next: PfTrimbleRollup = {
        projectIds: [pid],
        itemCount: n(row.itemCount),
        ordered,
        received,
        orderedMinusReceived: roundMoney(ordered - received),
        actualCost: n(row.actualCost),
        laborHours: n(row.laborHours),
        estLaborHours: n(row.estLaborHours),
        bomBudget: n(row.bomBudget),
        remaining: row.remaining == null ? null : n(row.remaining),
        pctUsed: row.pctUsed == null ? null : n(row.pctUsed),
      };
      const prev = byJob.get(key);
      if (!prev) {
        byJob.set(key, next);
        continue;
      }
      byJob.set(key, {
        projectIds: [...prev.projectIds, pid],
        itemCount: prev.itemCount + next.itemCount,
        ordered: roundMoney(prev.ordered + next.ordered),
        received: roundMoney(prev.received + next.received),
        orderedMinusReceived: roundMoney(prev.ordered + next.ordered - (prev.received + next.received)),
        actualCost: roundMoney(prev.actualCost + next.actualCost),
        laborHours: roundMoney(prev.laborHours + next.laborHours),
        estLaborHours: roundMoney(prev.estLaborHours + next.estLaborHours),
        bomBudget: roundMoney(prev.bomBudget + next.bomBudget),
        remaining:
          prev.remaining == null && next.remaining == null
            ? null
            : roundMoney((prev.remaining ?? 0) + (next.remaining ?? 0)),
        pctUsed: null,
      });
    }
    return { ok: true, byJob };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    log.warn(`Trimble BOM skipped: ${msg}`);
    return { ok: false, byJob };
  }
}
