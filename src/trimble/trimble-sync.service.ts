import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  TrimbleLineItemRawExport,
  TrimbleProject,
  TrimbleProjectLineItem,
  TrimbleSyncState,
} from '../database/entities';
import { TrimbleApiClient, TrimbleProjectRow } from './trimble-api.client';
import { TrimbleLineItemIngestService } from './trimble-line-item-ingest.service';

/**
 * Evaluated at module load (before the class is wired) so the `@Cron` decorator
 * can read it.  `dotenv/config` must run before `AppModule` in `main.ts` for
 * `process.env` to be populated here — which the existing bootstrap already
 * guarantees (Clearstory uses the same pattern).
 *
 * Default: every 6 hours.  381 projects × ~1-2s each = ~10-15 min per run,
 * so 6h gives plenty of breathing room.  Override via TRIMBLE_SYNC_CRON in
 * .env (e.g. "0 30 2 * * *" for once-a-day at 02:30).
 */
const TRIMBLE_CRON_EXPR =
  (process.env.TRIMBLE_SYNC_CRON ?? '0 0 */6 * * *').trim() || '0 0 */6 * * *';

const STATE_KEYS = {
  lastRunStartedAt: 'lastRunStartedAt',
  lastRunFinishedAt: 'lastRunFinishedAt',
  lastSuccessfulRunAt: 'lastSuccessfulRunAt',
  lastError: 'lastError',
  lastPhase: 'lastPhase',
  projectsSeen: 'projectsSeen',
  exportsDownloaded: 'exportsDownloaded',
  exportsEmptyLineItems: 'exportsEmptyLineItems',
  exportsFailed: 'exportsFailed',
} as const;

/**
 * Scheduled sync that mirrors all StructShare / Trimble Materials projects and
 * pulls each project's Line Items workbook (XLSX) into our DB.
 *
 * Cron defaults to every 6 hours; override with TRIMBLE_SYNC_CRON in .env.
 * Disable entirely with TRIMBLE_SYNC_ENABLED=false.
 */
@Injectable()
export class TrimbleSyncService implements OnModuleInit {
  private readonly logger = new Logger(TrimbleSyncService.name);
  private syncRunning = false;

  constructor(
    private readonly config: ConfigService,
    private readonly api: TrimbleApiClient,
    private readonly dataSource: DataSource,
    private readonly lineItemIngest: TrimbleLineItemIngestService,
    @InjectRepository(TrimbleProject) private readonly projects: Repository<TrimbleProject>,
    @InjectRepository(TrimbleLineItemRawExport)
    private readonly rawExports: Repository<TrimbleLineItemRawExport>,
    @InjectRepository(TrimbleSyncState) private readonly state: Repository<TrimbleSyncState>,
  ) {}

  async onModuleInit(): Promise<void> {
    const enabled = this.config.get<string>('TRIMBLE_SYNC_ENABLED', 'true') !== 'false';
    this.logger.log(
      `Trimble sync will run on cron "${TRIMBLE_CRON_EXPR}"${enabled ? '' : ' (DISABLED via TRIMBLE_SYNC_ENABLED=false)'}`,
    );
    try {
      await this.ensureTables();
    } catch (err: any) {
      this.logger.error(`Trimble ensureTables failed: ${err?.message ?? err}`);
    }

    // Optional: fire one sync a few seconds after boot, so a freshly-deployed
    // server validates its credentials and populates the DB without waiting
    // for the next cron tick.  Off by default to keep local dev restarts fast.
    const runOnStartup = this.config.get<string>('TRIMBLE_RUN_ON_STARTUP', 'false') === 'true';
    if (enabled && runOnStartup) {
      const delayMs =
        Number(this.config.get<string>('TRIMBLE_RUN_ON_STARTUP_DELAY_MS', '5000')) || 5000;
      this.logger.log(`Trimble sync: TRIMBLE_RUN_ON_STARTUP=true → will run once in ${delayMs}ms.`);
      setTimeout(() => {
        this.syncNow().catch((err) =>
          this.logger.error(`Trimble startup sync failed: ${err?.message ?? err}`),
        );
      }, delayMs).unref();
    }
  }

