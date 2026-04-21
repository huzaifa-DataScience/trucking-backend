import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import {
  ClearstoryApiPayload,
  ClearstoryChangeNotification,
  ClearstoryChangeNotificationContract,
  ClearstoryCompany,
  ClearstoryContract,
  ClearstoryCor,
  ClearstoryCustomer,
  ClearstoryCustomerOffice,
  ClearstoryDivision,
  ClearstoryLabel,
  ClearstoryOffice,
  ClearstoryProject,
  ClearstoryProjectRate,
  ClearstoryRate,
  ClearstorySyncSnapshot,
  ClearstorySyncState,
  ClearstoryTag,
  ClearstoryUser,
} from '../database/entities';
import { ClearstoryService } from './clearstory.service';
const RATE_TYPES = ['labor', 'material', 'equipment', 'other'] as const;

type BackfillMode = 'ALL' | 'ONLY_MISSING';

/** Persisted under Clearstory_SyncState key `tagsPhaseLast` after each tags sync attempt. */
export type ClearstoryTagsPhaseDiag = {
  ranAt: string;
  saved: number;
  uniqueIds: number;
  strategies: ClearstoryTagsStrategyDiag[];
};

export type ClearstoryTagsStrategyDiag = {
  label: string;
  params: Record<string, unknown>;
  pages: number;
  rowsSeen: number;
  firstPageListLen: number;
  lastSkip: number;
  lastApiCount: number | null;
  error: string | null;
};

function newTagsStrategyDiag(label: string, params: Record<string, unknown>): ClearstoryTagsStrategyDiag {
  return {
    label,
    params,
    pages: 0,
    rowsSeen: 0,
    firstPageListLen: 0,
    lastSkip: 0,
    lastApiCount: null,
    error: null,
  };
}

function strOpt(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

/** SQL Server uniqueidentifier — reject non-GUID strings so inserts do not fail */
function uuidOpt(v: unknown): string | null {
  const s = strOpt(v);
  if (!s) return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s) ? s : null;
}

function boolOpt(v: unknown): boolean | null {
  return typeof v === 'boolean' ? v : null;
}

