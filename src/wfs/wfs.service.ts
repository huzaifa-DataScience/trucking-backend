import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { DataSource, Repository } from 'typeorm';
import { WfsSnapshot } from '../database/entities/wfs-snapshot.entity';
import { WfsStaticItem } from '../database/entities/wfs-static-item.entity';
import {
  AgingBuckets,
  CompanyLive,
  CompanyStatic,
  WFS_COMPANIES,
  WfsCompanyKey,
  WfsCompanyRow,
  WfsTotals,
  WFS_CADENCE,
  agingTable,
  companyByPlaidName,
  companyPlate,
  emptyAging,
  emptyStatic,
  groupPlate,
  v44Charts,
  WFS_HISTORY_PRESETS,
  filterHistory,
  isWfsCompanyKey,
  resolveHistoryWindow,
  kpiDelta,
  money,
  nextSnapshotDate,
} from './wfs-plate';

type AgingRow = {
  partyNo: string;
  partyName: string;
  jobNo: string | null;
  jobDesc: string | null;
  invoiceNo: string;
  invoiceDate: string | null;
  current: number;
  d31: number;
  d61: number;
  d90: number;
  retainage: number;
  total: number;
  age: number | null;
};

function n(v: unknown): number {
  const x = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(x) ? x : 0;
}