  isSyncRunning(): boolean {
    return this.syncRunning;
  }

  /**
   * Cron schedule — spec is taken from TRIMBLE_SYNC_CRON env at module load.
   * Default: every 6 hours (see TRIMBLE_CRON_EXPR above).
   * Runtime kill-switch: TRIMBLE_SYNC_ENABLED=false.
   */
  @Cron(TRIMBLE_CRON_EXPR, { name: 'trimble-sync' })
  async cronTick(): Promise<void> {
    if (this.config.get<string>('TRIMBLE_SYNC_ENABLED', 'true') === 'false') {
      this.logger.debug('TRIMBLE_SYNC_ENABLED=false — skipping cron tick.');
      return;
    }
    if (this.syncRunning) {
      this.logger.warn('Trimble sync already in progress — skipping cron tick.');
      return;
    }
    await this.syncNow().catch((err) => this.logger.error(`Trimble cron sync failed: ${err?.message ?? err}`));
  }

  /**
   * Public entry point.  Mirrors `ClearstorySyncService.syncNow()` semantics:
   * never throws; logs everything to TrimbleSyncState so the dashboard can
   * surface the latest run status.
   */
  async syncNow(): Promise<{
    ok: boolean;
    projectsSeen: number;
    exportsDownloaded: number;
    exportsEmptyLineItems: number;
    exportsFailed: number;
    error?: string;
  }> {
    if (this.syncRunning) {
      return {
        ok: false,
        projectsSeen: 0,
        exportsDownloaded: 0,
        exportsEmptyLineItems: 0,
        exportsFailed: 0,
        error: 'already running',
      };
    }
    this.syncRunning = true;
    const startedAt = new Date();
    let projectsSeen = 0;
    let exportsDownloaded = 0;
    let exportsEmptyLineItems = 0;
    let exportsFailed = 0;

    try {
      await this.setState(STATE_KEYS.lastRunStartedAt, startedAt.toISOString());
      await this.setState(STATE_KEYS.lastError, null);
      await this.setState(STATE_KEYS.lastPhase, 'login');

      this.logger.log('Trimble sync: logging in via Playwright…');
      await this.api.ensureSession();

      await this.setState(STATE_KEYS.lastPhase, 'list-projects');
      this.logger.log('Trimble sync: enumerating projects…');
      const allProjects: TrimbleProjectRow[] = [];
      for await (const row of this.api.iterateAllProjects({ isActive: true, limit: 25 })) {
        allProjects.push(row);
      }
      projectsSeen = allProjects.length;
      this.logger.log(`Trimble sync: ${projectsSeen} active projects found.`);
      await this.upsertProjects(allProjects);
      await this.setState(STATE_KEYS.projectsSeen, String(projectsSeen));

      await this.setState(STATE_KEYS.lastPhase, 'download-line-items');
      const concurrency = Math.max(
        1,
        Math.min(8, Number(this.config.get<string>('TRIMBLE_DOWNLOAD_CONCURRENCY', '3')) || 3),
      );
      const interProjectDelayMs =
        Number(this.config.get<string>('TRIMBLE_DOWNLOAD_DELAY_MS', '0')) || 0;

      this.logger.log(
        `Trimble sync: downloading line-items workbooks (concurrency=${concurrency}, delayMs=${interProjectDelayMs})…`,
      );

      const queue = [...allProjects];
      const workers = Array.from({ length: concurrency }, async () => {
        while (queue.length) {
          const proj = queue.shift();
          if (!proj) return;
          try {
            const dl = await this.api.downloadLineItemsExcel(proj.id, proj.companyId);
            const hasWorkbook = dl.buffer.length > 0;
            if (!hasWorkbook) {
              exportsEmptyLineItems++;
              this.logger.debug(
                `Trimble sync: projectId=${proj.id} line-items export empty (no XLSX — nothing to export or API returned no file).`,
              );
            }
            const fileName = hasWorkbook
              ? (dl.fileName ??
                `line_items_${proj.id}_${proj.jobNumber || proj.name || 'project'}.xlsx`)
              : null;
            const row = this.rawExports.create({
              projectId: proj.id,
              projectName: proj.name,
              reportType: 'line-items',
              fileName,
              contentType: dl.contentType,
              byteLength: dl.buffer.length,
              payload: hasWorkbook ? dl.buffer : null,
              httpStatus: dl.httpStatus,
              error: null,
              fetchedAt: new Date(),
            });
            const saved = await this.rawExports.save(row);
            exportsDownloaded++;
            if (hasWorkbook && saved.payload) {
              try {
                const buf = Buffer.isBuffer(saved.payload)
                  ? saved.payload
                  : Buffer.from(saved.payload as Uint8Array);
                await this.lineItemIngest.ingestFromXlsx(proj.id, Number(saved.id), buf);
              } catch (e: any) {
                const stack = e?.stack ? ` ${String(e.stack).split('\n').slice(0, 3).join(' ')}` : '';
                this.logger.warn(
                  `Trimble line-item ingest failed projectId=${proj.id}: ${e?.message ?? e}${stack}`,
                );
              }
            } else {
              try {
                await this.lineItemIngest.clearForProject(proj.id);
              } catch (e: any) {
                this.logger.warn(
                  `Trimble line-item clear failed projectId=${proj.id}: ${e?.message ?? e}`,
                );
              }
            }
            if (exportsDownloaded % 25 === 0) {
              this.logger.log(
                `Trimble sync: line-items ${exportsDownloaded}/${projectsSeen} processed ` +
                  `(workbooks=${exportsDownloaded - exportsEmptyLineItems} empty=${exportsEmptyLineItems})…`,
              );
            }
          } catch (err: any) {
            exportsFailed++;
            const message = err?.message ?? String(err);
            this.logger.warn(
              `Trimble line-items download failed for projectId=${proj.id} (${proj.name}): ${message}`,
            );
            await this.rawExports
              .save(
                this.rawExports.create({
                  projectId: proj.id,
                  projectName: proj.name,
                  reportType: 'line-items',
                  fileName: null,
                  contentType: null,
                  byteLength: 0,
                  payload: null,
                  httpStatus: null,
                  error: message.slice(0, 4000),
                  fetchedAt: new Date(),
                }),
              )
              .catch(() => undefined);
          }
          if (interProjectDelayMs > 0) {
            await new Promise((r) => setTimeout(r, interProjectDelayMs));
          }
        }
      });
      await Promise.all(workers);

      await this.setState(STATE_KEYS.exportsDownloaded, String(exportsDownloaded));
      await this.setState(STATE_KEYS.exportsEmptyLineItems, String(exportsEmptyLineItems));
      await this.setState(STATE_KEYS.exportsFailed, String(exportsFailed));
      await this.setState(STATE_KEYS.lastSuccessfulRunAt, new Date().toISOString());
      await this.setState(STATE_KEYS.lastPhase, 'done');
      const withFile = exportsDownloaded - exportsEmptyLineItems;
      this.logger.log(
        `Trimble sync: complete. projects=${projectsSeen} lineItemExports=${exportsDownloaded} ` +
          `(workbooks=${withFile} emptyNoLineItems=${exportsEmptyLineItems}) failed=${exportsFailed}`,
      );
      return { ok: true, projectsSeen, exportsDownloaded, exportsEmptyLineItems, exportsFailed };
    } catch (err: any) {
      const message = err?.message ?? String(err);
      this.logger.error(`Trimble sync error: ${message}`);
      await this.setState(STATE_KEYS.lastError, message.slice(0, 4000));
      await this.setState(STATE_KEYS.lastPhase, 'error');
      return {
        ok: false,
        projectsSeen,
        exportsDownloaded,
        exportsEmptyLineItems,
        exportsFailed,
        error: message,
      };
    } finally {
      await this.setState(STATE_KEYS.lastRunFinishedAt, new Date().toISOString());
      this.syncRunning = false;
    }
  }

