import {
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  Bid,
  BidHelperMap,
  BidItemCatalog,
  BidMikeCsvRow,
  BidSpecArea,
  BidSpecLine,
  BidSpecMaterial,
  BidSpecSystem,
} from '../../database/entities';
import { apiBadRequest, apiNotFound, ApiErrorCode } from '../../common/errors/api-error';
import {
  deriveMaterialBase,
  enrichSpecLine,
  matchModeForInsulation,
  normalizeMaterialBase,
  parseSystemAndType,
  resolveSpecSystemName,
  SPEC_FACING_OPTIONS,
  suggestSpecLinesFromMike,
  type CatalogItem,
  type HelperMapEntry,
  type LineItemRow,
  type MikeRollupRow,
} from './specs-engine';
import { resolveTrimbleProjectIdForJob } from '../resolve-trimble-project';
import { planJobLinkFromMikeHints, type JobLinkResult } from '../resolve-job-from-mike';

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

/** Optional Mike file metadata (row 1) — used to auto-link bid.jobId. */
export type MikeUploadMeta = {
  /** Metadata col B — often JobNumber e.g. "21190" */
  jobNumberHint?: string | null;
  /** Metadata col C — project title, may embed a job # */
  projectLabel?: string | null;
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
export class SpecsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Bid) private readonly bids: Repository<Bid>,
    @InjectRepository(BidSpecSystem) private readonly systems: Repository<BidSpecSystem>,
    @InjectRepository(BidSpecMaterial) private readonly materials: Repository<BidSpecMaterial>,
    @InjectRepository(BidSpecArea) private readonly areas: Repository<BidSpecArea>,
    @InjectRepository(BidHelperMap) private readonly helpers: Repository<BidHelperMap>,
    @InjectRepository(BidMikeCsvRow) private readonly mikeRows: Repository<BidMikeCsvRow>,
    @InjectRepository(BidSpecLine) private readonly specLines: Repository<BidSpecLine>,
    @InjectRepository(BidItemCatalog) private readonly catalog: Repository<BidItemCatalog>,
  ) {}

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

  getSpecSystems() {
    return this.systems.find({ where: { isActive: true }, order: { sortOrder: 'ASC', systemName: 'ASC' } });
  }

  getSpecMaterials() {
    return this.materials.find({ where: { isActive: true }, order: { sortOrder: 'ASC', description: 'ASC' } });
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

  async listMikeRows(bidId: number) {
    await this.requireBid(bidId);
    return this.mikeRows.find({ where: { bidId }, order: { id: 'ASC' } });
  }

  async replaceMikeRows(bidId: number, rows: MikeRowInput[], meta?: MikeUploadMeta) {
    const bid = await this.requireBid(bidId);
    if (!Array.isArray(rows)) {
      throw apiBadRequest(
        ApiErrorCode.SPECS_MIKE_ROWS_INVALID,
        'Mike upload must send a JSON body with a "rows" array.',
      );
    }

    await this.mikeRows.delete({ bidId });

    let imported = 0;
    if (rows.length > 0) {
      const entities = rows.map((r) => {
        const parsed = parseSystemAndType(r.systemAndType);
        const phrase = r.materialPhrase ?? null;
        const base = normalizeMaterialBase(
          r.materialBase?.trim() || deriveMaterialBase(phrase),
          phrase,
        );
        return this.mikeRows.create({
          bidId,
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
      await this.mikeRows.save(entities, { chunk: 80 });
      imported = entities.length;
    }

    const jobLink = await this.linkJobFromMikeMeta(bid, meta);
    return {
      bidId,
      imported,
      jobId: jobLink.jobId,
      trimbleProjectId: jobLink.trimbleProjectId,
      jobLink,
    };
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
    const rows: Array<{ ItemName?: string; Received?: string | number }> = await this.dataSource.query(
      `SELECT [Item Name] AS ItemName, [Received (Job)] AS Received
       FROM dbo.Trimble_ProjectLineItems
       WHERE ProjectId = @0`,
      [pid],
    );
    return rows
      .map((r) => ({
        itemName: String(r.ItemName ?? '').trim(),
        received: Number(r.Received) || 0,
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
    const [lines, mike, helperRows, systems, materials, areas] = await Promise.all([
      this.specLines.find({ where: { bidId }, order: { sortOrder: 'ASC', id: 'ASC' } }),
      this.mikeRows.find({ where: { bidId } }),
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

    return lines.map((line) => {
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
        weight: line.weight,
        facing: line.facing,
        addJacket: line.addJacket,
        layers: line.layers,
        extraNotes: line.extraNotes,
        trimbleProjectId: bid.trimbleProjectId,
        ...computed,
      };
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
      this.mikeRows.find({ where: { bidId } }),
      this.helpers.find({ where: { isActive: true } }),
    ]);
    if (!mike.length) {
      throw apiBadRequest(
        ApiErrorCode.SPECS_NO_MIKE_ROWS,
        'Upload a Mike file first, then generate Spec lines.',
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

    const entities = suggestions.map((s, i) =>
      this.specLines.create({
        bidId,
        sortOrder: i + 1,
        type: s.type,
        systemName: s.systemName,
        areaName: 'All',
        insulation: s.insulation,
        size: s.size,
        thickness: s.thickness,
        weight: s.weight,
      }),
    );
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