function isoDay(v: unknown): string | null {
  if (v == null || v === '') return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

@Injectable()
export class WfsService implements OnModuleInit {
  private readonly logger = new Logger(WfsService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    @InjectRepository(WfsStaticItem)
    private readonly staticRepo: Repository<WfsStaticItem>,
    @InjectRepository(WfsSnapshot)
    private readonly snapshotRepo: Repository<WfsSnapshot>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureTable();
  }

  private foundationDb(): string {
    return this.config.get<string>('WFS_FOUNDATION_DB', 'FoundationData') || 'FoundationData';
  }

  private plaidDb(): string {
    return this.config.get<string>('WFS_PLAID_DB', 'PlaidDB') || 'PlaidDB';
  }

  private async ensureTable(): Promise<void> {
    for (const file of ['add-wfs-static.sql', 'add-wfs-snapshots.sql']) {
      const full = join(process.cwd(), 'scripts/sql', file);
      if (!existsSync(full)) continue;
      try {
        const raw = readFileSync(full, 'utf8');
        const batches = raw.split(/\bGO\b/i).map((s) => s.trim()).filter(Boolean);
        for (const batch of batches) await this.dataSource.query(batch);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        this.logger.warn(`WFS DDL ${file} skipped: ${msg}`);
      }
    }
  }

  async status() {
    const [aging, cash] = await Promise.all([this.agingTotals(), this.plaidOperating()]);
    return {
      foundationDb: this.foundationDb(),
      plaidDb: this.plaidDb(),
      foundation: aging.ok,
      plaid: cash.ok,
      missing: [...aging.missing, ...cash.missing],
      asOf: cash.retrievedAt,
    };
  }

  async dashboard(filter: { range?: string; from?: string; to?: string } = {}) {
    const [staticItems, aging, cash, snaps] = await Promise.all([
      this.staticRepo.find({ order: { sortOrder: 'ASC', id: 'ASC' } }),
      this.agingTotals(),
      this.plaidOperating(),
      this.snapshotRepo.find({ order: { snapshotDate: 'ASC' } }),
    ]);
    const byKey = this.staticByCompany(staticItems);
    const rows = WFS_COMPANIES.map((def) => {
      const live: CompanyLive = {
        ar: aging.byCompany[def.key]?.ar ?? (def.arView ? emptyAging() : null),
        ap: aging.byCompany[def.key]?.ap ?? (def.apView ? emptyAging() : null),
        plaidOperating: cash.byCompany[def.key] ?? 0,
      };
      return companyPlate(def, live, byKey[def.key] ?? emptyStatic());
    });
    const totals = groupPlate(rows);
    const g3 = rows.find((r) => r.key === 'g3');
    const propertyValue = byKey.g3?.propertyValue ?? 0;
    const history = snaps.map((s) => ({
      date: isoDay(s.snapshotDate) ?? '',
      totalEquity: n(s.totalEquity),
      availableCash: n(s.availableCash),
      goelEquity: n(s.goelEquity),
      goelCash: n(s.goelCash),
      goelAr: n(s.goelAr),
      goelAp: n(s.goelAp),
      goelDcEquity: n(s.goelDcEquity),
      goelDcCash: n(s.goelDcCash),
      goelDcAr: n(s.goelDcAr),
      goelDcAp: n(s.goelDcAp),
      dcbEquity: n(s.dcbEquity),
      dcbCash: n(s.dcbCash),
      dcbAr: n(s.dcbAr),
      dcbAp: n(s.dcbAp),
      ar: money(n(s.goelAr) + n(s.goelDcAr) + n(s.dcbAr)),
      ap: money(n(s.goelAp) + n(s.goelDcAp) + n(s.dcbAp)),
    }));
    const window = resolveHistoryWindow(filter.range, filter.from, filter.to);
    const chartHistory = filterHistory(history, window);
    const last = history[history.length - 1] ?? null;
    const today = new Date().toISOString().slice(0, 10);
    const prior =
      last && last.date === today && history.length >= 2 ? history[history.length - 2] : last;
    const comparedTo = prior
      ? {
          asOf: prior.date,
          totalEquity: prior.totalEquity,
          availableCash: prior.availableCash,
          ar: prior.ar,
          ap: prior.ap,
          netArAp: money(prior.ar - prior.ap),
        }
      : null;
    const agingRows = agingTable(rows);
    void this.backfillHistory(rows, totals).catch((e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`WFS history backfill skipped: ${msg}`);
    });
    return {
      title: 'MONTHLY FINANCIAL HEALTH DASHBOARD',
      subtitle: 'Equity, Cash, AR, AP and Loans by company',
      asOf: cash.retrievedAt,
      cadence: WFS_CADENCE,
      nextSnapshotDate: nextSnapshotDate(),
      historyFilter: {
        range: window.range,
        from: window.from,
        to: window.to,
        presets: WFS_HISTORY_PRESETS,
      },
      comparedTo,
      sources: {
        foundationDb: this.foundationDb(),
        plaidDb: this.plaidDb(),
        foundation: aging.ok,
        plaid: cash.ok,
        missing: [...aging.missing, ...cash.missing],
      },
      kpis: {
        totalEquity: { value: totals.equity, ...kpiDelta(totals.equity, comparedTo?.totalEquity ?? null) },
        availableCash: { value: totals.availCash, ...kpiDelta(totals.availCash, comparedTo?.availableCash ?? null) },
        totalAr: { value: totals.ar, ...kpiDelta(totals.ar, comparedTo?.ar ?? null) },
        totalAp: { value: totals.ap, ...kpiDelta(totals.ap, comparedTo?.ap ?? null) },
        netArAp: { value: totals.netArAp, ...kpiDelta(totals.netArAp, comparedTo?.netArAp ?? null) },
      },
      companies: rows,
      totals,
      aging: agingRows,
      charts: v44Charts(chartHistory, rows),
      property: {
        value: propertyValue,
        evaluationDate: isoDay(staticItems.find((s) => s.kind === 'property_value')?.asOfDate),
        debt: g3?.borrowing ?? 0,
        cashHeld: g3?.bank ?? 0,
        netEquity: g3?.equity ?? 0,
        shareOfGroupEquity: totals.equity ? money((g3?.equity ?? 0) / totals.equity) : 0,
      },
    };
  }

  /** Monday 06:10 ET — write this week's history point. No UI button. */
  @Cron('0 10 6 * * 1', { name: 'wfs-history', timeZone: 'America/New_York' })
  async captureWeeklyHistory(): Promise<void> {
    try {
      const { rows, totals } = await this.liveRows();
      await this.upsertHistory(new Date().toISOString().slice(0, 10), rows, totals);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`WFS history cron skipped: ${msg}`);
    }
  }

  private async liveRows(): Promise<{ rows: WfsCompanyRow[]; totals: WfsTotals }> {
    const [staticItems, aging, cash] = await Promise.all([
      this.staticRepo.find({ order: { sortOrder: 'ASC', id: 'ASC' } }),
      this.agingTotals(),
      this.plaidOperating(),
    ]);
    const byKey = this.staticByCompany(staticItems);
    const rows = WFS_COMPANIES.map((def) => {
      const live: CompanyLive = {
        ar: aging.byCompany[def.key]?.ar ?? (def.arView ? emptyAging() : null),
        ap: aging.byCompany[def.key]?.ap ?? (def.apView ? emptyAging() : null),
        plaidOperating: cash.byCompany[def.key] ?? 0,
      };
      return companyPlate(def, live, byKey[def.key] ?? emptyStatic());
    });
    return { rows, totals: groupPlate(rows) };
  }

  /** If last history row is ≥7 days old, save today (covers API down on Monday). */
  private async backfillHistory(rows: WfsCompanyRow[], totals: WfsTotals): Promise<void> {
    const last = await this.snapshotRepo.find({ order: { snapshotDate: 'DESC' }, take: 1 });
    const lastDay = isoDay(last[0]?.snapshotDate);
    const today = new Date().toISOString().slice(0, 10);
    if (lastDay === today) return;
    if (lastDay) {
      const gap = (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${lastDay}T00:00:00Z`)) / 86400000;
      if (gap < 7) return;
    }
    await this.upsertHistory(today, rows, totals);
  }

  private async upsertHistory(day: string, rows: WfsCompanyRow[], totals: WfsTotals) {
    const existing = await this.snapshotRepo.findOne({ where: { snapshotDate: new Date(`${day}T00:00:00Z`) } });
    const goel = rows.find((c) => c.key === 'goel');
    const gdc = rows.find((c) => c.key === 'goel_dc');
    const dcb = rows.find((c) => c.key === 'dcb');
    const row = existing ?? this.snapshotRepo.create({ snapshotDate: new Date(`${day}T00:00:00Z`) });
    row.totalEquity = totals.equity.toFixed(2);
    row.availableCash = totals.availCash.toFixed(2);
    row.goelEquity = (goel?.equity ?? 0).toFixed(2);
    row.goelCash = (goel?.bank ?? 0).toFixed(2);
    row.goelAr = (goel?.ar ?? 0).toFixed(2);
    row.goelAp = (goel?.ap ?? 0).toFixed(2);
    row.goelDcEquity = (gdc?.equity ?? 0).toFixed(2);
    row.goelDcCash = (gdc?.bank ?? 0).toFixed(2);
    row.goelDcAr = (gdc?.ar ?? 0).toFixed(2);
    row.goelDcAp = (gdc?.ap ?? 0).toFixed(2);
    row.dcbEquity = (dcb?.equity ?? 0).toFixed(2);
    row.dcbCash = (dcb?.bank ?? 0).toFixed(2);
    row.dcbAr = (dcb?.ar ?? 0).toFixed(2);
    row.dcbAp = (dcb?.ap ?? 0).toFixed(2);
    if (!existing) row.createdAt = new Date();
    await this.snapshotRepo.save(row);
  }

  async listStatic() {
    const rows = await this.staticRepo.find({ order: { sortOrder: 'ASC', id: 'ASC' } });
    return rows.map((r) => ({
      id: r.id,
      companyKey: r.companyKey,
      ourEntityId: r.ourEntityId,
      kind: r.kind,
      label: r.label,
      amount: money(n(r.amount)),
      asOfDate: isoDay(r.asOfDate),
      sortOrder: r.sortOrder,
      updatedAt: r.updatedAt,
    }));
  }

  async patchStatic(items: { id: number; amount?: number; label?: string; asOfDate?: string | null }[]) {
    if (!Array.isArray(items) || !items.length) throw new BadRequestException('items required');
    const out = [];
    for (const patch of items) {
      const id = Math.trunc(Number(patch.id));
      if (!id) throw new BadRequestException('each item needs id');
      const row = await this.staticRepo.findOne({ where: { id } });
      if (!row) throw new BadRequestException(`static item ${id} not found`);
      if (patch.amount !== undefined) {
        const amount = Number(patch.amount);
        if (!Number.isFinite(amount)) throw new BadRequestException(`bad amount on ${id}`);
        row.amount = amount.toFixed(2);
      }
      if (patch.label !== undefined) row.label = String(patch.label).slice(0, 200);
      if (patch.asOfDate !== undefined) {
        row.asOfDate = patch.asOfDate ? new Date(`${patch.asOfDate}T00:00:00Z`) : null;
      }
      row.updatedAt = new Date();
      out.push(await this.staticRepo.save(row));
    }
    return out;
  }

  async agingLines(companyKey: string, side: string): Promise<AgingRow[]> {
    if (!isWfsCompanyKey(companyKey)) throw new BadRequestException('unknown company');
    const def = WFS_COMPANIES.find((c) => c.key === companyKey);
    const view = side === 'ap' ? def?.apView : def?.arView;
    if (!view) throw new BadRequestException(`${companyKey} has no ${side} aging`);
    const db = this.foundationDb();
    const isAp = side === 'ap';
    const rows: Record<string, unknown>[] = await this.dataSource.query(`
      SELECT
        ${isAp ? 'vendor_no' : 'customer_no'} AS partyNo,
        ${isAp ? 'vendor_name' : 'customer_name'} AS partyName,
        job_no AS jobNo,
        ${isAp ? 'NULL' : 'job_desc'} AS jobDesc,
        invoice_no AS invoiceNo,
        invoice_date AS invoiceDate,
        [Current] AS currentAmt,
        [31-60 Days] AS d31,
        [61-90 Days] AS d61,
        [90+ Days] AS d90,
        Retainage AS retainage,
        Total AS total,
        Age AS age
      FROM [${db}].dbo.[${view}]
      ORDER BY invoice_date DESC, invoice_no
    `);
    return rows.map((r) => ({
      partyNo: String(r.partyNo ?? ''),
      partyName: String(r.partyName ?? ''),
      jobNo: r.jobNo != null ? String(r.jobNo) : null,
      jobDesc: r.jobDesc != null ? String(r.jobDesc) : null,
      invoiceNo: String(r.invoiceNo ?? ''),
      invoiceDate: isoDay(r.invoiceDate),
      current: money(n(r.currentAmt)),
      d31: money(n(r.d31)),
      d61: money(n(r.d61)),
      d90: money(n(r.d90)),
      retainage: money(n(r.retainage)),
      total: money(n(r.total)),
      age: r.age == null ? null : n(r.age),
    }));
  }

  async cashAccounts() {
    const db = this.plaidDb();
    try {
      const rows: Record<string, unknown>[] = await this.dataSource.query(`
        SELECT account_name, official_name, mask_last_digits, Company,
               Business_Account_Type, available_balance, current_balance, retrieved_at
        FROM [${db}].dbo.vw_LatestPlaidBalances
        ORDER BY Company, Business_Account_Type
      `);
      return rows.map((r) => {
        const def = companyByPlaidName(String(r.Company ?? ''));
        return {
          companyKey: def?.key ?? null,
          company: String(r.Company ?? ''),
          accountName: String(r.account_name ?? ''),
          officialName: String(r.official_name ?? ''),
          mask: String(r.mask_last_digits ?? ''),
          accountType: String(r.Business_Account_Type ?? ''),
          available: money(n(r.available_balance)),
          current: money(n(r.current_balance)),
          retrievedAt: r.retrieved_at instanceof Date ? r.retrieved_at.toISOString() : String(r.retrieved_at ?? ''),
        };
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`Plaid balances skipped: ${msg}`);
      return [];
    }
  }

  private staticByCompany(items: WfsStaticItem[]): Record<WfsCompanyKey, CompanyStatic> {
    const out = {} as Record<WfsCompanyKey, CompanyStatic>;
    for (const def of WFS_COMPANIES) out[def.key] = emptyStatic();
    for (const item of items) {
      if (!isWfsCompanyKey(item.companyKey)) continue;
      const row = out[item.companyKey];
      const amount = n(item.amount);
      if (item.kind === 'loc_limit') row.locLimit += amount;
      else if (item.kind === 'loc_drawn') row.locDrawn += amount;
      else if (item.kind === 'pnote') row.pnotes += amount;
      else if (item.kind === 'extra_cash') row.extraCash += amount;
      else if (item.kind === 'property_value') row.propertyValue += amount;
      else if (item.kind === 'mortgage') row.mortgages += amount;
      else if (item.kind === 'equipment_loan') row.equipmentLoan += amount;
    }
    return out;
  }

  private async agingTotals(): Promise<{
    byCompany: Partial<Record<WfsCompanyKey, { ar?: AgingBuckets; ap?: AgingBuckets }>>;
    ok: boolean;
    missing: string[];
  }> {
    const db = this.foundationDb();
    const byCompany: Partial<Record<WfsCompanyKey, { ar?: AgingBuckets; ap?: AgingBuckets }>> = {};
    const missing: string[] = [];
    for (const def of WFS_COMPANIES) {
      if (def.arView) {
        const ar = await this.sumAging(db, def.arView);
        if (!ar) missing.push(`${db}.dbo.${def.arView}`);
        else byCompany[def.key] = { ...(byCompany[def.key] ?? {}), ar };
      }
      if (def.apView) {
        const ap = await this.sumAging(db, def.apView);
        if (!ap) missing.push(`${db}.dbo.${def.apView}`);
        else byCompany[def.key] = { ...(byCompany[def.key] ?? {}), ap };
      }
    }
    return { byCompany, ok: missing.length === 0, missing };
  }

  private async sumAging(db: string, view: string): Promise<AgingBuckets | null> {
    try {
      const rows: Record<string, unknown>[] = await this.dataSource.query(`
        SELECT
          SUM([Current]) AS currentAmt,
          SUM([31-60 Days]) AS d31,
          SUM([61-90 Days]) AS d61,
          SUM([90+ Days]) AS d90,
          SUM(Retainage) AS retainage,
          SUM(Total) AS total
        FROM [${db}].dbo.[${view}]
      `);
      const r = rows[0] ?? {};
      return {
        current: money(n(r.currentAmt)),
        d31: money(n(r.d31)),
        d61: money(n(r.d61)),
        d90: money(n(r.d90)),
        retainage: money(n(r.retainage)),
        total: money(n(r.total)),
      };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`Aging ${view} skipped: ${msg}`);
      return null;
    }
  }

  private async plaidOperating(): Promise<{
    ok: boolean;
    missing: string[];
    retrievedAt: string | null;
    byCompany: Partial<Record<WfsCompanyKey, number>>;
  }> {
    const db = this.plaidDb();
    try {
      const rows: Record<string, unknown>[] = await this.dataSource.query(`
        SELECT Company, Business_Account_Type, current_balance, retrieved_at
        FROM [${db}].dbo.vw_LatestPlaidBalances
      `);
      const byCompany: Partial<Record<WfsCompanyKey, number>> = {};
      let retrievedAt: string | null = null;
      for (const r of rows) {
        if (!retrievedAt && r.retrieved_at) {
          retrievedAt = r.retrieved_at instanceof Date ? r.retrieved_at.toISOString() : String(r.retrieved_at);
        }
        if (String(r.Business_Account_Type ?? '') !== 'Operating Account') continue;
        const def = companyByPlaidName(String(r.Company ?? ''));
        if (!def) continue;
        byCompany[def.key] = money((byCompany[def.key] ?? 0) + n(r.current_balance));
      }
      return { ok: true, missing: [], retrievedAt, byCompany };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`Plaid operating cash skipped: ${msg}`);
      return { ok: false, missing: [`${db}.dbo.vw_LatestPlaidBalances`], retrievedAt: null, byCompany: {} };
    }
  }
}