  /** Health snapshot for the controller / dashboard. */
  async getHealthInfo(): Promise<{
    syncRunning: boolean;
    lastRunStartedAt: string | null;
    lastRunFinishedAt: string | null;
    lastSuccessfulRunAt: string | null;
    lastPhase: string | null;
    lastError: string | null;
    projectsSeen: number | null;
    exportsDownloaded: number | null;
    exportsEmptyLineItems: number | null;
    exportsFailed: number | null;
    projectRowCount: number;
    rawExportRowCount: number;
    lineItemRowCount: number;
    session: ReturnType<TrimbleApiClient['getSessionInfo']>;
  }> {
    const [s, projectRowCount, rawExportRowCount, lineItemRowCount] = await Promise.all([
      this.loadAllState(),
      this.projects.count().catch(() => 0),
      this.rawExports.count().catch(() => 0),
      this.dataSource.getRepository(TrimbleProjectLineItem).count().catch(() => 0),
    ]);
    return {
      syncRunning: this.syncRunning,
      lastRunStartedAt: s[STATE_KEYS.lastRunStartedAt] ?? null,
      lastRunFinishedAt: s[STATE_KEYS.lastRunFinishedAt] ?? null,
      lastSuccessfulRunAt: s[STATE_KEYS.lastSuccessfulRunAt] ?? null,
      lastPhase: s[STATE_KEYS.lastPhase] ?? null,
      lastError: s[STATE_KEYS.lastError] ?? null,
      projectsSeen: s[STATE_KEYS.projectsSeen] != null ? Number(s[STATE_KEYS.projectsSeen]) : null,
      exportsDownloaded:
        s[STATE_KEYS.exportsDownloaded] != null ? Number(s[STATE_KEYS.exportsDownloaded]) : null,
      exportsEmptyLineItems:
        s[STATE_KEYS.exportsEmptyLineItems] != null ? Number(s[STATE_KEYS.exportsEmptyLineItems]) : null,
      exportsFailed: s[STATE_KEYS.exportsFailed] != null ? Number(s[STATE_KEYS.exportsFailed]) : null,
      projectRowCount,
      rawExportRowCount,
      lineItemRowCount,
      session: this.api.getSessionInfo(),
    };
  }