function intOpt(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function floatOpt(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toIsoDay(d: unknown): string | null {
  if (!d) return null;
  const dt = new Date(String(d));
  return Number.isFinite(dt.getTime()) ? dt.toISOString().slice(0, 10) : null;
}

function toDate(d: unknown): Date | null {
  if (!d) return null;
  const dt = new Date(String(d));
  return Number.isFinite(dt.getTime()) ? dt : null;
}

function toDecimalString(n: unknown): string | null {
  if (n === null || n === undefined || n === '') return null;
  const v = Number(n);
  return Number.isFinite(v) ? String(v) : null;
}

function extractContractIdsFromCnDetail(detail: any): number[] {
  const out = new Set<number>();
  const add = (v: unknown) => {
    const n = Number(v);
    if (Number.isFinite(n)) out.add(n);
  };
  for (const c of detail?.contractors ?? []) add(c?.contractId);
  for (const r of detail?.responses ?? []) add(r?.contractId);
  if (detail?.response) add(detail.response.contractId);
  return [...out];
}

/** Shallow merge for list row + GET-by-id so stored JSON matches Swagger “full” resource shape as closely as the API returns. */
function mergeClearstoryApiObjects(listItem: unknown, detail: unknown | null | undefined): unknown {
  const a =
    listItem !== null && listItem !== undefined && typeof listItem === 'object' && !Array.isArray(listItem)
      ? (listItem as Record<string, unknown>)
      : {};
  const b =
    detail !== null && detail !== undefined && typeof detail === 'object' && !Array.isArray(detail)
      ? (detail as Record<string, unknown>)
      : {};
  return { ...a, ...b };
}

/** Evaluated when this module loads — `dotenv/config` must run before `AppModule` in main.ts */
const CLEARSTORY_CRON_EXPR = (process.env.CLEARSTORY_SYNC_CRON ?? '0 */10 * * * *').trim() || '0 */10 * * * *';

@Injectable()
export class ClearstorySyncService implements OnModuleInit {
  private readonly logger = new Logger(ClearstorySyncService.name);
  private syncInFlight = false;

  constructor(
    private readonly config: ConfigService,
    private readonly api: ClearstoryService,
    private readonly dataSource: DataSource,
    @InjectRepository(ClearstoryProject) private readonly projectRepo: Repository<ClearstoryProject>,
    @InjectRepository(ClearstoryCor) private readonly corRepo: Repository<ClearstoryCor>,
    @InjectRepository(ClearstoryTag) private readonly tagRepo: Repository<ClearstoryTag>,
    @InjectRepository(ClearstorySyncState) private readonly stateRepo: Repository<ClearstorySyncState>,
    @InjectRepository(ClearstoryCompany) private readonly companyRepo: Repository<ClearstoryCompany>,
    @InjectRepository(ClearstoryUser) private readonly userRepo: Repository<ClearstoryUser>,
    @InjectRepository(ClearstoryOffice) private readonly officeRepo: Repository<ClearstoryOffice>,
    @InjectRepository(ClearstoryDivision) private readonly divisionRepo: Repository<ClearstoryDivision>,
    @InjectRepository(ClearstoryContract) private readonly contractRepo: Repository<ClearstoryContract>,
    @InjectRepository(ClearstoryCustomer) private readonly customerRepo: Repository<ClearstoryCustomer>,
    @InjectRepository(ClearstoryCustomerOffice)
    private readonly customerOfficeRepo: Repository<ClearstoryCustomerOffice>,
    @InjectRepository(ClearstoryLabel) private readonly labelRepo: Repository<ClearstoryLabel>,
    @InjectRepository(ClearstoryChangeNotification)
    private readonly cnRepo: Repository<ClearstoryChangeNotification>,
    @InjectRepository(ClearstoryChangeNotificationContract)
    private readonly cnContractRepo: Repository<ClearstoryChangeNotificationContract>,
    @InjectRepository(ClearstoryRate) private readonly rateRepo: Repository<ClearstoryRate>,
    @InjectRepository(ClearstoryProjectRate) private readonly projectRateRepo: Repository<ClearstoryProjectRate>,
    @InjectRepository(ClearstorySyncSnapshot) private readonly snapshotRepo: Repository<ClearstorySyncSnapshot>,
    @InjectRepository(ClearstoryApiPayload) private readonly apiPayloadRepo: Repository<ClearstoryApiPayload>,
  ) {}

  onModuleInit(): void {
    this.logger.log(`Clearstory sync will run on cron "${CLEARSTORY_CRON_EXPR}"`);
  }

  /** For health/admin: true while a full sync (cron or manual) is executing */
  isSyncRunning(): boolean {
    return this.syncInFlight;
  }

  /** Nest ScheduleExplorer registers this the same way as Siteline sync */
  @Cron(CLEARSTORY_CRON_EXPR, { name: 'clearstorySync' })
  async clearstorySyncCron(): Promise<void> {
    await this.runScheduledSync();
  }

  private enabled(): boolean {
    const raw = this.config.get<string>('CLEARSTORY_SYNC_ENABLED', 'true') ?? 'true';
    const v = String(raw).trim().toLowerCase();
    return !['false', '0', 'no', 'off'].includes(v);
  }

  /** Extra GET per row (slow). Set CLEARSTORY_CUSTOMER_DETAIL=false to sync list-only quickly. */
  private customerDetailEnabled(): boolean {
    const raw = this.config.get<string>('CLEARSTORY_CUSTOMER_DETAIL', 'true') ?? 'true';
    const v = String(raw).trim().toLowerCase();
    return !['false', '0', 'no', 'off'].includes(v);
  }

  private async runScheduledSync(): Promise<void> {
    if (!this.enabled()) {
      this.logger.warn('Clearstory sync skipped: CLEARSTORY_SYNC_ENABLED is off (set to true to enable).');
      return;
    }
    if (!this.api.isConfigured()) {
      this.logger.warn('Clearstory sync skipped: set CLEARSTORY_KEY_ID and CLEARSTORY_SECRET_KEY.');
      return;
    }
    if (this.syncInFlight) {
      return;
    }
    this.logger.log('Clearstory scheduled sync starting.');
    await this.syncNow();
  }

  /** Creates Clearstory mirror tables when missing. Full DB reset: run scripts/sql/clearstory-all-tables.sql (drop+create), then sync. */
  private async ensureTables(): Promise<void> {
    await this.dataSource.query(`
      IF OBJECT_ID('dbo.Clearstory_SyncState', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.Clearstory_SyncState(
          [Key] nvarchar(100) NOT NULL PRIMARY KEY,
          [Value] nvarchar(max) NULL,
          UpdatedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME()
        );
      END

      IF OBJECT_ID('dbo.Clearstory_Company', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.Clearstory_Company(
          Id int NOT NULL PRIMARY KEY,
          Name nvarchar(500) NULL,
          Domain nvarchar(500) NULL,
          Address nvarchar(500) NULL,
          Address2 nvarchar(500) NULL,
          City nvarchar(200) NULL,
          State nvarchar(100) NULL,
          ZipCode nvarchar(50) NULL,
          Country nvarchar(200) NULL,
          Phone nvarchar(100) NULL,
          Fax nvarchar(100) NULL,
          DivisionsEnabled bit NULL,
          TzName nvarchar(200) NULL,
          LogoSignedUrl nvarchar(2000) NULL,
          UpdatedAt datetime2 NULL,
          CreatedAt datetime2 NULL,
          LastSyncedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME()
        );
      END

      IF OBJECT_ID('dbo.Clearstory_Users', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.Clearstory_Users(
          Id int NOT NULL PRIMARY KEY,
          FirstName nvarchar(200) NULL,
          LastName nvarchar(200) NULL,
          Email nvarchar(320) NULL,
          CompanyId int NULL,
          RoleId int NULL,
          RoleName nvarchar(100) NULL,
          UpdatedAt datetime2 NULL,
          CreatedAt datetime2 NULL,
          LastSyncedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME()
        );
      END

      IF OBJECT_ID('dbo.Clearstory_Offices', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.Clearstory_Offices(
          Id int NOT NULL PRIMARY KEY,
          Name nvarchar(300) NULL,
          BusinessName nvarchar(500) NULL,
          Address nvarchar(500) NULL,
          City nvarchar(200) NULL,
          State nvarchar(100) NULL,
          Country nvarchar(200) NULL,
          ZipCode nvarchar(50) NULL,
          Phone nvarchar(100) NULL,
          Fax nvarchar(100) NULL,
          Lat float NULL,
          Lng float NULL,
          CustomId nvarchar(200) NULL,
          TzName nvarchar(200) NULL,
          RegionId int NULL,
          UpdatedAt datetime2 NULL,
          CreatedAt datetime2 NULL,
          LastSyncedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME()
        );
      END

      IF OBJECT_ID('dbo.Clearstory_Divisions', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.Clearstory_Divisions(
          Division nvarchar(300) NOT NULL PRIMARY KEY,
          CreatedAt datetime2 NULL,
          UpdatedAt datetime2 NULL,
          LastSyncedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME()
        );
      END

      IF OBJECT_ID('dbo.Clearstory_Contracts', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.Clearstory_Contracts(
          Id int NOT NULL PRIMARY KEY,
          Name nvarchar(500) NULL,
          ContractValue decimal(18,2) NULL,
          CustomerProjectId int NULL,
          ContractorProjectId int NULL,
          LastSyncedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME()
        );
        CREATE INDEX IX_Clearstory_Contracts_CustomerProjectId ON dbo.Clearstory_Contracts(CustomerProjectId);
        CREATE INDEX IX_Clearstory_Contracts_ContractorProjectId ON dbo.Clearstory_Contracts(ContractorProjectId);
      END

      IF OBJECT_ID('dbo.Clearstory_Customers', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.Clearstory_Customers(
          Id int NOT NULL PRIMARY KEY,
          Name nvarchar(500) NULL,
          InternalId nvarchar(200) NULL,
          CreatorId int NULL,
          Address nvarchar(500) NULL,
          City nvarchar(200) NULL,
          State nvarchar(100) NULL,
          ZipCode nvarchar(50) NULL,
          Country nvarchar(200) NULL,
          Phone nvarchar(100) NULL,
          Fax nvarchar(100) NULL,
          LastSyncedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME()
        );
      END

      IF OBJECT_ID('dbo.Clearstory_CustomerOffices', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.Clearstory_CustomerOffices(
          CustomerId int NOT NULL,
          OfficeId int NOT NULL,
          LastSyncedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_Clearstory_CustomerOffices PRIMARY KEY (CustomerId, OfficeId)
        );
        CREATE INDEX IX_Clearstory_CustomerOffices_OfficeId ON dbo.Clearstory_CustomerOffices(OfficeId);
      END

      IF OBJECT_ID('dbo.Clearstory_Labels', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.Clearstory_Labels(
          Id int NOT NULL PRIMARY KEY,
          Name nvarchar(500) NULL,
          CompanyStandard bit NULL,
          Active bit NULL,
          UpdatedAt datetime2 NULL,
          CreatedAt datetime2 NULL,
          LastSyncedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME()
        );
      END

      IF OBJECT_ID('dbo.Clearstory_ChangeNotifications', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.Clearstory_ChangeNotifications(
          Id nvarchar(32) NOT NULL PRIMARY KEY,
          LastInbox nvarchar(20) NULL,
          [Type] nvarchar(200) NULL,
          TypeId int NULL,
          Status nvarchar(100) NULL,
          StatusChangedAt datetime2 NULL,
          Title nvarchar(500) NULL,
          Description nvarchar(4000) NULL,
          CustomerReferenceNumber nvarchar(200) NULL,
          DateSubmitted datetime2 NULL,
          DateReceived datetime2 NULL,
          DueDate datetime2 NULL,
          Estimate decimal(18,2) NULL,
          CostImpact decimal(18,2) NULL,
          ProjectedCost decimal(18,2) NULL,
          TotalSubmitted int NULL,
          TotalResponded int NULL,
          CustomerName nvarchar(500) NULL,
          CustomerId int NULL,
          ProjectId int NULL,
          ProjectJobNumber nvarchar(100) NULL,
          ProjectTitle nvarchar(255) NULL,
          UpdatedAt datetime2 NULL,
          CreatedAt datetime2 NULL,
          LastSyncedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME()
        );
      END

      IF OBJECT_ID('dbo.Clearstory_ChangeNotificationContracts', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.Clearstory_ChangeNotificationContracts(
          ChangeNotificationId nvarchar(32) NOT NULL,
          ContractId int NOT NULL,
          NoCostImpact bit NULL,
          HasResponded bit NULL,
          Estimate decimal(18,2) NULL,
          FileDownloadCount int NULL,
          ContractName nvarchar(500) NULL,
          ContractValue decimal(18,2) NULL,
          ResponseUpdatedAt datetime2 NULL,
          ResponseCreatedAt datetime2 NULL,
          LastSyncedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
          PRIMARY KEY (ChangeNotificationId, ContractId)
        );
      END

      IF OBJECT_ID('dbo.Clearstory_Projects', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.Clearstory_Projects(
          Id int NOT NULL PRIMARY KEY,
          JobNumber nvarchar(100) NULL,
          CustomerJobNumber nvarchar(100) NULL,
          Name nvarchar(255) NULL,
          OfficeId int NULL,
          OfficeName nvarchar(255) NULL,
          Region nvarchar(100) NULL,
          Division nvarchar(100) NULL,
          CustomerName nvarchar(255) NULL,
          CustomerId int NULL,
          CompanyId int NULL,
          Archived bit NULL,
          OriginType nvarchar(100) NULL,
          SiteProjectAddress nvarchar(500) NULL,
          SiteStreetAddress nvarchar(500) NULL,
          SiteCity nvarchar(200) NULL,
          SiteState nvarchar(100) NULL,
          SiteZipCode nvarchar(50) NULL,
          SiteCountry nvarchar(200) NULL,
          StartDate date NULL,
          EndDate date NULL,
          BaseContractValue decimal(18,2) NULL,
          UpdatedAt datetime2 NULL,
          CreatedAt datetime2 NULL,
          LastSyncedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME()
        );
        CREATE INDEX IX_Clearstory_Projects_JobNumber ON dbo.Clearstory_Projects(JobNumber);
      END

      IF OBJECT_ID('dbo.Clearstory_Cors', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.Clearstory_Cors(
          Id nvarchar(64) NOT NULL PRIMARY KEY,
          NumericId int NULL,
          Uuid uniqueidentifier NULL,
          ProjectId int NULL,
          JobNumber nvarchar(100) NULL,
          CorNumber nvarchar(100) NULL,
          IssueNumber nvarchar(100) NULL,
          Title nvarchar(MAX) NULL,
          Description nvarchar(MAX) NULL,
          EntryMethod nvarchar(100) NULL,
          Type nvarchar(50) NULL,
          Status nvarchar(50) NULL,
          Stage nvarchar(50) NULL,
          BallInCourt nvarchar(50) NULL,
          Version int NULL,
          CustomerJobNumber nvarchar(100) NULL,
          CustomerReferenceNumber nvarchar(MAX) NULL,
          ChangeNotificationId int NULL,
          ProjectName nvarchar(MAX) NULL,
          ContractId int NULL,
          CustomerName nvarchar(MAX) NULL,
          ContractorName nvarchar(MAX) NULL,
          CustomerCoNumber nvarchar(100) NULL,
          DateSubmitted datetime2 NULL,
          RequestedAmount decimal(18,2) NULL,
          InReviewAmount decimal(18,2) NULL,
          ApprovedCoIssuedAmount decimal(18,2) NULL,
          ApprovedToProceedAmount decimal(18,2) NULL,
          TotalAmount decimal(18,2) NULL,
          VoidAmount decimal(18,2) NULL,
          VoidDate datetime2 NULL,
          CoIssueDate datetime2 NULL,
          ApprovedToProceedDate datetime2 NULL,
          ApprovedOrVoidDate datetime2 NULL,
          UpdatedAt datetime2 NULL,
          CreatedAt datetime2 NULL,
          LastSyncedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME()
        );
        CREATE INDEX IX_Clearstory_Cors_ProjectId ON dbo.Clearstory_Cors(ProjectId);
        CREATE INDEX IX_Clearstory_Cors_JobNumber ON dbo.Clearstory_Cors(JobNumber);
        CREATE INDEX IX_Clearstory_Cors_Status ON dbo.Clearstory_Cors(Status);
      END

      IF OBJECT_ID('dbo.Clearstory_Tags', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.Clearstory_Tags(
          Id int NOT NULL PRIMARY KEY,
          Uuid uniqueidentifier NULL,
          ProjectId int NULL,
          JobNumber nvarchar(100) NULL,
          Number nvarchar(100) NULL,
          PaddedTagNumber nvarchar(100) NULL,
          Title nvarchar(MAX) NULL,
          Status nvarchar(50) NULL,
          CustomerReferenceNumber nvarchar(MAX) NULL,
          DateOfWorkPerformed datetime2 NULL,
          SignedAt datetime2 NULL,
          UpdatedAt datetime2 NULL,
          CreatedAt datetime2 NULL,
          LastSyncedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME()
        );
        CREATE INDEX IX_Clearstory_Tags_ProjectId ON dbo.Clearstory_Tags(ProjectId);
      END

      IF OBJECT_ID('dbo.Clearstory_Rates', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.Clearstory_Rates(
          RateType nvarchar(20) NOT NULL,
          RecordId int NOT NULL,
          InternalId nvarchar(200) NULL,
          RateGroupId int NULL,
          RateGroupName nvarchar(300) NULL,
          LaborClass nvarchar(500) NULL,
          StraightTimeRate decimal(18,4) NULL,
          OverTimeRate decimal(18,4) NULL,
          DoubleTimeRate decimal(18,4) NULL,
          PremiumOverTimeRate decimal(18,4) NULL,
          PremiumDoubleTimeRate decimal(18,4) NULL,
          ItemName nvarchar(500) NULL,
          Unit nvarchar(100) NULL,
          RateAmount decimal(18,4) NULL,
          StandardAmount decimal(18,4) NULL,
          StandardItem bit NULL,
          AutoCalculateTotal bit NULL,
          UpdatedAt datetime2 NULL,
          CreatedAt datetime2 NULL,
          LastSyncedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
          PRIMARY KEY (RateType, RecordId)
        );
      END

      IF OBJECT_ID('dbo.Clearstory_ProjectRates', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.Clearstory_ProjectRates(
          ProjectId int NOT NULL,
          RateType nvarchar(20) NOT NULL,
          RecordId int NOT NULL,
          InternalId nvarchar(200) NULL,
          RateGroupId int NULL,
          RateGroupName nvarchar(300) NULL,
          LaborClass nvarchar(500) NULL,
          StraightTimeRate decimal(18,4) NULL,
          OverTimeRate decimal(18,4) NULL,
          DoubleTimeRate decimal(18,4) NULL,
          PremiumOverTimeRate decimal(18,4) NULL,
          PremiumDoubleTimeRate decimal(18,4) NULL,
          ItemName nvarchar(500) NULL,
          Unit nvarchar(100) NULL,
          RateAmount decimal(18,4) NULL,
          StandardAmount decimal(18,4) NULL,
          StandardItem bit NULL,
          AutoCalculateTotal bit NULL,
          UpdatedAt datetime2 NULL,
          CreatedAt datetime2 NULL,
          LastSyncedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
          PRIMARY KEY (ProjectId, RateType, RecordId)
        );
      END

      IF OBJECT_ID('dbo.Clearstory_SyncSnapshots', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.Clearstory_SyncSnapshots(
          Id int NOT NULL IDENTITY(1,1) PRIMARY KEY,
          ResourceType nvarchar(80) NOT NULL,
          ResourceKey nvarchar(400) NOT NULL,
          Payload nvarchar(max) NULL,
          FetchedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME()
        );
        CREATE INDEX IX_Clearstory_SyncSnapshots_Type_Key_Time
          ON dbo.Clearstory_SyncSnapshots(ResourceType, ResourceKey, FetchedAt DESC);
      END

      IF OBJECT_ID('dbo.Clearstory_ApiPayloads', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.Clearstory_ApiPayloads(
          ResourceType nvarchar(80) NOT NULL,
          ResourceKey nvarchar(400) NOT NULL,
          PayloadJson nvarchar(max) NULL,
          LastFetchedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_Clearstory_ApiPayloads PRIMARY KEY (ResourceType, ResourceKey)
        );
      END
    `);

    // Idempotent column widenings for tables created by an earlier schema.
    // Free-text columns (titles, descriptions, customer references, names) regularly exceed
    // their original fixed widths and cause TDS errors
    // ("Data type 0xE7 has an invalid data length or metadata length") on batched INSERTs.
    // Widen only non-indexed free-text columns to nvarchar(MAX); indexed columns (JobNumber,
    // Status) stay fixed-width because SQL Server does not allow altering an indexed column
    // to MAX without dropping the index first.
    const widenToMax: { table: string; column: string }[] = [
      { table: 'Clearstory_Cors', column: 'Description' },
      { table: 'Clearstory_Cors', column: 'Title' },
      { table: 'Clearstory_Cors', column: 'CustomerReferenceNumber' },
      { table: 'Clearstory_Cors', column: 'ProjectName' },
      { table: 'Clearstory_Cors', column: 'CustomerName' },
      { table: 'Clearstory_Cors', column: 'ContractorName' },
      { table: 'Clearstory_Tags', column: 'Title' },
      { table: 'Clearstory_Tags', column: 'CustomerReferenceNumber' },
    ];
    for (const { table, column } of widenToMax) {
      await this.dataSource.query(`
        IF EXISTS (
          SELECT 1
          FROM sys.columns c
          INNER JOIN sys.objects o ON o.object_id = c.object_id
          INNER JOIN sys.types t ON t.user_type_id = c.user_type_id
          WHERE o.name = '${table}'
            AND c.name = '${column}'
            AND t.name = 'nvarchar'
            AND c.max_length <> -1
        )
        BEGIN
          ALTER TABLE dbo.${table} ALTER COLUMN ${column} nvarchar(MAX) NULL;
        END
      `);
    }
  }

  /**
   * Stores the exact JSON shape returned by Clearstory (list + detail merged when both exist).
   * `resourceType` / `resourceKey` are documented for `GET /clearstory/api-payload`.
   */
  private async persistClearstoryApiPayload(resourceType: string, resourceKey: string, body: unknown): Promise<void> {
    const rt = (resourceType ?? '').trim().slice(0, 80);
    let rk = (resourceKey ?? '').trim().slice(0, 400);
    if (!rt || !rk) return;
    let json: string;
    try {
      json = JSON.stringify(body ?? null);
    } catch (e: any) {
      this.logger.warn(`ClearstoryApiPayload ${rt}/${rk}: JSON.stringify failed: ${e?.message ?? e}`);
      return;
    }
    await this.apiPayloadRepo.save({
      resourceType: rt,
      resourceKey: rk,
      payloadJson: json,
      lastFetchedAt: new Date(),
    });
  }

  private async getState(key: string): Promise<string | null> {
    const row = await this.stateRepo.findOne({ where: { key } });
    return row?.value ?? null;
  }

  /** Used by GET /clearstory/status — stable fields for a health / ops UI. */
  async getHealthInfo(): Promise<{
    syncRunning: boolean;
    lastSuccessfulRunAt: string | null;
    tags: {
      typedRowCount: number;
      payloadRowCount: number;
      lastPhase: ClearstoryTagsPhaseDiag | null;
    };
  }> {
    const [typedRowCount, payloadRowCount] = await Promise.all([
      this.tagRepo.count(),
      this.apiPayloadRepo.count({ where: { resourceType: 'tag' } }),
    ]);
    let lastPhase: ClearstoryTagsPhaseDiag | null = null;
    const raw = await this.getState('tagsPhaseLast');
    if (raw) {
      try {
        lastPhase = JSON.parse(raw) as ClearstoryTagsPhaseDiag;
      } catch {
        lastPhase = null;
      }
    }
    return {
      syncRunning: this.syncInFlight,
      lastSuccessfulRunAt: await this.getState('lastSuccessfulRunAt'),
      tags: { typedRowCount, payloadRowCount, lastPhase },
    };
  }

  private async setState(key: string, value: string | null): Promise<void> {
    const existing = await this.stateRepo.findOne({ where: { key } });
    if (existing) {
      existing.value = value;
      existing.updatedAt = new Date();
      await this.stateRepo.save(existing);
    } else {
      await this.stateRepo.save({ key, value, updatedAt: new Date() } as any);
    }
  }

  private async appendSnapshot(resourceType: string, resourceKey: string, payload: unknown): Promise<void> {
    await this.snapshotRepo.save({
      resourceType,
      resourceKey,
      payload: JSON.stringify(payload),
      fetchedAt: new Date(),
    } as any);
  }

  private async runSyncPhase(
    label: string,
    run: () => Promise<number>,
    opts?: { swallowErrors?: boolean },
  ): Promise<number> {
    const t = Date.now();
    this.logger.log(`Clearstory phase "${label}" starting…`);
    try {
      const n = await run();
      this.logger.log(`Clearstory phase "${label}" done: ${n} saved, ${Date.now() - t}ms`);
      return n;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      if (opts?.swallowErrors) {
        this.logger.error(`Clearstory phase "${label}" failed after ${Date.now() - t}ms: ${msg}`, stack);
        return 0;
      }
      throw err;
    }
  }

  async syncNow(): Promise<void> {
    if (this.syncInFlight) {
      this.logger.warn('Clearstory syncNow skipped: a sync is already running.');
      return;
    }
    this.syncInFlight = true;
    try {
      this.logger.log('Clearstory sync: ensuring tables…');
      await this.ensureTables();

      const started = Date.now();
      this.logger.log('Clearstory sync started.');

      try {
        const lastRun = (await this.getState('lastSuccessfulRunAt')) ?? null;
        const overlapMinutes = 15;
        const fromUpdatedAt =
          lastRun && Number.isFinite(new Date(lastRun).getTime())
            ? new Date(new Date(lastRun).getTime() - overlapMinutes * 60_000).toISOString()
            : undefined;

        const counts: Record<string, number> = {};
        // Phase order: tags first (highest-priority data and independent of other resources),
        // then cheap lookups → projects → cors → slower relational → derived snapshots/rates.
        // Tags and cors both use swallowErrors so a failure in one phase never aborts the rest.
        counts.tags = await this.runSyncPhase('tags', () => this.syncTagsAll(), { swallowErrors: true });
        counts.company = await this.runSyncPhase('company', () => this.syncCompany());
        counts.users = await this.runSyncPhase('users', () => this.syncUsers());
        counts.offices = await this.runSyncPhase('offices', () => this.syncOffices());
        counts.divisions = await this.runSyncPhase('divisions', () => this.syncDivisions());
        counts.labels = await this.runSyncPhase('labels', () => this.syncLabels());
        counts.projects = await this.runSyncPhase('projects', () => this.syncProjects());
        counts.cors = await this.runSyncPhase('cors', () => this.syncCorsAll(fromUpdatedAt), { swallowErrors: true });
        counts.customers = await this.runSyncPhase('customers', () => this.syncCustomers());
        counts.contracts = await this.runSyncPhase('contracts', () => this.syncContracts());
        counts.changeNotifications = await this.runSyncPhase('changeNotifications', () =>
          this.syncChangeNotifications(),
        );
        counts.snapshots = await this.runSyncPhase('corSnapshots', () => this.syncCorAggregateSnapshots());
        counts.companyRates = await this.runSyncPhase('companyRates', () => this.syncCompanyRates());
        counts.projectRates = await this.runSyncPhase('projectRates', () => this.syncProjectRates());

        await this.setState('lastSuccessfulRunAt', new Date().toISOString());
        const elapsedMs = Date.now() - started;
        this.logger.log(`Clearstory sync finished in ${elapsedMs}ms: ${JSON.stringify(counts)}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const stack = err instanceof Error ? err.stack : undefined;
        this.logger.error(`Clearstory sync failed after ${Date.now() - started}ms: ${msg}`, stack);
      }
    } finally {
      this.syncInFlight = false;
    }
  }

  private mapCustomerFromPayload(row: ClearstoryCustomer, src: any): void {
    row.name = strOpt(src?.name);
    row.internalId = strOpt(src?.internalId);
    row.creatorId = intOpt(src?.creatorId);
    row.address = strOpt(src?.address);
    row.city = strOpt(src?.city);
    row.state = strOpt(src?.state);
    row.zipCode = strOpt(src?.zipCode);
    row.country = strOpt(src?.country);
    row.phone = strOpt(src?.phone);
    row.fax = strOpt(src?.fax);
  }

  private mapOfficeFromPayload(row: ClearstoryOffice, o: any): void {
    row.name = strOpt(o?.name);
    row.businessName = strOpt(o?.businessName);
    row.address = strOpt(o?.address);
    row.city = strOpt(o?.city);
    row.state = strOpt(o?.state);
    row.country = strOpt(o?.country);
    row.zipCode = strOpt(o?.zipCode);
    row.phone = strOpt(o?.phone);
    row.fax = strOpt(o?.fax);
    row.lat = floatOpt(o?.lat);
    row.lng = floatOpt(o?.lng);
    row.customId = strOpt(o?.customId);
    row.tzName = strOpt(o?.tzName);
    row.regionId = intOpt(o?.regionId);
    row.updatedAt = toDate(o?.updatedAt);
    row.createdAt = toDate(o?.createdAt);
  }

  private mapProjectFromPayload(row: ClearstoryProject, list: any, detail?: any | null): void {
    const l = list;
    const d = detail;
    const addr = d?.address ?? l?.address ?? d?.site ?? l?.site ?? null;
    row.jobNumber = strOpt(d?.jobNumber ?? d?.companyJobNumber ?? l?.jobNumber ?? l?.companyJobNumber);
    row.customerJobNumber = strOpt(d?.customerJobNumber ?? l?.customerJobNumber);
    row.name = strOpt(
      d?.projectTitle ?? l?.projectTitle ?? d?.title ?? d?.name ?? l?.title ?? l?.name,
    );
    row.officeId = intOpt(d?.officeId ?? l?.officeId ?? d?.office?.id ?? l?.office?.id);
    row.officeName = strOpt(d?.office?.name ?? d?.officeName ?? l?.office?.name ?? l?.officeName);
    row.region = strOpt(d?.office?.region ?? d?.region ?? l?.office?.region ?? l?.region);
    row.division = strOpt(d?.division ?? l?.division);
    const customerNameRaw =
      d?.customerInfo?.name ??
      d?.customer?.name ??
      d?.customerName ??
      d?.customer ??
      l?.customerInfo?.name ??
      l?.customer?.name ??
      l?.customerName ??
      l?.customer;
    row.customerName = strOpt(customerNameRaw);
    row.customerId = intOpt(
      d?.customerInfo?.id ??
        d?.customer?.id ??
        d?.customerId ??
        l?.customerInfo?.id ??
        l?.customer?.id ??
        l?.customerId,
    );
    row.companyId = intOpt(d?.companyId ?? l?.companyId);
    row.archived = boolOpt(d?.archived ?? l?.archived);
    row.originType = strOpt(d?.originType ?? l?.originType);
    row.siteProjectAddress = strOpt(
      d?.siteProjectAddress ?? l?.siteProjectAddress ?? addr?.projectAddress ?? addr?.project_address,
    );
    row.siteStreetAddress = strOpt(
      d?.siteStreetAddress ?? l?.siteStreetAddress ?? addr?.streetAddress ?? addr?.street_address,
    );
    row.siteCity = strOpt(d?.siteCity ?? l?.siteCity ?? addr?.city);
    row.siteState = strOpt(d?.siteState ?? l?.siteState ?? addr?.state);
    row.siteZipCode = strOpt(d?.siteZipCode ?? l?.siteZipCode ?? addr?.zipCode ?? addr?.postalCode);
    row.siteCountry = strOpt(d?.siteCountry ?? l?.siteCountry ?? addr?.country);
    row.startDate = toIsoDay(d?.startDate ?? d?.projectStartDate ?? l?.startDate ?? l?.projectStartDate);
    row.endDate = toIsoDay(d?.endDate ?? d?.projectEndDate ?? l?.endDate ?? l?.projectEndDate);
    row.baseContractValue = toDecimalString(d?.contractValue ?? d?.baseContractValue ?? l?.contractValue ?? l?.baseContractValue);
    row.updatedAt = toDate(d?.updatedAt ?? l?.updatedAt);
    row.createdAt = toDate(d?.createdAt ?? l?.createdAt);
  }

  private mapCorFromPayload(row: ClearstoryCor, list: any, detail?: any | null): void {
    const l = list;
    const d = detail;
    const idRaw = l?.id;
    row.numericId = Number.isFinite(Number(idRaw)) ? Number(idRaw) : null;
    row.uuid = uuidOpt(d?.uuid ?? l?.uuid);
    row.projectId = intOpt(d?.projectId ?? l?.projectId);
    row.jobNumber = strOpt(d?.jobNumber ?? l?.jobNumber);
    row.corNumber = strOpt(d?.corNumber ?? l?.corNumber);
    row.issueNumber = strOpt(d?.issueNumber ?? l?.issueNumber);
    row.title = strOpt(d?.title ?? l?.title);
    row.description = strOpt(d?.description ?? l?.description);
    row.entryMethod = strOpt(d?.entryMethod ?? l?.entryMethod);
    row.type = strOpt(d?.type ?? l?.type);
    row.status = strOpt(d?.status ?? l?.status);
    row.stage = strOpt(d?.stage ?? l?.stage);
    const bic =
      d?.ballInCourt ??
      d?.responsibleParty ??
      d?.responsible ??
      d?.ownerReview ??
      l?.ballInCourt ??
      l?.responsibleParty ??
      l?.responsible ??
      l?.ownerReview;
    row.ballInCourt = strOpt(bic);
    row.version = intOpt(d?.version ?? l?.version);
    row.customerJobNumber = strOpt(d?.customerJobNumber ?? l?.customerJobNumber);
    row.customerReferenceNumber = strOpt(d?.customerReferenceNumber ?? l?.customerReferenceNumber);
    row.changeNotificationId = intOpt(d?.changeNotificationId ?? d?.changeNotification?.id ?? l?.changeNotificationId);
    row.projectName = strOpt(d?.projectName ?? d?.project?.title ?? d?.project?.name ?? l?.projectName);
    row.contractId = intOpt(d?.contractId ?? d?.contract?.id ?? l?.contractId);
    row.customerName = strOpt(d?.customerName ?? d?.customer?.name ?? l?.customerName);
    row.contractorName = strOpt(d?.contractorName ?? d?.contractor?.name ?? l?.contractorName);
    row.customerCoNumber = strOpt(d?.customerCoNumber ?? l?.customerCoNumber);
    row.dateSubmitted = toDate(d?.dateSubmitted ?? l?.dateSubmitted);
    row.requestedAmount = toDecimalString(d?.requestedAmount ?? d?.requestedValue ?? l?.requestedAmount ?? l?.requestedValue);
    row.inReviewAmount = toDecimalString(d?.inReviewAmount ?? l?.inReviewAmount);
    row.approvedCoIssuedAmount = toDecimalString(d?.approvedCoIssuedAmount ?? d?.approvedCOIssuedAmount ?? l?.approvedCoIssuedAmount);
    row.approvedToProceedAmount = toDecimalString(d?.approvedToProceedAmount ?? l?.approvedToProceedAmount);
    row.totalAmount = toDecimalString(d?.totalAmount ?? d?.totalValue ?? d?.amount ?? l?.totalAmount ?? l?.totalValue ?? l?.amount);
    row.voidAmount = toDecimalString(d?.voidAmount ?? l?.voidAmount);
    row.voidDate = toDate(d?.voidDate ?? l?.voidDate);
    row.coIssueDate = toDate(d?.coIssueDate ?? d?.coIssuedDate ?? l?.coIssueDate);
    row.approvedToProceedDate = toDate(d?.approvedToProceedDate ?? l?.approvedToProceedDate);
    row.approvedOrVoidDate = toDate(d?.approvedOrVoidDate ?? l?.approvedOrVoidDate);
    row.updatedAt = toDate(d?.updatedAt ?? l?.updatedAt);
    row.createdAt = toDate(d?.createdAt ?? l?.createdAt);
  }

  private mapTagFromPayload(row: ClearstoryTag, list: any, detail?: any | null): void {
    const l = list;
    const d = detail;
    row.uuid = uuidOpt(d?.uuid ?? l?.uuid) ?? row.uuid;
    row.projectId = intOpt(d?.projectId ?? l?.projectId);
    row.jobNumber = strOpt(d?.jobNumber ?? l?.jobNumber);
    row.number = strOpt(d?.number ?? l?.number);
    row.paddedTagNumber = strOpt(d?.paddedTagNumber ?? l?.paddedTagNumber);
    row.title = strOpt(d?.title ?? l?.title);
    row.status = strOpt(d?.status ?? l?.status);
    row.customerReferenceNumber = strOpt(d?.customerReferenceNumber ?? l?.customerReferenceNumber);
    row.dateOfWorkPerformed = toDate(d?.dateOfWorkPerformed ?? l?.dateOfWorkPerformed);
    row.signedAt = toDate(d?.signedAt ?? l?.signedAt);
    row.updatedAt = toDate(d?.updatedAt ?? l?.updatedAt);
    row.createdAt = toDate(d?.createdAt ?? l?.createdAt);
  }

  private mapCnFromPayload(row: ClearstoryChangeNotification, list: any, detail?: any | null): void {
    const l = list;
    const d = detail;
    const typeObj = d?.type ?? l?.type;
    row.type = strOpt(typeof typeObj === 'object' && typeObj !== null ? typeObj.name : typeObj);
    row.typeId = intOpt(typeof typeObj === 'object' && typeObj !== null ? typeObj.id : d?.typeId ?? l?.typeId);
    row.status = strOpt(d?.status ?? l?.status);
    row.statusChangedAt = toDate(d?.statusChangedAt ?? l?.statusChangedAt);
    row.title = strOpt(d?.title ?? l?.title);
    row.description = strOpt(d?.description ?? l?.description);
    row.customerReferenceNumber = strOpt(d?.customerReferenceNumber ?? l?.customerReferenceNumber);
    row.dateSubmitted = toDate(d?.dateSubmitted ?? l?.dateSubmitted);
    row.dateReceived = toDate(d?.dateReceived ?? l?.dateReceived);
    row.dueDate = toDate(d?.dueDate ?? l?.dueDate);
    row.estimate = toDecimalString(d?.estimate ?? l?.estimate);
    row.costImpact = toDecimalString(d?.costImpact ?? l?.costImpact);
    row.projectedCost = toDecimalString(d?.projectedCost ?? l?.projectedCost);
    row.totalSubmitted = intOpt(d?.totalSubmitted ?? l?.totalSubmitted);
    row.totalResponded = intOpt(d?.totalResponded ?? l?.totalResponded);
    row.customerName = strOpt(d?.customerName ?? d?.customer?.name ?? l?.customerName ?? l?.customer?.name);
    row.customerId = intOpt(d?.customerId ?? d?.customer?.id ?? l?.customerId ?? l?.customer?.id);
    row.projectId = intOpt(d?.projectId ?? d?.project?.id ?? l?.projectId ?? l?.project?.id);
    row.projectJobNumber = strOpt(d?.projectJobNumber ?? d?.project?.jobNumber ?? l?.projectJobNumber ?? l?.project?.jobNumber);
    row.projectTitle = strOpt(d?.projectTitle ?? d?.project?.title ?? d?.project?.name ?? l?.projectTitle ?? l?.project?.title ?? l?.project?.name);
    row.updatedAt = toDate(d?.updatedAt ?? l?.updatedAt);
    row.createdAt = toDate(d?.createdAt ?? l?.createdAt);
  }

  private mapCnContractFromPayload(row: ClearstoryChangeNotificationContract, cj: any): void {
    row.noCostImpact = boolOpt(cj?.noCostImpact);
    row.hasResponded = boolOpt(cj?.hasResponded);
    row.estimate = toDecimalString(cj?.estimate);
    row.fileDownloadCount = intOpt(cj?.fileDownloadCount);
    row.contractName = strOpt(cj?.contractName ?? cj?.contract?.name);
    row.contractValue = toDecimalString(cj?.contractValue ?? cj?.contract?.contractValue);
    row.responseUpdatedAt = toDate(cj?.responseUpdatedAt ?? cj?.response?.updatedAt);
    row.responseCreatedAt = toDate(cj?.responseCreatedAt ?? cj?.response?.createdAt);
  }

  private mapLmeoRateFromPayload(row: ClearstoryRate | ClearstoryProjectRate, rateType: string, r: any): void {
    row.internalId = strOpt(r?.internalId);
    const rg = r?.rateGroup;
    row.rateGroupId =
      intOpt(typeof rg === 'object' && rg !== null ? rg.id : undefined) ?? intOpt(r?.rateGroupId);
    row.rateGroupName = strOpt(typeof rg === 'object' && rg !== null ? rg.name : undefined);
    row.updatedAt = toDate(r?.updatedAt);
    row.createdAt = toDate(r?.createdAt);
    row.standardItem = boolOpt(r?.standardItem);
    row.autoCalculateTotal = boolOpt(r?.autoCalculateTotal);
    row.standardAmount = toDecimalString(r?.standardAmount);

    const rt = String(rateType).toLowerCase();
    if (rt === 'labor') {
      row.laborClass = strOpt(r?.laborClass);
      row.straightTimeRate = toDecimalString(r?.straightTimeRate);
      row.overTimeRate = toDecimalString(r?.overTimeRate);
      row.doubleTimeRate = toDecimalString(r?.doubleTimeRate);
      row.premiumOverTimeRate = toDecimalString(r?.premiumOverTimeRate);
      row.premiumDoubleTimeRate = toDecimalString(r?.premiumDoubleTimeRate);
      row.itemName = null;
      row.unit = null;
      row.rateAmount = null;
    } else {
      row.laborClass = null;
      row.straightTimeRate = null;
      row.overTimeRate = null;
      row.doubleTimeRate = null;
      row.premiumOverTimeRate = null;
      row.premiumDoubleTimeRate = null;
      row.itemName = strOpt(r?.material ?? r?.item ?? r?.itemName ?? r?.name ?? r?.equipment);
      row.unit = strOpt(r?.unit);
      row.rateAmount = toDecimalString(r?.rate ?? r?.amount);
    }
  }

  private async syncCompany(): Promise<number> {
    const d = await this.api.getCompany();
    const id = intOpt(d?.id) ?? 1;
    let row = await this.companyRepo.findOne({ where: { id } });
    if (!row) row = this.companyRepo.create({ id });
    row.name = strOpt(d?.name);
    row.domain = strOpt(d?.domain);
    row.address = strOpt(d?.address);
    row.address2 = strOpt(d?.address2);
    row.city = strOpt(d?.city);
    row.state = strOpt(d?.state);
    row.zipCode = strOpt(d?.zipCode);
    row.country = strOpt(d?.country);
    row.phone = strOpt(d?.phone);
    row.fax = strOpt(d?.fax);
    row.divisionsEnabled = boolOpt(d?.divisionsEnabled);
    row.tzName = strOpt(d?.tzName);
    row.logoSignedUrl = strOpt(d?.logoSignedUrl);
    row.updatedAt = toDate(d?.updatedAt);
    row.createdAt = toDate(d?.createdAt);
    row.lastSyncedAt = new Date();
    await this.companyRepo.save(row);
    await this.persistClearstoryApiPayload('company', 'current', d);
    return 1;
  }

  private async syncUsers(): Promise<number> {
    let saved = 0;
    let offset = 0;
    const limit = 100;
    while (true) {
      const { records, count } = await this.api.listCompanyUsers({ offset, limit });
      const list = Array.isArray(records) ? records : [];
      if (!list.length) break;
      const ids = [...new Set(list.map((u) => Number(u?.id)).filter((id) => Number.isFinite(id)))];
      const existing = ids.length ? await this.userRepo.findBy({ id: In(ids) }) : [];
      const byId = new Map(existing.map((e) => [e.id, e]));
      const batch = new Map<number, ClearstoryUser>();
      for (const u of list) {
        const id = Number(u?.id);
        if (!Number.isFinite(id)) continue;
        let row = byId.get(id);
        if (!row) {
          row = this.userRepo.create({ id });
          byId.set(id, row);
        }
        row.firstName = strOpt(u?.firstName);
        row.lastName = strOpt(u?.lastName);
        row.email = strOpt(u?.email);
        row.companyId = intOpt(u?.companyId);
        row.roleId = intOpt(u?.roleId);
        row.roleName = strOpt(u?.roleName);
        row.updatedAt = toDate(u?.updatedAt);
        row.createdAt = toDate(u?.createdAt);
        row.lastSyncedAt = new Date();
        batch.set(id, row);
        await this.persistClearstoryApiPayload('user', String(id), u);
      }
      saved += batch.size;
      if (batch.size) await this.userRepo.save([...batch.values()]);
      offset += limit;
      if (offset >= Number(count ?? 0)) break;
    }
    return saved;
  }

  private async syncOffices(): Promise<number> {
    let saved = 0;
    let offset = 0;
    const limit = 100;
    while (true) {
      const { records, count } = await this.api.listOffices({ offset, limit });
      const list = Array.isArray(records) ? records : [];
      if (!list.length) break;
      const ids = [...new Set(list.map((o) => Number(o?.id)).filter((id) => Number.isFinite(id)))];
      const existing = ids.length ? await this.officeRepo.findBy({ id: In(ids) }) : [];
      const byId = new Map(existing.map((e) => [e.id, e]));
      const batch = new Map<number, ClearstoryOffice>();
      for (const o of list) {
        const id = Number(o?.id);
        if (!Number.isFinite(id)) continue;
        let row = byId.get(id);
        if (!row) {
          row = this.officeRepo.create({ id });
          byId.set(id, row);
        }
        this.mapOfficeFromPayload(row, o);
        row.lastSyncedAt = new Date();
        batch.set(id, row);
        await this.persistClearstoryApiPayload('office', String(id), o);
      }
      saved += batch.size;
      if (batch.size) await this.officeRepo.save([...batch.values()]);
      offset += limit;
      if (offset >= Number(count ?? 0)) break;
    }
    return saved;
  }

  private async syncDivisions(): Promise<number> {
    let saved = 0;
    let offset = 0;
    const limit = 100;
    while (true) {
      const { records, count } = await this.api.listDivisions({ offset, limit });
      const list = Array.isArray(records) ? records : [];
      if (!list.length) break;
      const divs = [
        ...new Set(
          list.map((r) => String(r?.division ?? '').trim()).filter((d) => d.length > 0),
        ),
      ];
      const existing = divs.length ? await this.divisionRepo.findBy({ division: In(divs) }) : [];
      const byDiv = new Map(existing.map((e) => [e.division, e]));
      const batch = new Map<string, ClearstoryDivision>();
      for (const r of list) {
        const div = String(r?.division ?? '').trim();
        if (!div) continue;
        let row = byDiv.get(div);
        if (!row) {
          row = this.divisionRepo.create({ division: div });
          byDiv.set(div, row);
        }
        row.createdAt = toDate(r?.createdAt);
        row.updatedAt = toDate(r?.updatedAt);
        row.lastSyncedAt = new Date();
        batch.set(div, row);
        await this.persistClearstoryApiPayload('division', div, r);
      }
      saved += batch.size;
      if (batch.size) await this.divisionRepo.save([...batch.values()]);
      offset += limit;
      if (offset >= Number(count ?? 0)) break;
    }
    return saved;
  }

  /**
   * When customer detail includes `offices` (array), upsert office rows and replace junction rows for that customer.
   * Missing or non-array `offices` leaves existing links unchanged.
   */
  private collectCustomerDetailOffices(
    detail: any,
    officePayloads: Map<number, any>,
    linksByCustomer: Map<number, number[]>,
    customerId: number,
  ): void {
    if (!Array.isArray(detail?.offices)) return;
    const officeIds: number[] = [];
    for (const o of detail.offices) {
      const oid = Number(typeof o === 'object' && o !== null ? o.id : o);
      if (!Number.isFinite(oid)) continue;
      officeIds.push(oid);
      officePayloads.set(oid, typeof o === 'object' && o !== null ? o : { id: oid });
    }
    linksByCustomer.set(customerId, officeIds);
  }

  private async upsertOfficesFromPayloadMap(officePayloads: Map<number, any>): Promise<void> {
    if (!officePayloads.size) return;
    const ids = [...officePayloads.keys()];
    const existing = await this.officeRepo.findBy({ id: In(ids) });
    const byId = new Map(existing.map((e) => [e.id, e]));
    const rows: ClearstoryOffice[] = [];
    for (const [id, o] of officePayloads) {
      let row = byId.get(id);
      if (!row) {
        row = this.officeRepo.create({ id });
        byId.set(id, row);
      }
      this.mapOfficeFromPayload(row, o);
      row.lastSyncedAt = new Date();
      rows.push(row);
    }
    await this.officeRepo.save(rows);
  }

  private async replaceCustomerOfficeLinks(linksByCustomer: Map<number, number[]>): Promise<void> {
    if (!linksByCustomer.size) return;
    const now = new Date();
    for (const [customerId, officeIds] of linksByCustomer) {
      await this.customerOfficeRepo.delete({ customerId });
      if (!officeIds.length) continue;
      await this.customerOfficeRepo.save(
        officeIds.map((officeId) =>
          this.customerOfficeRepo.create({ customerId, officeId, lastSyncedAt: now }),
        ),
      );
    }
  }

  private async syncCustomers(): Promise<number> {
    const wantDetail = this.customerDetailEnabled();
    let saved = 0;
    let skip = 0;
    const take = 100;
    while (true) {
      const { records, count } = await this.api.listCustomers({ skip, take });
      const list = Array.isArray(records) ? records : [];
      if (!list.length) break;
      const ids = [...new Set(list.map((c) => Number(c?.id)).filter((id) => Number.isFinite(id)))];
      const existing = ids.length ? await this.customerRepo.findBy({ id: In(ids) }) : [];
      const byId = new Map(existing.map((e) => [e.id, e]));
      const batch = new Map<number, ClearstoryCustomer>();
      const officePayloads = new Map<number, any>();
      const linksByCustomer = new Map<number, number[]>();
      for (const c of list) {
        const id = Number(c?.id);
        if (!Number.isFinite(id)) continue;
        let row = byId.get(id);
        if (!row) {
          row = this.customerRepo.create({ id });
          byId.set(id, row);
        }
        this.mapCustomerFromPayload(row, c);
        row.lastSyncedAt = new Date();
        let mergedCustomer: unknown = c;
        if (wantDetail) {
          try {
            const detail = await this.api.getCustomer(id);
            mergedCustomer = mergeClearstoryApiObjects(c, detail);
            this.mapCustomerFromPayload(row, detail);
            this.collectCustomerDetailOffices(detail, officePayloads, linksByCustomer, id);
          } catch (e: any) {
            this.logger.warn(`Clearstory customer ${id} detail: ${e?.message ?? e}`);
          }
        }
        await this.persistClearstoryApiPayload('customer', String(id), mergedCustomer);
        batch.set(id, row);
      }
      saved += batch.size;
      if (batch.size) await this.customerRepo.save([...batch.values()]);
      if (wantDetail && linksByCustomer.size) {
        await this.upsertOfficesFromPayloadMap(officePayloads);
        await this.replaceCustomerOfficeLinks(linksByCustomer);
      }
      skip += take;
      if (skip >= Number(count ?? 0)) break;
    }
    return saved;
  }

  private async syncLabels(): Promise<number> {
    let saved = 0;
    let offset = 0;
    const limit = 100;
    while (true) {
      const { records, count } = await this.api.listLabels({ offset, limit });
      const list = Array.isArray(records) ? records : [];
      if (!list.length) break;
      const ids = [...new Set(list.map((lb) => Number(lb?.id)).filter((id) => Number.isFinite(id)))];
      const existing = ids.length ? await this.labelRepo.findBy({ id: In(ids) }) : [];
      const byId = new Map(existing.map((e) => [e.id, e]));
      const batch = new Map<number, ClearstoryLabel>();
      for (const lb of list) {
        const id = Number(lb?.id);
        if (!Number.isFinite(id)) continue;
        let row = byId.get(id);
        if (!row) {
          row = this.labelRepo.create({ id });
          byId.set(id, row);
        }
        row.name = strOpt(lb?.name);
        row.companyStandard = boolOpt(lb?.companyStandard);
        row.active = boolOpt(lb?.active);
        row.updatedAt = toDate(lb?.updatedAt);
        row.createdAt = toDate(lb?.createdAt);
        row.lastSyncedAt = new Date();
        batch.set(id, row);
        await this.persistClearstoryApiPayload('label', String(id), lb);
      }
      saved += batch.size;
      if (batch.size) await this.labelRepo.save([...batch.values()]);
      offset += limit;
      if (offset >= Number(count ?? 0)) break;
    }
    return saved;
  }

  private async syncProjects(): Promise<number> {
    let saved = 0;
    let skip = 0;
    const take = 100;
    while (true) {
      const { records, count } = await this.api.listProjects({ skip, take });
      const list = Array.isArray(records) ? records : [];
      if (!list.length) break;

      for (const p of list) {
        const id = Number(p?.id);
        if (!Number.isFinite(id)) continue;
        try {
          const entity =
            (await this.projectRepo.findOne({ where: { id } })) ?? this.projectRepo.create({ id });
          entity.lastSyncedAt = new Date();
          let mergedProject: unknown = p;
          try {
            const detail = await this.api.getProject(id);
            mergedProject = mergeClearstoryApiObjects(p, detail);
            this.mapProjectFromPayload(entity, p, detail);
          } catch (err: any) {
            this.logger.warn(`Clearstory project detail failed for ${id}: ${err?.message ?? err}`);
            this.mapProjectFromPayload(entity, p, null);
          }
          await this.persistClearstoryApiPayload('project', String(id), mergedProject);
          await this.projectRepo.save(entity);
          saved += 1;
        } catch (err: any) {
          this.logger.error(`Clearstory project save failed for ${id}: ${err?.message ?? err}`);
        }
      }

      skip += take;
      if (skip >= Number(count ?? 0)) break;
    }
    return saved;
  }

  /**
   * Ensure dbo.Clearstory_Projects is populated from the stored Clearstory JSON payloads.
   * This fixes historical gaps where a sync run stored payloads but did not save typed columns for some rows.
   */
  async backfillProjectsFromStoredPayloads(mode: BackfillMode = 'ONLY_MISSING'): Promise<{
    scanned: number;
    updated: number;
    created: number;
    parseFailed: number;
  }> {
    let scanned = 0;
    let updated = 0;
    let created = 0;
    let parseFailed = 0;

    const take = 500;
    let skip = 0;
    while (true) {
      const payloadRows = await this.apiPayloadRepo.find({
        where: { resourceType: 'project' },
        order: { resourceKey: 'ASC' } as any,
        skip,
        take,
      });
      if (!payloadRows.length) break;

      // Load existing typed rows for this page
      const ids = payloadRows
        .map((r) => Number(r.resourceKey))
        .filter((n) => Number.isFinite(n))
        .map((n) => Math.trunc(n));
      const existing = ids.length ? await this.projectRepo.findBy({ id: In(ids) }) : [];
      const byId = new Map(existing.map((e) => [e.id, e]));

      const batch: ClearstoryProject[] = [];
      for (const pr of payloadRows) {
        const id = Number(pr.resourceKey);
        if (!Number.isFinite(id)) continue;
        scanned += 1;

        let payload: any = null;
        try {
          payload = pr.payloadJson ? JSON.parse(pr.payloadJson) : null;
        } catch {
          parseFailed += 1;
          continue;
        }
        if (!payload || typeof payload !== 'object') continue;

        let row = byId.get(id);
        if (!row) {
          row = this.projectRepo.create({ id });
          byId.set(id, row);
          created += 1;
        }

        if (mode === 'ONLY_MISSING') {
          // If we already have a decent typed row, skip. (We treat missing customerName or missing address as “missing”.)
          const missing =
            row.customerName === null ||
            row.siteStreetAddress === null ||
            row.siteCity === null ||
            row.siteState === null ||
            row.siteZipCode === null;
          if (!missing) continue;
        }

        // Map from the merged payload object (treat it like `list` input).
        this.mapProjectFromPayload(row, payload, null);
        row.lastSyncedAt = new Date();
        batch.push(row);
      }

      if (batch.length) {
        await this.projectRepo.save(batch);
        updated += batch.length;
      }

      skip += take;
    }

    this.logger.log(
      `Clearstory projects backfill done: scanned=${scanned}, updated=${updated}, created=${created}, parseFailed=${parseFailed}`,
    );
    return { scanned, updated, created, parseFailed };
  }

  private async syncContracts(): Promise<number> {
    let saved = 0;
    let skip = 0;
    const take = 100;
    while (true) {
      const { records, count } = await this.api.listContracts({ skip, take, withProjects: true });
      const list = Array.isArray(records) ? records : [];
      if (!list.length) break;
      for (const c of list) {
        const id = Number(c?.id);
        if (!Number.isFinite(id)) continue;
        let row = await this.contractRepo.findOne({ where: { id } });
        if (!row) row = this.contractRepo.create({ id });
        row.name = c?.name ? String(c.name) : null;
        row.contractValue = toDecimalString(c?.contractValue);
        row.customerProjectId = Number.isFinite(Number(c?.customerProjectId)) ? Number(c.customerProjectId) : null;
        row.contractorProjectId = Number.isFinite(Number(c?.contractorProjectId))
          ? Number(c.contractorProjectId)
          : null;
        row.lastSyncedAt = new Date();
        await this.contractRepo.save(row);
        await this.persistClearstoryApiPayload('contract', String(id), c);
        saved += 1;
      }
      skip += take;
      if (skip >= Number(count ?? 0)) break;
    }
    return saved;
  }

  private async syncChangeNotifications(): Promise<number> {
    let saved = 0;
    const inboxes = ['sent', 'received'] as const;
    for (const inbox of inboxes) {
      let offset = 0;
      const limit = 100;
      while (true) {
        const { records, count } = await this.api.listChangeNotifications({ inbox, offset, limit });
        const list = Array.isArray(records) ? records : [];
        if (!list.length) break;

        for (const r of list) {
          const idNum = Number(r?.id);
          if (!Number.isFinite(idNum)) continue;
          const id = String(idNum);
          let row = await this.cnRepo.findOne({ where: { id } });
          if (!row) row = this.cnRepo.create({ id });
          row.lastInbox = inbox;
          this.mapCnFromPayload(row, r, null);
          row.lastSyncedAt = new Date();
          let mergedCn: unknown = r;

          try {
            const detail = await this.api.getChangeNotification(idNum);
            mergedCn = mergeClearstoryApiObjects(r, detail);
            this.mapCnFromPayload(row, r, detail);
            const contractIds = extractContractIdsFromCnDetail(detail);
            for (const cid of contractIds) {
              try {
                const cj = await this.api.getChangeNotificationForContract(idNum, cid);
                await this.persistClearstoryApiPayload('cn_contract', `${id}:${cid}`, cj);
                let cr =
                  (await this.cnContractRepo.findOne({
                    where: { changeNotificationId: id, contractId: cid },
                  })) ?? this.cnContractRepo.create({ changeNotificationId: id, contractId: cid });
                this.mapCnContractFromPayload(cr, cj);
                cr.lastSyncedAt = new Date();
                await this.cnContractRepo.save(cr);
              } catch (e: any) {
                this.logger.warn(`Clearstory CN ${id}/contract ${cid}: ${e?.message ?? e}`);
              }
            }
          } catch (e: any) {
            this.logger.warn(`Clearstory CN ${id} detail: ${e?.message ?? e}`);
          }

          await this.persistClearstoryApiPayload('change_notification', id, mergedCn);
          await this.cnRepo.save(row);
          saved += 1;
        }

        offset += limit;
        if (offset >= Number(count ?? 0)) break;
      }
    }
    return saved;
  }

  private async syncCorsAll(fromUpdatedAt?: string): Promise<number> {
    let total = 0;
    const inboxes = ['sent', 'received'] as const;
    for (const inbox of inboxes) {
      total += await this.syncCorsInbox(inbox, fromUpdatedAt);
    }
    return total;
  }

  private async syncCorsInbox(inbox: string, fromUpdatedAt?: string): Promise<number> {
    let saved = 0;
    let offset = 0;
    const limit = 100;
    while (true) {
      const { records, count } = await this.api.listCors({
        offset,
        limit,
        inbox,
        ...(fromUpdatedAt ? { fromUpdatedAt } : {}),
      });
      const list = Array.isArray(records) ? records : [];
      if (!list.length) break;

      for (const c of list) {
        const idRaw = c?.id;
        if (idRaw === undefined || idRaw === null) continue;
        const id = String(idRaw);

        const entity = (await this.corRepo.findOne({ where: { id } })) ?? this.corRepo.create({ id });
        this.mapCorFromPayload(entity, c, null);
        entity.lastSyncedAt = new Date();
        let mergedCor: unknown = c;

        if (entity.projectId && !entity.jobNumber) {
          const proj = await this.projectRepo.findOne({ where: { id: entity.projectId } });
          entity.jobNumber = proj?.jobNumber ?? null;
        }

        try {
          const detail = await this.api.getCor(id, true);
          mergedCor = mergeClearstoryApiObjects(c, detail);
          this.mapCorFromPayload(entity, c, detail);
        } catch (err: any) {
          this.logger.warn(`Clearstory COR detail failed for ${id}: ${err?.message ?? err}`);
        }

        if (entity.projectId && !entity.jobNumber) {
          const proj = await this.projectRepo.findOne({ where: { id: entity.projectId } });
          entity.jobNumber = proj?.jobNumber ?? null;
        }

        await this.persistClearstoryApiPayload('cor', id, mergedCor);
        await this.corRepo.save(entity);
        saved += 1;
      }

      offset += limit;
      if (offset >= Number(count ?? 0)) break;
    }
    return saved;
  }

  /** Extra GET per tag (slow). Off by default because /tags list already contains every field we persist. */
  private tagDetailEnabled(): boolean {
    const raw = this.config.get<string>('CLEARSTORY_TAG_DETAIL', 'false') ?? 'false';
    const v = String(raw).trim().toLowerCase();
    return ['true', '1', 'yes', 'on'].includes(v);
  }

  private async syncTagsAll(): Promise<number> {
    /**
     * Clearstory `/tags` requires the `inbox` query param — calling without it returns
     * HTTP 422 ("Invalid value, param=inbox"). We hit both inboxes (`sent` + `received`)
     * and dedupe by tag id so we never double-save the same row.
     *
     * Per-page strategy (measured: ~7 min/page of 100 with per-row detail+save, ~1 s without):
     *   1. One list call → N rows.
     *   2. One IN(ids) lookup for existing tag rows (so save() becomes UPDATE not INSERT).
     *   3. One IN(projectIds) lookup to backfill jobNumber in bulk.
     *   4. Batch save tag rows + batch save raw payloads.
     */
    const strategies: { label: string; params: Record<string, unknown> }[] = [
      { label: 'sent', params: { inbox: 'sent' } },
      { label: 'received', params: { inbox: 'received' } },
    ];

    const diag: ClearstoryTagsPhaseDiag = {
      ranAt: new Date().toISOString(),
      saved: 0,
      uniqueIds: 0,
      strategies: strategies.map((s) => newTagsStrategyDiag(s.label, s.params)),
    };

    const persistDiag = async () => {
      try {
        await this.setState('tagsPhaseLast', JSON.stringify(diag));
      } catch (e: any) {
        this.logger.warn(`Clearstory tagsPhaseLast state write failed: ${e?.message ?? e}`);
      }
    };

    const wantDetail = this.tagDetailEnabled();
    const seen = new Set<number>();
    let saved = 0;
    try {
      for (let si = 0; si < strategies.length; si += 1) {
        const { label, params } = strategies[si];
        const box = diag.strategies[si];
        let skip = 0;
        const take = 100;
        while (true) {
          box.lastSkip = skip;
          let list: any[] = [];
          let countRaw: unknown;
          try {
            const paged = await this.api.listTags({ ...params, skip, take });
            list = Array.isArray(paged.records) ? paged.records : [];
            countRaw = paged.count;
            const countNum = Number(countRaw);
            box.lastApiCount = Number.isFinite(countNum) ? countNum : list.length;
            if (box.pages === 0) box.firstPageListLen = list.length;
          } catch (e: any) {
            box.error = e instanceof Error ? e.message : String(e);
            this.logger.error(`Clearstory tags listTags failed strategy=${label} skip=${skip}: ${box.error}`);
            break;
          }

          if (!list.length) break;

          box.pages += 1;
          box.rowsSeen += list.length;

          // Dedupe rows that showed up under a previous strategy.
          const fresh = list.filter((t) => {
            const id = Number(t?.id);
            return Number.isFinite(id) && !seen.has(id);
          });
          if (!fresh.length) {
            skip += take;
            if (skip >= Number(countRaw ?? 0)) break;
            continue;
          }

          const ids = fresh.map((t) => Number(t.id));
          const projectIds = [
            ...new Set(
              fresh
                .map((t) => Number(t?.projectId))
                .filter((id): id is number => Number.isFinite(id)),
            ),
          ];

          const [existingRows, projectRows] = await Promise.all([
            this.tagRepo.findBy({ id: In(ids) }),
            projectIds.length
              ? this.projectRepo.findBy({ id: In(projectIds) })
              : Promise.resolve([] as { id: number; jobNumber: string | null }[]),
          ]);
          const existingById = new Map(existingRows.map((r) => [r.id, r]));
          const jobNumberByProject = new Map(projectRows.map((p) => [p.id, p.jobNumber ?? null]));

          const entitiesToSave: ClearstoryTag[] = [];
          const payloadRows: { resourceType: string; resourceKey: string; payloadJson: string; lastFetchedAt: Date }[] = [];
          const now = new Date();

          for (const t of fresh) {
            const id = Number(t.id);
            seen.add(id);

            let mergedTag: unknown = t;
            if (wantDetail) {
              try {
                const detail = await this.api.getTag(id);
                mergedTag = mergeClearstoryApiObjects(t, detail);
              } catch (err: any) {
                this.logger.warn(`Clearstory tag detail failed for ${id}: ${err?.message ?? err}`);
              }
            }

            const entity = existingById.get(id) ?? this.tagRepo.create({ id });
            this.mapTagFromPayload(entity, t, wantDetail ? (mergedTag as any) : null);
            if (entity.projectId && !entity.jobNumber) {
              entity.jobNumber = jobNumberByProject.get(entity.projectId) ?? null;
            }
            entity.lastSyncedAt = now;
            entitiesToSave.push(entity);

            let json = '';
            try {
              json = JSON.stringify(mergedTag ?? null);
            } catch (e: any) {
              this.logger.warn(`Clearstory tag payload stringify failed id=${id}: ${e?.message ?? e}`);
              continue;
            }
            payloadRows.push({
              resourceType: 'tag',
              resourceKey: String(id).slice(0, 400),
              payloadJson: json,
              lastFetchedAt: now,
            });
          }

          if (entitiesToSave.length) await this.tagRepo.save(entitiesToSave);
          if (payloadRows.length) await this.apiPayloadRepo.save(payloadRows);
          saved += entitiesToSave.length;

          this.logger.log(
            `Clearstory tags strategy=${label} skip=${skip} listLen=${list.length} fresh=${fresh.length} saved=${entitiesToSave.length} apiCount=${countRaw ?? 'n/a'}`,
          );

          skip += take;
          if (skip >= Number(countRaw ?? 0)) break;
        }
      }

      diag.saved = saved;
      diag.uniqueIds = seen.size;
      return saved;
    } finally {
      diag.saved = saved;
      diag.uniqueIds = seen.size;
      await persistDiag();
    }
  }

  private async syncCorAggregateSnapshots(): Promise<number> {
    let n = 0;
    for (const inbox of ['sent', 'received'] as const) {
      try {
        const overview = await this.api.getCorOverview({ inbox });
        await this.appendSnapshot('cors_overview', `inbox=${inbox}`, overview);
        await this.persistClearstoryApiPayload('cors_overview', `inbox=${inbox}`, overview);
        n += 1;
      } catch (e: any) {
        this.logger.warn(`Clearstory cors/overview ${inbox}: ${e?.message ?? e}`);
      }
      try {
        const summary = await this.api.getCorContractSummary({ inbox });
        await this.appendSnapshot('cors_contract_summary', `inbox=${inbox}`, summary);
        await this.persistClearstoryApiPayload('cors_contract_summary', `inbox=${inbox}`, summary);
        n += 1;
      } catch (e: any) {
        this.logger.warn(`Clearstory cors/contract-summary ${inbox}: ${e?.message ?? e}`);
      }
    }
    return n;
  }

  private async syncCompanyRates(): Promise<number> {
    let saved = 0;
    for (const rateType of RATE_TYPES) {
      let skip = 0;
      const take = 100;
      while (true) {
        const { records, count } = await this.api.listRates(rateType, { skip, take });
        const list = Array.isArray(records) ? records : [];
        if (!list.length) break;
        for (const r of list) {
          const rid = Number((r as any)?.id);
          if (!Number.isFinite(rid)) continue;
          let row = await this.rateRepo.findOne({ where: { rateType, recordId: rid } });
          if (!row) row = this.rateRepo.create({ rateType, recordId: rid });
          this.mapLmeoRateFromPayload(row, rateType, r);
          row.lastSyncedAt = new Date();
          await this.rateRepo.save(row);
          await this.persistClearstoryApiPayload('rate', `${rateType}:${rid}`, r);
          saved += 1;
        }
        skip += take;
        if (skip >= Number(count ?? 0)) break;
      }
    }
    return saved;
  }

  private async syncProjectRates(): Promise<number> {
    let saved = 0;
    const projects = await this.projectRepo.find({ select: ['id'] });
    for (const p of projects) {
      for (const rateType of RATE_TYPES) {
        let skip = 0;
        const take = 100;
        while (true) {
          const { records, count } = await this.api.listProjectRates(p.id, rateType, { skip, take });
          const list = Array.isArray(records) ? records : [];
          if (!list.length) break;
          for (const r of list) {
            const rid = Number((r as any)?.id);
            if (!Number.isFinite(rid)) continue;
            let row = await this.projectRateRepo.findOne({
              where: { projectId: p.id, rateType, recordId: rid },
            });
            if (!row) row = this.projectRateRepo.create({ projectId: p.id, rateType, recordId: rid });
            this.mapLmeoRateFromPayload(row, rateType, r);
            row.lastSyncedAt = new Date();
            await this.projectRateRepo.save(row);
            await this.persistClearstoryApiPayload('project_rate', `${p.id}:${rateType}:${rid}`, r);
            saved += 1;
          }
          skip += take;
          if (skip >= Number(count ?? 0)) break;
        }
      }
    }
    return saved;
  }
}
