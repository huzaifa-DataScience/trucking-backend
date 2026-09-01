import {
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import {
  Bid,
  BidHelperMap,
  BidItemCatalog,
  BidMikeCsvRow,
  BidMikeFile,
  BidSpecArea,
  BidSpecLine,
  BidSpecMaterial,
  BidSpecSystem,
  Job,
} from '../../database/entities';
import { apiBadRequest, apiNotFound, ApiErrorCode } from '../../common/errors/api-error';
import { ConnecteamReportService } from '../../connecteam/connecteam-report.service';
import { normalizeConnecteamJobNumber } from '../../connecteam/connecteam.util';
import { catalogDimsForMaterial, expandSpecMaterialsForKind, specSheetExcelMaterials } from './spec-trimble-materials';
import {
  buildProductionReportLines,
  deriveMaterialBase,
  enrichSpecLine,
  matchModeForInsulation,
  normalizeMaterialBase,
  parseSystemAndType,
  productionStatus,
  resolveMaterial,
  resolveSpecSystemName,
  SPEC_FACING_OPTIONS,
  normalizeFacingOption,
  suggestSpecLinesFromMike,
  compareBySpecType,
  sumProductionHours,
  type CatalogItem,
  type HelperMapEntry,
  type LineItemRow,
  type MikeRollupRow,
} from './specs-engine';
import { resolveTrimbleProjectIdForJob } from '../resolve-trimble-project';
import { planJobLinkFromMikeHints, type JobLinkResult } from '../resolve-job-from-mike';
import {
  fillSpecSheetCodes,
  parseFamilyQuery,
  specMaterialsQueryEmpty,
  specSheetKind,
  EQUIPMENT_SYSTEMS,
  type SpecSheet,
} from '../process/spec-sheet';

export type MikeRowInput = {
  excelRowNumber?: number;
  systemAndType?: string;
  thickness?: number | null;
  size?: number | null;
  quantity?: number;
  materialCost?: number | null;
  hours?: number | null;
  materialPhrase?: string | null;
  materialBase?: string | null;
};

/** Mike takeoff meta — user sets display name + job at upload (or PATCH later). */
export type MikeUploadMeta = {
  /** Display name for the takeoff (user-chosen; not auto “COMBINED TAKEOFF”) */
  fileName?: string | null;
  /** Job # string (Mike header col B and/or user pick) — used for auto-link + display */
  jobNumberHint?: string | null;
  /** Project title (Mike header col C) */
  projectLabel?: string | null;
  /** Explicit Ref_Jobs id from Job picker at upload — preferred over hint auto-match */
  jobId?: number | null;
  /** When true (default), this upload becomes the active estimation file */
  activate?: boolean;
};

export type SpecLineWriteDto = {
  type?: string | null;
  systemName: string;
  areaName?: string | null;
  insulation: string;
  size: number;
  thickness: number;
  weight?: string | null;
  facing?: string | null;
  addJacket?: string | null;
  layers?: string | null;
  extraNotes?: string | null;
  sortOrder?: number;
};

@Injectable()
export class SpecsService implements OnModuleInit {
  private readonly logger = new Logger(SpecsService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly connecteamReports: ConnecteamReportService,
    @InjectRepository(Bid) private readonly bids: Repository<Bid>,
    @InjectRepository(Job) private readonly jobs: Repository<Job>,
    @InjectRepository(BidSpecSystem) private readonly systems: Repository<BidSpecSystem>,
    @InjectRepository(BidSpecMaterial) private readonly materials: Repository<BidSpecMaterial>,
    @InjectRepository(BidSpecArea) private readonly areas: Repository<BidSpecArea>,
    @InjectRepository(BidHelperMap) private readonly helpers: Repository<BidHelperMap>,
    @InjectRepository(BidMikeCsvRow) private readonly mikeRows: Repository<BidMikeCsvRow>,
    @InjectRepository(BidMikeFile) private readonly mikeFiles: Repository<BidMikeFile>,
    @InjectRepository(BidSpecLine) private readonly specLines: Repository<BidSpecLine>,
    @InjectRepository(BidItemCatalog) private readonly catalog: Repository<BidItemCatalog>,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.ensureMikeFilesSchema();
    } catch (err: any) {
      this.logger.error(`Mike files schema ensure failed: ${err?.message ?? err}`);
    }
    try {
      await this.ensureSpecMaterialSortOrder();
    } catch (err: any) {
      this.logger.error(`Spec material sort-order ensure failed: ${err?.message ?? err}`);
    }
  }

  /** Idempotent: Bid_MikeFiles + MikeFileId on rows + legacy backfill. */
  private async ensureMikeFilesSchema(): Promise<void> {
    await this.dataSource.query(`
      IF OBJECT_ID('dbo.Bid_MikeFiles', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.Bid_MikeFiles (
          MikeFileId bigint IDENTITY(1,1) NOT NULL PRIMARY KEY,
          BidId int NOT NULL,
          FileName nvarchar(260) NOT NULL,
          JobNumberHint nvarchar(40) NULL,
          ProjectLabel nvarchar(300) NULL,
          ImportedRowCount int NOT NULL CONSTRAINT DF_Bid_MikeFiles_RowCount DEFAULT 0,
          IsActive bit NOT NULL CONSTRAINT DF_Bid_MikeFiles_IsActive DEFAULT 0,
          CreatedAt datetime2 NOT NULL CONSTRAINT DF_Bid_MikeFiles_CreatedAt DEFAULT SYSUTCDATETIME()
        );
        CREATE INDEX IX_Bid_MikeFiles_BidId ON dbo.Bid_MikeFiles(BidId);
      END
    `);
    await this.dataSource.query(`
      IF COL_LENGTH('dbo.Bid_MikeCsvRows', 'MikeFileId') IS NULL
      BEGIN
        ALTER TABLE dbo.Bid_MikeCsvRows ADD MikeFileId bigint NULL;
        CREATE INDEX IX_Bid_MikeCsvRows_MikeFileId ON dbo.Bid_MikeCsvRows(MikeFileId);
      END
    `);
    await this.dataSource.query(`
      ;WITH orphanBids AS (
        SELECT DISTINCT r.BidId
        FROM dbo.Bid_MikeCsvRows r
        WHERE r.MikeFileId IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM dbo.Bid_MikeFiles f
            WHERE f.BidId = r.BidId AND f.FileName = N'Legacy upload'
          )
      )
      INSERT INTO dbo.Bid_MikeFiles (BidId, FileName, ImportedRowCount, IsActive, CreatedAt)
      SELECT
        o.BidId,
        N'Legacy upload',
        (SELECT COUNT(*) FROM dbo.Bid_MikeCsvRows r WHERE r.BidId = o.BidId AND r.MikeFileId IS NULL),
        CASE
          WHEN EXISTS (
            SELECT 1 FROM dbo.Bid_MikeFiles f WHERE f.BidId = o.BidId AND f.IsActive = 1
          ) THEN 0
          ELSE 1
        END,
        SYSUTCDATETIME()
      FROM orphanBids o
    `);
    await this.dataSource.query(`
      UPDATE r
      SET r.MikeFileId = (
        SELECT TOP 1 f.MikeFileId
        FROM dbo.Bid_MikeFiles f
        WHERE f.BidId = r.BidId AND f.FileName = N'Legacy upload'
        ORDER BY f.MikeFileId DESC
      )
      FROM dbo.Bid_MikeCsvRows r
      WHERE r.MikeFileId IS NULL
    `);
  }

  private async requireBid(bidId: number): Promise<Bid> {
    const bid = await this.bids.findOne({ where: { id: bidId, isDeleted: false } });
    if (!bid) {
      throw apiNotFound(ApiErrorCode.SPECS_BID_NOT_FOUND, `Bid ${bidId} was not found.`);
    }
    // Lazy auto-link: job set but Trimble missing → resolve once and persist
    if (bid.trimbleProjectId == null && bid.jobId != null) {
      const resolved = await resolveTrimbleProjectIdForJob(this.dataSource, bid.jobId);
      if (resolved != null) {
        bid.trimbleProjectId = resolved;
        bid.updatedAt = new Date();
        await this.bids.save(bid);
      }
    }
    return bid;
  }

  async getSpecSystems(kind?: string) {
    const where: { isActive: boolean; kind?: 'hydronic' | 'plumbing' | 'duct' | 'equipment' } = {
      isActive: true,
    };
    const k = specSheetKind(kind);
    if (k) where.kind = k;
    const rows = await this.systems.find({ where, order: { sortOrder: 'ASC', systemName: 'ASC' } });
    if (k === 'equipment' && rows.length === 0) {
      return EQUIPMENT_SYSTEMS.map((s, i) => ({
        id: 10_000 + i,
        systemName: s.systemName,
        code: s.code,
        unit: s.unit,
        kind: s.kind,
        sortOrder: i,
        isActive: true,
      }));
    }
    return rows;
  }

  getSpecMaterials(
    _kind?: string,
    opts?: { family?: string; insulationFamily?: string; layer?: string; code?: string; q?: string },
  ) {
    if (specMaterialsQueryEmpty(opts)) return Promise.resolve([]);
    return this.materials
      .find({ where: { isActive: true }, order: { sortOrder: 'ASC', description: 'ASC' } })
      .then(async (rows) => {
        const excel = specSheetExcelMaterials(rows.map((r) => this.mapSpecMaterial(r)));
        const [helpers, trimble] = await Promise.all([
          this.helpers.find({ where: { isActive: true } }),
          this.loadTrimbleCompanyItems(),
        ]);
        let list = expandSpecMaterialsForKind(
          excel,
          helpers.map((h) => ({
            specPhrase: h.specPhrase,
            keyword: h.keyword,
            keyword2: h.keyword2,
            rawPrefix: h.rawPrefix,
            baseName: h.baseName,
          })),
          trimble,
        );
        const family = parseFamilyQuery(opts?.family || opts?.insulationFamily);
        if (family) {
          list = list.filter((m) => m.family === family || m.insulationFamily === family);
        }
        const layer = opts?.layer?.trim().toLowerCase();
        if (layer === 'insulation' || layer === 'covering') {
          list = list.filter((m) => m.layer === layer);
        }
        const code = opts?.code?.trim().toLowerCase();
        if (code) list = list.filter((m) => m.code.toLowerCase() === code);
        const q = opts?.q?.trim().toLowerCase();
        if (q) {
          list = list.filter(
            (m) =>
              m.description.toLowerCase().includes(q) ||
              m.code.toLowerCase().includes(q) ||
              m.excelDescription.toLowerCase().includes(q),
          );
        }
        return list;
      });
  }

  getSpecSizes(kind?: string, code?: string) {
    return this.specInchLookups('sizes', kind, code);
  }

  getSpecThicknesses(kind?: string, code?: string) {
    return this.specInchLookups('thicknesses', kind, code);
  }

  /** Trimble dims for that insulation `code`. No code / no catalog hit → [] (never Excel NPS). */
  private async specInchLookups(
    field: 'sizes' | 'thicknesses',
    kind: string | undefined,
    code: string | undefined,
  ) {
    const dims = await this.loadCatalogDims(kind, code);
    return dims ? dims[field] : [];
  }

  private async loadCatalogDims(_kind?: string, code?: string) {
    const c = code?.trim();
    if (!c) return null;
    const [all, helpers, trimble] = await Promise.all([
      this.materials.find({ where: { isActive: true } }),
      this.helpers.find({ where: { isActive: true } }),
      this.loadTrimbleCompanyItems(),
    ]);
    const excel = specSheetExcelMaterials(all.map((r) => this.mapSpecMaterial(r)));
    const mat =
      excel.find((m) => m.code === c) || excel.find((m) => m.code.toLowerCase() === c.toLowerCase());
    if (!mat) return null;
    return catalogDimsForMaterial(
      mat,
      helpers.map((h) => ({
        specPhrase: h.specPhrase,
        keyword: h.keyword,
        keyword2: h.keyword2,
        rawPrefix: h.rawPrefix,
        baseName: h.baseName,
      })),
      trimble,
    );
  }

  async applySpecSheetCodes(process: { specSheets?: SpecSheet[] }): Promise<void> {
    if (!process.specSheets?.length) return;
    const [systems, areas, materials, helpers] = await Promise.all([
      this.systems.find({ where: { isActive: true } }),
      this.areas.find({ where: { isActive: true } }),
      this.materials.find({ where: { isActive: true } }),
      this.helpers.find({ where: { isActive: true } }),
    ]);
    process.specSheets = fillSpecSheetCodes(process.specSheets, {
      systems,
      areas,
      materials: materials.map((r) => this.mapSpecMaterial(r)),
      helpers: helpers.map((h) => ({
        specPhrase: h.specPhrase,
        keyword: h.keyword,
        keyword2: h.keyword2,
        rawPrefix: h.rawPrefix,
        baseName: h.baseName,
      })),
    });
  }

  private mapSpecMaterial(r: BidSpecMaterial) {
    return {
      id: r.id,
      description: r.description,
      code: r.code,
      kind: r.kind,
      facing: r.facing,
      jacket: r.jacket,
      thicknessIn: r.thicknessIn == null ? null : Number(r.thicknessIn),
      weight: r.weight == null ? null : Number(r.weight),
      sortOrder: r.sortOrder,
    };
  }

  /**
   * Seed used to zip HVAC + plumbing + duct on one Excel row (sort 0,1,2,0,1,2…).
   * Re-number so unfiltered ORDER BY SortOrder is hydronic, then plumbing, then duct.
   */
  private async ensureSpecMaterialSortOrder(): Promise<void> {
    await this.dataSource.query(`
      WITH ordered AS (
        SELECT SpecMaterialId,
          ROW_NUMBER() OVER (
            ORDER BY CASE Kind
              WHEN 'hydronic' THEN 0
              WHEN 'plumbing' THEN 1
              WHEN 'duct' THEN 2
              ELSE 9 END,
            SortOrder, SpecMaterialId
          ) - 1 AS NewSort
        FROM dbo.Bid_SpecMaterials
      )
      UPDATE m SET SortOrder = o.NewSort
      FROM dbo.Bid_SpecMaterials m
      INNER JOIN ordered o ON o.SpecMaterialId = m.SpecMaterialId
      WHERE m.SortOrder <> o.NewSort;
    `);
  }

  private async loadTrimbleCompanyItems(): Promise<
    Array<{ recordId: string; itemName: string; units: string }>
  > {
    try {
      const rows: Array<{ recordId?: unknown; itemName?: unknown; units?: unknown }> =
        await this.dataSource.query(`
          SELECT [Record ID] AS recordId, [Item Name] AS itemName, [Units] AS units
          FROM dbo.Trimble_CompanyItems
        `);
      return (rows || [])
        .map((r) => ({
          recordId: r.recordId == null ? '' : String(r.recordId),
          itemName: String(r.itemName ?? '').trim(),
          units: String(r.units ?? '').trim(),
        }))
        .filter((r) => r.itemName);
    } catch {
      return [];
    }
  }

  getSpecAreas() {
    return this.areas.find({ where: { isActive: true }, order: { sortOrder: 'ASC', areaName: 'ASC' } });
  }

  /** Fixed facing dropdown (not a DB table — Excel Specs Facing + helpermap facings). */
  getSpecFacings() {
    return SPEC_FACING_OPTIONS.map((o, i) => ({
      value: o.value,
      label: o.label,
      sortOrder: i,
    }));
  }

  getHelperMap() {
    return this.helpers.find({ where: { isActive: true }, order: { sortOrder: 'ASC', id: 'ASC' } });
  }

  async listCatalog(opts?: { search?: string; size1?: number; size2?: number; limit?: number }) {
    const qb = this.catalog
      .createQueryBuilder('c')
      .where('c.isActive = 1')
      .orderBy('c.itemName', 'ASC')
      .take(Math.min(opts?.limit ?? 100, 500));
    if (opts?.search?.trim()) {
      qb.andWhere('c.nameLc LIKE :q', { q: `%${opts.search.trim().toLowerCase()}%` });
    }
    if (opts?.size1 != null) qb.andWhere('c.size1 = :s1', { s1: opts.size1 });
    if (opts?.size2 != null) qb.andWhere('c.size2 = :s2', { s2: opts.size2 });
    const rows = await qb.getMany();
    return rows.map((r) => ({
      id: r.id,
      itemName: r.itemName,
      price: r.price == null ? null : Number(r.price),
      size1: r.size1 == null ? null : Number(r.size1),
      size2: r.size2 == null ? null : Number(r.size2),
    }));
  }

  async patchCatalogPrice(itemId: number, price: number) {
    if (!Number.isFinite(price) || price < 0) {
      throw apiBadRequest(
        ApiErrorCode.SPECS_CATALOG_PRICE_INVALID,
        'Catalog price must be a number greater than or equal to 0.',
      );
    }
    const row = await this.catalog.findOne({ where: { id: itemId, isActive: true } });
    if (!row) {
      throw apiNotFound(
        ApiErrorCode.SPECS_CATALOG_NOT_FOUND,
        `Catalog item ${itemId} was not found.`,
      );
    }
    row.price = price;
    row.updatedAt = new Date();
    await this.catalog.save(row);
    return {
      id: row.id,
      itemName: row.itemName,
      price: Number(row.price),
      size1: row.size1 == null ? null : Number(row.size1),
      size2: row.size2 == null ? null : Number(row.size2),
    };
  }

  private mapMikeFile(f: BidMikeFile) {
    return {
      id: Number(f.id),
      bidId: f.bidId,
      fileName: f.fileName,
      jobNumberHint: f.jobNumberHint,
      projectLabel: f.projectLabel,
      rowCount: Number(f.rowCount) || 0,
      isActive: !!f.isActive,
      createdAt: f.createdAt,
    };
  }

  private async findActiveMikeFile(bidId: number): Promise<BidMikeFile | null> {
    return this.mikeFiles.findOne({ where: { bidId, isActive: true } });
  }

  private makeMikeRowEntities(
    rowRepo: Repository<BidMikeCsvRow>,
    bidId: number,
    mikeFileId: number,
    rows: MikeRowInput[],
  ): BidMikeCsvRow[] {
    return rows.map((r) => {
      const parsed = parseSystemAndType(r.systemAndType);
      const phrase = r.materialPhrase ?? null;
      const base = normalizeMaterialBase(
        r.materialBase?.trim() || deriveMaterialBase(phrase),
        phrase,
      );
      return rowRepo.create({
        bidId,
        mikeFileId,
        excelRowNumber: r.excelRowNumber ?? null,
        systemAndType: r.systemAndType ?? null,
        discipline: parsed.discipline,
        systemCode: parsed.systemCode,
        areaLetter: parsed.areaLetter,
        systemName: parsed.systemName,
        thickness: r.thickness ?? null,
        size: r.size ?? null,
        quantity: Number(r.quantity) || 0,
        materialCost: r.materialCost ?? null,
        hours: r.hours ?? null,
        materialPhrase: phrase,
        materialBase: base,
      });
    });
  }

  /**
   * One physical Mike takeoff per bid. Extra file headers are collapsed; all CSV rows
   * point at the keeper. Call on list/upload so old multi-file bids heal themselves.
   */
  private async consolidateToSingleMikeFile(
    bidId: number,
    mgr?: EntityManager,
  ): Promise<BidMikeFile | null> {
    const fileRepo = mgr ? mgr.getRepository(BidMikeFile) : this.mikeFiles;
    const rowRepo = mgr ? mgr.getRepository(BidMikeCsvRow) : this.mikeRows;

    const files = await fileRepo.find({
      where: { bidId },
      order: { id: 'ASC' },
    });
    if (!files.length) return null;

    const keeper = files.find((f) => f.isActive) ?? files[0];
    const keeperId = Number(keeper.id);

    if (files.length > 1) {
      const otherIds = files
        .map((f) => Number(f.id))
        .filter((id) => id !== keeperId);
      if (otherIds.length) {
        await rowRepo
          .createQueryBuilder()
          .update(BidMikeCsvRow)
          .set({ mikeFileId: keeperId })
          .where('bidId = :bidId AND mikeFileId IN (:...otherIds)', {
            bidId,
            otherIds,
          })
          .execute();
        await fileRepo.delete({ id: In(otherIds) });
      }
      // Keep keeper.fileName — never auto-rename to “COMBINED TAKEOFF”
    }

    // Orphans / legacy rows without a file header → same takeoff
    await rowRepo
      .createQueryBuilder()
      .update(BidMikeCsvRow)
      .set({ mikeFileId: keeperId })
      .where('bidId = :bidId AND (mikeFileId IS NULL OR mikeFileId <> :keeperId)', {
        bidId,
        keeperId,
      })
      .execute();

    keeper.rowCount = await rowRepo.count({
      where: { bidId, mikeFileId: keeperId },
    });
    keeper.isActive = true;
    if (!keeper.jobNumberHint) {
      keeper.jobNumberHint =
        files.find((f) => f.jobNumberHint?.trim())?.jobNumberHint?.trim() || null;
    }
    if (!keeper.projectLabel) {
      keeper.projectLabel =
        files.find((f) => f.projectLabel?.trim())?.projectLabel?.trim() || null;
    }
    await fileRepo.save(keeper);
    return keeper;
  }

  /** All Mike CSV rows on the bid (single takeoff after consolidate). */
  private async loadAllMikeRowsForBid(bidId: number): Promise<BidMikeCsvRow[]> {
    await this.consolidateToSingleMikeFile(bidId);
    return this.mikeRows.find({
      where: { bidId },
      order: { id: 'ASC' },
    });
  }

  async listMikeFiles(bidId: number) {
    await this.requireBid(bidId);
    const takeoff = await this.consolidateToSingleMikeFile(bidId);
    const files = takeoff ? [takeoff] : [];
    const totalRows = takeoff ? Number(takeoff.rowCount) || 0 : 0;
    return {
      bidId,
      activeMikeFileId: takeoff ? Number(takeoff.id) : null,
      /** Always one physical takeoff file; further CSV uploads append into it. */
      calcMerge: {
        mode: 'single_file' as const,
        fileCount: files.length,
        totalRows,
        fileIds: files.map((f) => Number(f.id)),
        fileNames: files.map((f) => f.fileName),
      },
      files: files.map((f) => this.mapMikeFile(f)),
    };
  }

  /**
   * Global estimation-files library (all bids). FE listing page.
   * One row per bid takeoff (multi-CSV bids are consolidated first).
   * Optional `bidId` / `q` (file name, estimate #, bid name, project label).
   */
  async listAllEstimationFiles(opts?: { bidId?: number; q?: string; limit?: number }) {
    const multi = await this.mikeFiles
      .createQueryBuilder('f')
      .select('f.bidId', 'bidId')
      .groupBy('f.bidId')
      .having('COUNT(*) > 1')
      .getRawMany<{ bidId: number }>();
    for (const row of multi) {
      await this.consolidateToSingleMikeFile(Number(row.bidId));
    }

    const limit = Math.min(Math.max(opts?.limit ?? 200, 1), 500);
    const qb = this.mikeFiles
      .createQueryBuilder('f')
      .innerJoin(Bid, 'b', 'b.id = f.bidId')
      .where('b.isDeleted = 0')
      .orderBy('f.createdAt', 'DESC')
      .addOrderBy('f.id', 'DESC')
      .take(limit);

    if (opts?.bidId != null) {
      qb.andWhere('f.bidId = :bidId', { bidId: opts.bidId });
    }
    const q = opts?.q?.trim();
    if (q) {
      qb.andWhere(
        `(f.fileName LIKE :q OR f.projectLabel LIKE :q OR b.estimateNumber LIKE :q OR b.bidName LIKE :q OR f.jobNumberHint LIKE :q)`,
        { q: `%${q}%` },
      );
    }

    const files = await qb.getMany();
    if (!files.length) return [];

    const bids = await this.bids.find({
      where: { id: In([...new Set(files.map((f) => f.bidId))]) },
      select: ['id', 'estimateNumber', 'bidName', 'status'],
    });
    const bidById = new Map(bids.map((b) => [b.id, b]));

    return files.map((f) => {
      const bid = bidById.get(f.bidId);
      return {
        ...this.mapMikeFile(f),
        estimateNumber: bid?.estimateNumber ?? null,
        bidName: bid?.bidName ?? null,
        bidStatus: bid?.status ?? null,
      };
    });
  }

  /** Open one estimation file (meta + bid + rows) for the detail/view page. */
  async getEstimationFile(fileId: number) {
    const file = await this.mikeFiles.findOne({ where: { id: fileId } });
    if (!file) {
      throw apiNotFound(
        ApiErrorCode.SPECS_MIKE_FILE_NOT_FOUND,
        `Estimation file ${fileId} was not found.`,
      );
    }
    const bid = await this.bids.findOne({ where: { id: file.bidId, isDeleted: false } });
    if (!bid) {
      throw apiNotFound(
        ApiErrorCode.SPECS_BID_NOT_FOUND,
        `Bid for estimation file ${fileId} was not found.`,
      );
    }
    const rows = await this.mikeRows.find({
      where: { bidId: file.bidId, mikeFileId: Number(file.id) },
      order: { id: 'ASC' },
    });
    return {
      ...this.mapMikeFile(file),
      bid: {
        id: bid.id,
        estimateNumber: bid.estimateNumber,
        bidName: bid.bidName,
        status: bid.status,
        jobId: bid.jobId == null ? null : Number(bid.jobId),
        trimbleProjectId:
          bid.trimbleProjectId == null ? null : Number(bid.trimbleProjectId),
      },
      rows: rows.map((r) => ({
        id: Number(r.id),
        excelRowNumber: r.excelRowNumber,
        systemAndType: r.systemAndType,
        discipline: r.discipline,
        systemCode: r.systemCode,
        areaLetter: r.areaLetter,
        systemName: r.systemName,
        thickness: r.thickness == null ? null : Number(r.thickness),
        size: r.size == null ? null : Number(r.size),
        quantity: Number(r.quantity) || 0,
        materialCost: r.materialCost == null ? null : Number(r.materialCost),
        hours: r.hours == null ? null : Number(r.hours),
        materialPhrase: r.materialPhrase,
        materialBase: r.materialBase,
      })),
    };
  }

  async deleteEstimationFileById(fileId: number) {
    const file = await this.mikeFiles.findOne({ where: { id: fileId } });
    if (!file) {
      throw apiNotFound(
        ApiErrorCode.SPECS_MIKE_FILE_NOT_FOUND,
        `Estimation file ${fileId} was not found.`,
      );
    }
    return this.deleteMikeFile(file.bidId, Number(file.id));
  }

  async activateEstimationFileById(fileId: number) {
    const file = await this.mikeFiles.findOne({ where: { id: fileId } });
    if (!file) {
      throw apiNotFound(
        ApiErrorCode.SPECS_MIKE_FILE_NOT_FOUND,
        `Estimation file ${fileId} was not found.`,
      );
    }
    return this.activateMikeFile(file.bidId, Number(file.id));
  }

  async patchEstimationFileById(
    fileId: number,
    patch: {
      fileName?: string | null;
      jobNumberHint?: string | null;
      projectLabel?: string | null;
      jobId?: number | null;
    },
  ) {
    const file = await this.mikeFiles.findOne({ where: { id: fileId } });
    if (!file) {
      throw apiNotFound(
        ApiErrorCode.SPECS_MIKE_FILE_NOT_FOUND,
        `Estimation file ${fileId} was not found.`,
      );
    }
    return this.patchMikeFile(file.bidId, Number(file.id), patch);
  }

  /**
   * Upload Mike CSV rows into the bid’s **single** takeoff file (append).
   * Display name + job come from the user (meta) — never auto-renamed to COMBINED TAKEOFF.
   */
  async addMikeFile(bidId: number, rows: MikeRowInput[], meta?: MikeUploadMeta) {
    const bid = await this.requireBid(bidId);
    if (!Array.isArray(rows)) {
      throw apiBadRequest(
        ApiErrorCode.SPECS_MIKE_ROWS_INVALID,
        'Mike upload must send a JSON body with a "rows" array.',
      );
    }
    const fileNameRaw = meta?.fileName?.trim();
    if (fileNameRaw != null && fileNameRaw.length > 260) {
      throw apiBadRequest(
        ApiErrorCode.SPECS_MIKE_FILE_NAME_INVALID,
        'fileName must be 260 characters or fewer.',
      );
    }

    const file = await this.dataSource.transaction(async (mgr) => {
      const fileRepo = mgr.getRepository(BidMikeFile);
      const rowRepo = mgr.getRepository(BidMikeCsvRow);

      let takeoff = await this.consolidateToSingleMikeFile(bidId, mgr);

      if (!takeoff) {
        const fileName = fileNameRaw || 'mike.csv';
        takeoff = await fileRepo.save(
          fileRepo.create({
            bidId,
            fileName,
            jobNumberHint: meta?.jobNumberHint?.trim() || null,
            projectLabel: meta?.projectLabel?.trim() || null,
            rowCount: 0,
            isActive: true,
          }),
        );
      } else {
        // Append: only overwrite name/job meta when the user sends them
        if (fileNameRaw) takeoff.fileName = fileNameRaw;
        if (meta?.jobNumberHint?.trim()) {
          takeoff.jobNumberHint = meta.jobNumberHint.trim();
        }
        if (meta?.projectLabel?.trim()) {
          takeoff.projectLabel = meta.projectLabel.trim();
        }
        takeoff.isActive = true;
        await fileRepo.save(takeoff);
      }

      const mikeFileId = Number(takeoff.id);
      if (rows.length > 0) {
        await rowRepo.save(
          this.makeMikeRowEntities(rowRepo, bidId, mikeFileId, rows),
          { chunk: 80 },
        );
      }

      takeoff.rowCount = await rowRepo.count({
        where: { bidId, mikeFileId },
      });
      await fileRepo.save(takeoff);
      return takeoff;
    });

    const jobLink = await this.applyJobFromUpload(bid, meta);

    // Keep Specs in sync with Mike — old lines (wrong Foamglas→Fiberglass, FSK-as-pipe) go stale otherwise.
    let specsRegenerated: { created: number; lineCount: number } | null = null;
    if (rows.length > 0) {
      const gen = await this.autoGenerateFromMike(bidId, true);
      specsRegenerated = { created: gen.created, lineCount: gen.lines.length };
    }

    return {
      bidId,
      imported: rows.length,
      appended: true as const,
      mikeFile: this.mapMikeFile(file),
      jobId: jobLink.jobId,
      trimbleProjectId: jobLink.trimbleProjectId,
      jobLink,
      /** Set when rows were imported — Specs replaced from all Mike on this bid. */
      specsRegenerated,
    };
  }

  /**
   * Rename takeoff / update job hint / set job — without re-uploading rows.
   */
  async patchMikeFile(
    bidId: number,
    fileId: number,
    patch: {
      fileName?: string | null;
      jobNumberHint?: string | null;
      projectLabel?: string | null;
      jobId?: number | null;
    },
  ) {
    const bid = await this.requireBid(bidId);
    const takeoff = await this.consolidateToSingleMikeFile(bidId);
    if (!takeoff || Number(takeoff.id) !== Number(fileId)) {
      throw apiNotFound(
        ApiErrorCode.SPECS_MIKE_FILE_NOT_FOUND,
        `Mike file ${fileId} was not found on this bid.`,
      );
    }

    if (patch.fileName !== undefined) {
      const name = patch.fileName?.trim() || '';
      if (!name) {
        throw apiBadRequest(
          ApiErrorCode.SPECS_MIKE_FILE_NAME_INVALID,
          'fileName is required and cannot be empty.',
        );
      }
      if (name.length > 260) {
        throw apiBadRequest(
          ApiErrorCode.SPECS_MIKE_FILE_NAME_INVALID,
          'fileName must be 260 characters or fewer.',
        );
      }
      takeoff.fileName = name;
    }
    if (patch.jobNumberHint !== undefined) {
      takeoff.jobNumberHint = patch.jobNumberHint?.trim() || null;
    }
    if (patch.projectLabel !== undefined) {
      takeoff.projectLabel = patch.projectLabel?.trim() || null;
    }
    await this.mikeFiles.save(takeoff);

    const jobLink =
      patch.jobId !== undefined ||
      patch.jobNumberHint !== undefined ||
      patch.projectLabel !== undefined
        ? await this.applyJobFromUpload(bid, {
            jobId: patch.jobId,
            jobNumberHint: patch.jobNumberHint ?? takeoff.jobNumberHint,
            projectLabel: patch.projectLabel ?? takeoff.projectLabel,
          })
        : await planJobLinkFromMikeHints(
            this.dataSource,
            {
              jobId: bid.jobId == null ? null : Number(bid.jobId),
              trimbleProjectId:
                bid.trimbleProjectId == null ? null : Number(bid.trimbleProjectId),
            },
            {
              jobNumberHint: takeoff.jobNumberHint,
              projectLabel: takeoff.projectLabel,
            },
          );

    return {
      bidId,
      mikeFile: this.mapMikeFile(takeoff),
      jobId: jobLink.jobId ?? (bid.jobId == null ? null : Number(bid.jobId)),
      trimbleProjectId:
        jobLink.trimbleProjectId ??
        (bid.trimbleProjectId == null ? null : Number(bid.trimbleProjectId)),
      jobLink,
    };
  }

  async deleteMikeFile(bidId: number, fileId: number) {
    await this.requireBid(bidId);
    const file = await this.mikeFiles.findOne({ where: { id: fileId, bidId } });
    if (!file) {
      throw apiNotFound(
        ApiErrorCode.SPECS_MIKE_FILE_NOT_FOUND,
        `Mike file ${fileId} was not found on this bid.`,
      );
    }
    const wasActive = !!file.isActive;

    await this.dataSource.transaction(async (mgr) => {
      await mgr.getRepository(BidMikeCsvRow).delete({ bidId, mikeFileId: Number(fileId) });
      await mgr.getRepository(BidMikeFile).delete({ id: fileId, bidId });
      if (wasActive) {
        const next = await mgr.getRepository(BidMikeFile).findOne({
          where: { bidId },
          order: { createdAt: 'DESC', id: 'DESC' },
        });
        if (next) {
          next.isActive = true;
          await mgr.getRepository(BidMikeFile).save(next);
        }
      }
    });

    return this.listMikeFiles(bidId);
  }

  async activateMikeFile(bidId: number, fileId: number) {
    await this.requireBid(bidId);
    const file = await this.mikeFiles.findOne({ where: { id: fileId, bidId } });
    if (!file) {
      throw apiNotFound(
        ApiErrorCode.SPECS_MIKE_FILE_NOT_FOUND,
        `Mike file ${fileId} was not found on this bid.`,
      );
    }

    await this.dataSource.transaction(async (mgr) => {
      const fileRepo = mgr.getRepository(BidMikeFile);
      await fileRepo
        .createQueryBuilder()
        .update(BidMikeFile)
        .set({ isActive: false })
        .where('bidId = :bidId', { bidId })
        .execute();
      await fileRepo.update({ id: fileId, bidId }, { isActive: true });
    });

    return this.listMikeFiles(bidId);
  }

  /**
   * Mike CSV rows for the bid’s single takeoff (all uploaded CSVs already appended).
   * `fileId` is optional and must match that takeoff if provided.
   */
  async listMikeRows(bidId: number, fileId?: number) {
    await this.requireBid(bidId);
    const takeoff = await this.consolidateToSingleMikeFile(bidId);
    if (fileId != null) {
      if (!takeoff || Number(takeoff.id) !== Number(fileId)) {
        throw apiNotFound(
          ApiErrorCode.SPECS_MIKE_FILE_NOT_FOUND,
          `Mike file ${fileId} was not found on this bid.`,
        );
      }
    }
    return this.loadAllMikeRowsForBid(bidId);
  }

  /**
   * Production list — **one row per bid** with all Mike files already combined in metadata.
   * FE must use this for `/production` list. Do NOT build Production from `/estimation-files`.
   */
  async listProductionReports(opts?: { q?: string; limit?: number }) {
    const limit = Math.min(Math.max(opts?.limit ?? 200, 1), 500);
    const qb = this.mikeFiles
      .createQueryBuilder('f')
      .innerJoin(Bid, 'b', 'b.id = f.bidId')
      .leftJoin(Job, 'j', 'j.id = b.jobId')
      .select('f.bidId', 'bidId')
      .addSelect('b.estimateNumber', 'estimateNumber')
      .addSelect('b.bidName', 'bidName')
      .addSelect('b.status', 'bidStatus')
      .addSelect('b.jobId', 'jobId')
      .addSelect('j.jobNumber', 'jobNumber')
      .addSelect('b.trimbleProjectId', 'trimbleProjectId')
      .addSelect('COUNT(*)', 'fileCount')
      .addSelect('SUM(f.rowCount)', 'totalRows')
      .addSelect('MAX(f.createdAt)', 'latestUploadAt')
      .where('b.isDeleted = 0')
      .groupBy('f.bidId')
      .addGroupBy('b.estimateNumber')
      .addGroupBy('b.bidName')
      .addGroupBy('b.status')
      .addGroupBy('b.jobId')
      .addGroupBy('j.jobNumber')
      .addGroupBy('b.trimbleProjectId')
      .orderBy('MAX(f.createdAt)', 'DESC')
      .take(limit);

    const q = opts?.q?.trim();
    if (q) {
      qb.andWhere(
        `(b.estimateNumber LIKE :q OR b.bidName LIKE :q OR j.jobNumber LIKE :q OR f.fileName LIKE :q OR f.jobNumberHint LIKE :q)`,
        { q: `%${q}%` },
      );
    }

    const raw = await qb.getRawMany<{
      bidId: number;
      estimateNumber: string | null;
      bidName: string | null;
      bidStatus: string | null;
      jobId: number | null;
      jobNumber: string | null;
      trimbleProjectId: string | number | null;
      fileCount: string;
      totalRows: string;
      latestUploadAt: Date;
    }>();

    const bidIds = raw.map((r) => Number(r.bidId));
    const filesByBid = new Map<number, BidMikeFile[]>();
    if (bidIds.length) {
      const files = await this.mikeFiles.find({
        where: { bidId: In(bidIds) },
        order: { id: 'ASC' },
      });
      for (const f of files) {
        const list = filesByBid.get(f.bidId) ?? [];
        list.push(f);
        filesByBid.set(f.bidId, list);
      }
    }

    const specCounts = new Map<number, number>();
    if (bidIds.length) {
      const counts = await this.specLines
        .createQueryBuilder('s')
        .select('s.bidId', 'bidId')
        .addSelect('COUNT(*)', 'n')
        .where('s.bidId IN (:...bidIds)', { bidIds })
        .groupBy('s.bidId')
        .getRawMany<{ bidId: number; n: string }>();
      for (const c of counts) specCounts.set(Number(c.bidId), Number(c.n) || 0);
    }

    return {
      /** Always true — each row is already one bid with all files combined for calcs. */
      mergeMode: 'all_files_per_bid' as const,
      rows: raw.map((r) => {
        const bidId = Number(r.bidId);
        const files = filesByBid.get(bidId) ?? [];
        return {
          bidId,
          estimateNumber: r.estimateNumber,
          bidName: r.bidName,
          bidStatus: r.bidStatus,
          jobId: r.jobId == null ? null : Number(r.jobId),
          jobNumber: r.jobNumber?.trim() || null,
          trimbleProjectId:
            r.trimbleProjectId == null ? null : Number(r.trimbleProjectId),
          fileCount: Number(r.fileCount) || files.length,
          totalRows: Number(r.totalRows) || 0,
          fileIds: files.map((f) => Number(f.id)),
          fileNames: files.map((f) => f.fileName),
          specLineCount: specCounts.get(bidId) ?? 0,
          latestUploadAt: r.latestUploadAt,
          /** Open this — single combined report for the whole bid. */
          productionReportPath: `/bids/${bidId}/production-report`,
        };
      }),
    };
  }

  /**
   * Legacy upload endpoint — same as addMikeFile (append into the one takeoff).
   * Prefer POST /bids/:id/mike-files.
   */
  async replaceMikeRows(bidId: number, rows: MikeRowInput[], meta?: MikeUploadMeta) {
    return this.addMikeFile(bidId, rows, {
      ...meta,
      fileName: meta?.fileName?.trim() || 'mike.csv',
    });
  }

  /**
   * Job at upload/PATCH: explicit `jobId` wins; else Mike hints → Ref_Jobs → Trimble.
   */
  private async applyJobFromUpload(
    bid: Bid,
    meta?: MikeUploadMeta,
  ): Promise<JobLinkResult> {
    if (meta?.jobId != null && Number.isFinite(Number(meta.jobId))) {
      const jobId = Number(meta.jobId);
      const job = await this.jobs.findOne({ where: { id: jobId } });
      if (!job) {
        throw apiBadRequest(
          ApiErrorCode.SPECS_JOB_NOT_FOUND,
          `Job ${jobId} was not found.`,
        );
      }
      const trimbleProjectId = await resolveTrimbleProjectIdForJob(
        this.dataSource,
        jobId,
      );
      bid.jobId = jobId;
      bid.trimbleProjectId = trimbleProjectId;
      bid.updatedAt = new Date();
      await this.bids.save(bid);
      const matchedJobNumber = job.jobNumber?.trim() || null;
      return {
        status: 'auto_linked',
        jobId,
        trimbleProjectId,
        matchedJobNumber,
        message: matchedJobNumber
          ? `Job ${matchedJobNumber} linked from upload — Received will load from Trimble.`
          : `Job #${jobId} linked from upload — Received will load from Trimble.`,
      };
    }

    return this.linkJobFromMikeMeta(bid, meta);
  }

  /**
   * If bid has no jobId, try Mike header hints → Ref_Jobs → Trimble.
   * Persists on success; otherwise returns status so UI can ask user to pick a Job.
   */
  private async linkJobFromMikeMeta(
    bid: Bid,
    meta?: MikeUploadMeta,
  ): Promise<JobLinkResult> {
    const planned = await planJobLinkFromMikeHints(
      this.dataSource,
      {
        jobId: bid.jobId == null ? null : Number(bid.jobId),
        trimbleProjectId: bid.trimbleProjectId == null ? null : Number(bid.trimbleProjectId),
      },
      {
        jobNumberHint: meta?.jobNumberHint,
        projectLabel: meta?.projectLabel,
      },
    );

    if (planned.status === 'auto_linked' && planned.jobId != null) {
      bid.jobId = planned.jobId;
      bid.trimbleProjectId = planned.trimbleProjectId;
      bid.updatedAt = new Date();
      await this.bids.save(bid);
    } else if (
      planned.status === 'already_set' &&
      bid.trimbleProjectId == null &&
      planned.trimbleProjectId != null
    ) {
      bid.trimbleProjectId = planned.trimbleProjectId;
      bid.updatedAt = new Date();
      await this.bids.save(bid);
    }

    return planned;
  }

  private async loadTrimbleLineItems(trimbleProjectId: number | null): Promise<LineItemRow[]> {
    if (trimbleProjectId == null) return [];
    const pid = Number(trimbleProjectId);
    if (!Number.isFinite(pid)) return [];
    const rows: Array<{
      ItemName?: string;
      Received?: string | number;
      Unit?: string | null;
    }> = await this.dataSource.query(
      `SELECT [Item Name] AS ItemName, [Received (Job)] AS Received, Unit
       FROM dbo.Trimble_ProjectLineItems
       WHERE ProjectId = @0`,
      [pid],
    );
    return rows
      .map((r) => ({
        itemName: String(r.ItemName ?? '').trim(),
        received: Number(r.Received) || 0,
        unit: r.Unit != null ? String(r.Unit).trim() || null : null,
      }))
      .filter((r) => r.itemName);
  }

  private mapCatalogRow(r: BidItemCatalog): CatalogItem {
    return {
      itemName: r.itemName,
      price: r.price == null ? null : Number(r.price),
      nameLc: r.nameLc,
      size1: r.size1 == null ? null : Number(r.size1),
      size2: r.size2 == null ? null : Number(r.size2),
    };
  }

  private async loadCatalogForSizes(
    sizes: Array<{ size: number; thickness: number }>,
  ): Promise<CatalogItem[]> {
    if (!sizes.length) return [];
    const unique = new Map<string, { size: number; thickness: number }>();
    for (const s of sizes) unique.set(`${s.size}|${s.thickness}`, s);
    const pairs = [...unique.values()];
    const sizeVals = [...new Set(pairs.map((p) => p.size))];
    const thickVals = [...new Set(pairs.map((p) => p.thickness))];
    // Broad IN then filter exact pairs in memory — avoids huge OR trees / timeouts
    const rows = await this.catalog
      .createQueryBuilder('c')
      .where('c.isActive = 1')
      .andWhere('c.size1 IN (:...sizeVals)', { sizeVals })
      .andWhere('c.size2 IN (:...thickVals)', { thickVals })
      .getMany();
    const want = new Set(pairs.map((p) => `${p.size}|${p.thickness}`));
    return rows
      .filter((r) => {
        const s1 = r.size1 == null ? null : Number(r.size1);
        const s2 = r.size2 == null ? null : Number(r.size2);
        return s1 != null && s2 != null && want.has(`${s1}|${s2}`);
      })
      .map((r) => this.mapCatalogRow(r));
  }

  /** Roll-mode catalog: size1 = insulation thickness; name must look like a roll product. */
  private async loadCatalogForRoll(thicknesses: number[]): Promise<CatalogItem[]> {
    const thickVals = [...new Set(thicknesses.filter((t) => Number.isFinite(t)))];
    if (!thickVals.length) return [];
    const rows = await this.catalog
      .createQueryBuilder('c')
      .where('c.isActive = 1')
      .andWhere('c.size1 IN (:...thickVals)', { thickVals })
      .andWhere(
        `(LOWER(c.nameLc) LIKE '%duct wrap%' OR LOWER(c.nameLc) LIKE '%tank wrap%' OR LOWER(c.nameLc) LIKE '%pipe and tank%')`,
      )
      .getMany();
    return rows.map((r) => this.mapCatalogRow(r));
  }

  async listSpecLines(bidId: number) {
    const bid = await this.requireBid(bidId);
    return this.enrichSpecLinesForBid(bid);
  }

  /**
   * Commodity BOM + Connecteam actual hours → green/red.
   * Est hours: all Mike files on the bid merged + Trimble (Σqty÷Σhours → PPH; recv÷PPH).
   * Actual: Connecteam job-clocked time (2726 ↔ 02726 via normalize).
   */
  async getProductionReport(bidId: number) {
    const bid = await this.requireBid(bidId);
    const [enriched, mikeFiles] = await Promise.all([
      this.enrichSpecLinesForBid(bid),
      this.mikeFiles.find({ where: { bidId }, order: { id: 'ASC' } }),
    ]);
    const lines = buildProductionReportLines(
      enriched.map((l) => ({
        id: l.id,
        type: l.type,
        insulation: l.insulation,
        size: l.size,
        thickness: l.thickness,
        materialBase: l.materialBase,
        catalogMatchMode: l.catalogMatchMode,
        weight: l.weight,
        facing: l.facing,
        qtyEstimated: l.qtyEstimated,
        hoursEstimated: l.hoursEstimated,
        productionPerHour: l.productionPerHour,
        qtyReceived: l.qtyReceived,
        qtyReceivedSf: l.qtyReceivedSf,
        hoursEstimatedFromReceived: l.hoursEstimatedFromReceived,
      })),
    );
    const totalsMike = sumProductionHours(lines);
    const hoursEstimatedFromReceived =
      Math.round(totalsMike.hoursEstimatedFromReceived * 100) / 100;

    const job =
      bid.jobId != null
        ? await this.jobs.findOne({ where: { id: bid.jobId } })
        : null;
    const jobNumber = job?.jobNumber?.trim() || null;
    const normalizedJobNumber = normalizeConnecteamJobNumber(jobNumber);

    let connecteam: {
      linked: boolean;
      refJobId: number | null;
      jobNumber: string | null;
      normalizedJobNumber: string | null;
      /** Σ all workers’ shifts — labor-hours (green/red uses this). */
      actualHours: number | null;
      actualMinutes: number | null;
      shiftCount: number | null;
      /** Distinct people who clocked on this job. */
      workerCount: number | null;
      /**
       * actualHours ÷ workerCount — e.g. 10 people × 24h each →
       * actualHours=240, workerCount=10, averageHoursPerWorker=24.
       */
      averageHoursPerWorker: number | null;
      jobLabel: string | null;
    } = {
      linked: false,
      refJobId: bid.jobId ?? null,
      jobNumber,
      normalizedJobNumber,
      actualHours: null,
      actualMinutes: null,
      shiftCount: null,
      workerCount: null,
      averageHoursPerWorker: null,
      jobLabel: null,
    };

    if (bid.jobId != null || normalizedJobNumber) {
      let rows =
        bid.jobId != null
          ? await this.connecteamReports.hoursByJob({ refJobId: bid.jobId, limit: 50 })
          : [];
      if (!rows.length && normalizedJobNumber) {
        rows = await this.connecteamReports.hoursByJob({
          normalizedJobNumber,
          limit: 50,
        });
      }
      if (rows.length) {
        const enrichedHours = await this.connecteamReports.enrichHoursByJob(rows);
        const actualMinutes = rows.reduce((s, r) => s + (Number(r.totalMinutes) || 0), 0);
        const shiftCount = rows.reduce((s, r) => s + (Number(r.shiftCount) || 0), 0);
        let workerCount = rows.reduce((s, r) => s + (Number(r.workerCount) || 0), 0);
        // Fallback if grouped COUNT(DISTINCT) alias didn't come through
        if (!workerCount && shiftCount > 0) {
          workerCount = await this.connecteamReports.countWorkersForJob(
            bid.jobId != null
              ? { refJobId: bid.jobId }
              : { normalizedJobNumber: normalizedJobNumber ?? undefined },
          );
        }
        const actualHours = Math.round((actualMinutes / 60) * 100) / 100;
        const averageHoursPerWorker =
          workerCount > 0
            ? Math.round((actualHours / workerCount) * 100) / 100
            : null;
        connecteam = {
          linked: true,
          refJobId: bid.jobId ?? rows[0]?.refJobId ?? null,
          jobNumber,
          normalizedJobNumber: rows[0]?.normalizedJobNumber ?? normalizedJobNumber,
          actualHours,
          actualMinutes,
          shiftCount,
          workerCount: workerCount || null,
          averageHoursPerWorker,
          jobLabel: enrichedHours[0]?.jobLabel ?? null,
        };
      }
    }

    const varianceHours =
      connecteam.actualHours != null
        ? Math.round((hoursEstimatedFromReceived - connecteam.actualHours) * 100) / 100
        : null;
    const status = productionStatus(hoursEstimatedFromReceived, connecteam.actualHours);

    return {
      bidId,
      jobId: bid.jobId ?? null,
      jobNumber,
      trimbleProjectId: bid.trimbleProjectId ?? null,
      /** Every uploaded estimation file is merged into Mike qty/hours (not active-only). */
      mikeFilesMerged: {
        count: mikeFiles.length,
        fileIds: mikeFiles.map((f) => Number(f.id)),
        fileNames: mikeFiles.map((f) => f.fileName),
      },
      connecteam,
      lines,
      totals: {
        hoursEstimatedMike: Math.round(totalsMike.hoursEstimated * 100) / 100,
        hoursEstimatedFromReceived,
        actualHours: connecteam.actualHours,
        workerCount: connecteam.workerCount,
        averageHoursPerWorker: connecteam.averageHoursPerWorker,
        /** earned(from received) − actual; positive = under labor */
        varianceHours,
        status,
        actualHoursSource: 'connecteam' as const,
      },
    };
  }

  private async enrichSpecLinesForBid(bid: Bid) {
    const bidId = bid.id;
    const [lines, mike, helperRows, systems, materials, areas] = await Promise.all([
      this.specLines.find({ where: { bidId }, order: { sortOrder: 'ASC', id: 'ASC' } }),
      // Merge every uploaded Mike file on this bid (not only the active one).
      this.loadAllMikeRowsForBid(bidId),
      this.helpers.find({ where: { isActive: true } }),
      this.systems.find({ where: { isActive: true } }),
      this.materials.find({ where: { isActive: true } }),
      this.areas.find({ where: { isActive: true } }),
    ]);

    const helperEntries: HelperMapEntry[] = helperRows.map((h) => ({
      specPhrase: h.specPhrase,
      keyword: h.keyword,
      keyword2: h.keyword2,
      rawPrefix: h.rawPrefix,
      baseName: h.baseName,
    }));
    // Normalize Mike bases once with cheap infer (not full helper resolve × 1500).
    const mikeRollup: MikeRollupRow[] = mike.map((m) => ({
      size: m.size == null ? null : Number(m.size),
      thickness: m.thickness == null ? null : Number(m.thickness),
      quantity: Number(m.quantity) || 0,
      hours: m.hours == null ? null : Number(m.hours),
      materialBase: normalizeMaterialBase(m.materialBase, m.materialPhrase),
      materialPhrase: m.materialPhrase,
      systemName: m.systemName,
      discipline: m.discipline,
    }));

    const sizePairs = lines.map((l) => ({
      size: Number(l.size),
      thickness: Number(l.thickness),
    }));
    // Resolve match mode once per distinct insulation string
    const modeByIns = new Map<string, ReturnType<typeof matchModeForInsulation>>();
    const rollThick: number[] = [];
    for (const l of lines) {
      const key = l.insulation;
      let mode = modeByIns.get(key);
      if (!mode) {
        mode = matchModeForInsulation(key, helperEntries);
        modeByIns.set(key, mode);
      }
      if (mode === 'roll') rollThick.push(Number(l.thickness));
    }
    const [lineItems, pipeCatalog, rollCatalog] = await Promise.all([
      this.loadTrimbleLineItems(bid.trimbleProjectId),
      this.loadCatalogForSizes(sizePairs),
      rollThick.length ? this.loadCatalogForRoll(rollThick) : Promise.resolve([]),
    ]);
    const catalogItems = [...pipeCatalog, ...rollCatalog];

    const sysByName = new Map(systems.map((s) => [s.systemName.toLowerCase(), s]));
    const matByDesc = new Map(materials.map((m) => [m.description.toLowerCase(), m]));
    const areaByName = new Map(areas.map((a) => [a.areaName.toLowerCase(), a]));
    const knownSystems = systems.map((s) => s.systemName);

    const enriched = lines.map((line) => {
      const computed = enrichSpecLine(
        {
          systemName: line.systemName,
          areaName: line.areaName,
          insulation: line.insulation,
          size: Number(line.size),
          thickness: Number(line.thickness),
          weight: line.weight,
          facing: line.facing,
        },
        helperEntries,
        mikeRollup,
        {
          systemCode: (n) => {
            const resolved = resolveSpecSystemName(n, knownSystems);
            return (resolved && sysByName.get(resolved.toLowerCase())?.code) || null;
          },
          systemUnit: (n) => {
            const resolved = resolveSpecSystemName(n, knownSystems);
            return (resolved && sysByName.get(resolved.toLowerCase())?.unit) || null;
          },
          materialCode: (i) => matByDesc.get(i.toLowerCase())?.code ?? null,
          areaCode: (a) => areaByName.get(a.toLowerCase())?.code ?? null,
        },
        lineItems,
        catalogItems,
      );
      return {
        id: line.id,
        bidId: line.bidId,
        sortOrder: line.sortOrder,
        type: line.type,
        systemName: line.systemName,
        areaName: line.areaName,
        insulation: line.insulation,
        size: Number(line.size),
        thickness: Number(line.thickness),
        addJacket: line.addJacket,
        layers: line.layers,
        extraNotes: line.extraNotes,
        trimbleProjectId: bid.trimbleProjectId,
        // weight / facing come from enrich (DB value, else resolved from insulation)
        ...computed,
      };
    });
    // Duct → HVAC → Plumbing (then DB sortOrder within type)
    return enriched.sort((a, b) => {
      const t = compareBySpecType(a, b);
      if (t) return t;
      return (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0);
    });
  }

  async createSpecLine(bidId: number, dto: SpecLineWriteDto) {
    await this.requireBid(bidId);
    this.assertLine(dto);
    const maxSort = await this.specLines
      .createQueryBuilder('l')
      .select('MAX(l.sortOrder)', 'm')
      .where('l.bidId = :bidId', { bidId })
      .getRawOne<{ m: number | null }>();
    const line = await this.specLines.save(
      this.specLines.create({
        bidId,
        sortOrder: dto.sortOrder ?? (Number(maxSort?.m) || 0) + 1,
        type: dto.type ?? null,
        systemName: dto.systemName.trim(),
        areaName: dto.areaName?.trim() || null,
        insulation: dto.insulation.trim(),
        size: dto.size,
        thickness: dto.thickness,
        weight: dto.weight ?? null,
        facing: dto.facing ?? null,
        addJacket: dto.addJacket ?? null,
        layers: dto.layers ?? null,
        extraNotes: dto.extraNotes ?? null,
      }),
    );
    const all = await this.listSpecLines(bidId);
    return all.find((l) => Number(l.id) === Number(line.id));
  }

  async patchSpecLine(bidId: number, lineId: number, dto: Partial<SpecLineWriteDto>) {
    await this.requireBid(bidId);
    const line = await this.specLines.findOne({ where: { id: lineId, bidId } });
    if (!line) {
      throw apiNotFound(
        ApiErrorCode.SPECS_LINE_NOT_FOUND,
        `Spec line ${lineId} was not found on this bid.`,
      );
    }

    if (dto.systemName != null) line.systemName = dto.systemName.trim();
    if (dto.insulation != null) line.insulation = dto.insulation.trim();
    if (dto.areaName !== undefined) line.areaName = dto.areaName?.trim() || null;
    if (dto.type !== undefined) line.type = dto.type;
    if (dto.size != null) line.size = dto.size;
    if (dto.thickness != null) line.thickness = dto.thickness;
    if (dto.weight !== undefined) line.weight = dto.weight;
    if (dto.facing !== undefined) line.facing = dto.facing;
    if (dto.addJacket !== undefined) line.addJacket = dto.addJacket;
    if (dto.layers !== undefined) line.layers = dto.layers;
    if (dto.extraNotes !== undefined) line.extraNotes = dto.extraNotes;
    if (dto.sortOrder != null) line.sortOrder = dto.sortOrder;
    line.updatedAt = new Date();

    this.assertLine({
      systemName: line.systemName,
      insulation: line.insulation,
      size: Number(line.size),
      thickness: Number(line.thickness),
    });
    await this.specLines.save(line);
    const all = await this.listSpecLines(bidId);
    return all.find((l) => Number(l.id) === Number(lineId));
  }

  async deleteSpecLine(bidId: number, lineId: number) {
    await this.requireBid(bidId);
    const res = await this.specLines.delete({ id: lineId, bidId });
    if (!res.affected) {
      throw apiNotFound(
        ApiErrorCode.SPECS_LINE_NOT_FOUND,
        `Spec line ${lineId} was not found on this bid.`,
      );
    }
    return { ok: true };
  }

  /**
   * Replace Spec lines with groups derived from Mike rows (size×thick×base).
   * `replace=true` (default) clears existing lines first.
   */
  async autoGenerateFromMike(bidId: number, replace = true) {
    await this.requireBid(bidId);
    const [mike, helperRows] = await Promise.all([
      this.loadAllMikeRowsForBid(bidId),
      this.helpers.find({ where: { isActive: true } }),
    ]);
    if (!mike.length) {
      throw apiBadRequest(
        ApiErrorCode.SPECS_NO_MIKE_ROWS,
        'Upload at least one estimation file first, then generate Spec lines.',
      );
    }

    const helpers: HelperMapEntry[] = helperRows.map((h) => ({
      specPhrase: h.specPhrase,
      keyword: h.keyword,
      keyword2: h.keyword2,
      rawPrefix: h.rawPrefix,
      baseName: h.baseName,
    }));
    const suggestions = suggestSpecLinesFromMike(
      mike.map((m) => ({
        size: m.size == null ? null : Number(m.size),
        thickness: m.thickness == null ? null : Number(m.thickness),
        quantity: Number(m.quantity) || 0,
        hours: m.hours == null ? null : Number(m.hours),
        materialBase: normalizeMaterialBase(m.materialBase, m.materialPhrase, helpers),
        materialPhrase: m.materialPhrase,
        systemName: m.systemName,
        discipline: m.discipline,
      })),
      helpers,
    );

    if (replace) await this.specLines.delete({ bidId });

    const entities = suggestions.map((s, i) => {
      const resolved = resolveMaterial(s.insulation, helpers);
      const facingRaw =
        s.facing ||
        (resolved.facing && resolved.facing !== 'plain' ? resolved.facing : null);
      return this.specLines.create({
        bidId,
        sortOrder: i + 1,
        type: s.type,
        systemName: s.systemName,
        areaName: 'All',
        insulation: s.insulation,
        size: s.size,
        thickness: s.thickness,
        weight: s.weight ?? resolved.weight,
        facing: normalizeFacingOption(facingRaw),
      });
    });
    // Bulk insert — sequential save was hanging UI for 100+ groups
    await this.specLines.save(entities, { chunk: 80 });

    const lines = await this.listSpecLines(bidId);
    return { bidId, created: suggestions.length, lines };
  }

  private assertLine(dto: { systemName: string; insulation: string; size: number; thickness: number }) {
    if (!dto.systemName?.trim()) {
      throw apiBadRequest(ApiErrorCode.SPECS_LINE_INVALID, 'System is required.');
    }
    if (!dto.insulation?.trim()) {
      throw apiBadRequest(ApiErrorCode.SPECS_LINE_INVALID, 'Insulation is required.');
    }
    if (!Number.isFinite(dto.size)) {
      throw apiBadRequest(ApiErrorCode.SPECS_LINE_INVALID, 'Size is required and must be a number.');
    }
    if (!Number.isFinite(dto.thickness)) {
      throw apiBadRequest(
        ApiErrorCode.SPECS_LINE_INVALID,
        'Thickness is required and must be a number.',
      );
    }
  }
}