  private async upsertProjects(rows: TrimbleProjectRow[]): Promise<void> {
    if (rows.length === 0) return;
    const now = new Date();
    const entities = rows.map((r) =>
      this.projects.create({
        id: r.id,
        name: r.name,
        companyId: r.companyId,
        subCompanyId: r.subCompanyId,
        subCompanyName: r.subCompany?.name ?? null,
        jobNumber: r.jobNumber,
        address: r.address,
        isActive: r.isActive,
        isWarehouse: r.isWarehouse,
        warehouseId: r.warehouseId,
        deliveryContactName: r.deliveryContactName,
        deliveryContactPhoneNumber: r.deliveryContactPhoneNumber,
        payloadJson: this.safeStringify(r._raw),
        lastSeenAt: now,
      }),
    );
    // Use MERGE (via TypeORM upsert) keyed on the primary key `Id` so that
    // re-running the sync updates existing rows instead of throwing a PK
    // violation.  Repository.save() would INSERT because we set `id`
    // manually and TypeORM can't tell "new" from "existing" in that case.
    //
    // Chunk size keeps us under MSSQL's ~2100 parameter-per-statement limit
    // (14 cols × 50 rows = 700 params, safely below).
    const chunk = 50;
    for (let i = 0; i < entities.length; i += chunk) {
      await this.projects.upsert(entities.slice(i, i + chunk), ['id']);
    }
  }

  private safeStringify(v: unknown): string | null {
    try {
      return JSON.stringify(v);
    } catch {
      return null;
    }
  }

  private async setState(key: string, value: string | null): Promise<void> {
    await this.state.save(this.state.create({ key, value, updatedAt: new Date() })).catch((err) => {
      this.logger.warn(`Trimble setState(${key}) failed: ${err?.message ?? err}`);
    });
  }

  private async loadAllState(): Promise<Record<string, string | null>> {
    const rows = await this.state.find().catch(() => [] as TrimbleSyncState[]);
    const out: Record<string, string | null> = {};
    for (const r of rows) out[r.key] = r.value;
    return out;
  }

  /** Idempotent CREATE TABLE for Trimble mirror + raw exports + parsed line items. */
  private async ensureTables(): Promise<void> {
    await this.dataSource.query(`
      IF OBJECT_ID('dbo.Trimble_SyncState', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.Trimble_SyncState(
          [Key] nvarchar(100) NOT NULL PRIMARY KEY,
          [Value] nvarchar(max) NULL,
          UpdatedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME()
        );
      END

      IF OBJECT_ID('dbo.Trimble_Projects', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.Trimble_Projects(
          Id bigint NOT NULL PRIMARY KEY,
          Name nvarchar(max) NULL,
          CompanyId bigint NULL,
          SubCompanyId bigint NULL,
          SubCompanyName nvarchar(max) NULL,
          JobNumber nvarchar(200) NULL,
          Address nvarchar(max) NULL,
          IsActive bit NULL,
          IsWarehouse bit NULL,
          WarehouseId bigint NULL,
          DeliveryContactName nvarchar(max) NULL,
          DeliveryContactPhoneNumber nvarchar(100) NULL,
          PayloadJson nvarchar(max) NULL,
          LastSeenAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME()
        );
      END

      IF OBJECT_ID('dbo.Trimble_LineItemRawExports', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.Trimble_LineItemRawExports(
          Id bigint IDENTITY(1,1) NOT NULL PRIMARY KEY,
          ProjectId bigint NOT NULL,
          ProjectName nvarchar(max) NULL,
          ReportType nvarchar(60) NOT NULL DEFAULT 'line-items',
          FileName nvarchar(400) NULL,
          ContentType nvarchar(200) NULL,
          ByteLength int NULL,
          Payload varbinary(max) NULL,
          HttpStatus int NULL,
          [Error] nvarchar(max) NULL,
          FetchedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME()
        );
        CREATE INDEX IX_Trimble_LineItemRawExports_ProjectId
          ON dbo.Trimble_LineItemRawExports(ProjectId, FetchedAt DESC);
      END

      -- Line-item grid: SQL columns are created from Excel headers on ingest (exact names).
      -- If an older layout (e.g. RowJson) exists, archive it once.
      IF OBJECT_ID('dbo.Trimble_ProjectLineItems', 'U') IS NOT NULL
        AND COL_LENGTH('dbo.Trimble_ProjectLineItems', 'RowJson') IS NOT NULL
      BEGIN
        EXEC sp_rename N'dbo.Trimble_ProjectLineItems', N'Trimble_ProjectLineItems__Legacy';
      END

      IF OBJECT_ID('dbo.Trimble_ProjectLineItems', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.Trimble_ProjectLineItems(
          Id bigint IDENTITY(1,1) NOT NULL PRIMARY KEY,
          ProjectId bigint NOT NULL,
          ExcelRowNumber int NOT NULL
        );
        CREATE INDEX IX_Trimble_ProjectLineItems_ProjectId
          ON dbo.Trimble_ProjectLineItems(ProjectId);
      END
    `);
  }
}
