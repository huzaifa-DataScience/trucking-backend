import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Bid,
  BidContent,
  BidCalcSnapshot,
  BidState,
} from '../database/entities';
import { CalculateBidDto, CreateBidDto, PatchBidDto } from './dto/bidding.dto';
import { runBidCalc, BID_CALC_VERSION, BidCalcContext } from './bidding-calc';

/** Soft cap for the client `computed` snapshot (matches frontend handoff §3.1). */
const MAX_COMPUTED_BYTES = 256 * 1024;

const parseJson = <T>(s: string | null | undefined, fallback: T): T => {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
};

/** Defensive: reject NaN/Infinity that slipped past JSON (e.g. via string coercion). */
const assertFiniteNumbers = (value: unknown, label: string): void => {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new BadRequestException(`${label} contains a non-finite number`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v) => assertFiniteNumbers(v, label));
    return;
  }
  if (value && typeof value === 'object') {
    Object.values(value as Record<string, unknown>).forEach((v) =>
      assertFiniteNumbers(v, label),
    );
  }
};

@Injectable()
export class BiddingService {
  constructor(
    @InjectRepository(Bid) private readonly bidRepo: Repository<Bid>,
    @InjectRepository(BidContent) private readonly contentRepo: Repository<BidContent>,
    @InjectRepository(BidCalcSnapshot) private readonly snapshotRepo: Repository<BidCalcSnapshot>,
    @InjectRepository(BidState) private readonly stateRepo: Repository<BidState>,
  ) {}

  async list(params: { status?: string; entityId?: number; search?: string }) {
    const qb = this.bidRepo
      .createQueryBuilder('b')
      .leftJoinAndSelect('b.ourEntity', 'e')
      .where('b.isDeleted = :del', { del: false });

    if (params.status) qb.andWhere('b.status = :status', { status: params.status });
    if (params.entityId != null) qb.andWhere('b.ourEntityId = :eid', { eid: params.entityId });
    if (params.search) {
      qb.andWhere('(b.estimateNumber LIKE :q OR b.bidName LIKE :q)', { q: `%${params.search}%` });
    }
    qb.orderBy('b.updatedAt', 'DESC');

    const rows = await qb.getMany();
    return rows.map((b) => this.toSummary(b));
  }

  async create(dto: CreateBidDto) {
    const bid = this.bidRepo.create({
      ourEntityId: dto.ourEntityId,
      jobId: dto.jobId ?? null,
      estimateNumber: dto.estimateNumber,
      bidName: dto.bidName ?? null,
      bidDate: dto.bidDate ? new Date(dto.bidDate) : null,
      status: 'draft',
    });
    const saved = await this.bidRepo.save(bid);

    const content = this.contentRepo.create({
      bidId: saved.id,
      baseBidJson: dto.baseBid ? JSON.stringify(dto.baseBid) : null,
      systemsJson: dto.systems ? JSON.stringify(dto.systems) : null,
    });
    if (dto.baseBid) assertFiniteNumbers(dto.baseBid, 'baseBid');
    if (dto.systems) assertFiniteNumbers(dto.systems, 'systems');
    await this.contentRepo.save(content);

    if (dto.computed) await this.storeClientSnapshot(saved.id, dto.computed);

    return this.getDetail(saved.id);
  }

  /** Persist a client-calculated snapshot (Excel engine output) as the latest. */
  private async storeClientSnapshot(bidId: number, computed: Record<string, unknown>) {
    assertFiniteNumbers(computed, 'computed');
    const computedJson = JSON.stringify(computed);
    if (Buffer.byteLength(computedJson, 'utf8') > MAX_COMPUTED_BYTES) {
      throw new PayloadTooLargeException(
        `computed exceeds ${MAX_COMPUTED_BYTES} bytes`,
      );
    }
    const engineVersion =
      typeof computed.engineVersion === 'string' && computed.engineVersion.trim()
        ? String(computed.engineVersion).slice(0, 20)
        : BID_CALC_VERSION;

    const snapshot = this.snapshotRepo.create({
      bidId,
      calcVersion: engineVersion,
      source: 'client',
      inputsHash: null,
      computedJson,
    });
    await this.snapshotRepo.save(snapshot);
  }

  async getDetail(id: number) {
    const bid = await this.bidRepo.findOne({ where: { id, isDeleted: false }, relations: ['ourEntity'] });
    if (!bid) throw new NotFoundException(`Bid ${id} not found`);
    const content = await this.contentRepo.findOne({ where: { bidId: id } });
    // Prefer the latest client snapshot so an optional server verify pass never
    // overwrites what the UI displays; fall back to any for legacy rows.
    const snapshot =
      (await this.snapshotRepo.findOne({
        where: { bidId: id, source: 'client' },
        order: { id: 'DESC' },
      })) ??
      (await this.snapshotRepo.findOne({ where: { bidId: id }, order: { id: 'DESC' } }));

    return {
      ...this.toSummary(bid),
      jobId: bid.jobId,
      baseBid: parseJson<Record<string, unknown>>(content?.baseBidJson ?? null, {}),
      systems: parseJson<unknown[]>(content?.systemsJson ?? null, []),
      computed: parseJson<Record<string, unknown>>(snapshot?.computedJson ?? null, {}),
    };
  }

  async patch(id: number, dto: PatchBidDto) {
    const bid = await this.bidRepo.findOne({ where: { id, isDeleted: false } });
    if (!bid) throw new NotFoundException(`Bid ${id} not found`);

    // Content (inputs + computed) is editable only while the bid is a draft.
    // Reopen via a status-only PATCH (`{ "status": "draft" }`) before editing.
    const touchesContent =
      dto.baseBid !== undefined || dto.systems !== undefined || dto.computed !== undefined;
    if (touchesContent && bid.status !== 'draft') {
      throw new ConflictException(
        `Bid ${id} is ${bid.status}; reopen to draft before editing inputs or computed`,
      );
    }

    if (dto.ourEntityId != null) bid.ourEntityId = dto.ourEntityId;
    if (dto.jobId !== undefined) bid.jobId = dto.jobId ?? null;
    if (dto.estimateNumber != null) bid.estimateNumber = dto.estimateNumber;
    if (dto.bidName !== undefined) bid.bidName = dto.bidName ?? null;
    if (dto.bidDate !== undefined) bid.bidDate = dto.bidDate ? new Date(dto.bidDate) : null;
    if (dto.status != null) bid.status = dto.status as Bid['status'];
    bid.updatedAt = new Date();
    await this.bidRepo.save(bid);

    let content = await this.contentRepo.findOne({ where: { bidId: id } });
    if (!content) content = this.contentRepo.create({ bidId: id });

    if (dto.baseBid !== undefined) {
      assertFiniteNumbers(dto.baseBid, 'baseBid');
      const existing = parseJson<Record<string, unknown>>(content.baseBidJson ?? null, {});
      content.baseBidJson = JSON.stringify({ ...existing, ...dto.baseBid });
    }
    if (dto.systems !== undefined) {
      assertFiniteNumbers(dto.systems, 'systems');
      content.systemsJson = JSON.stringify(dto.systems);
    }
    content.updatedAt = new Date();
    await this.contentRepo.save(content);

    // Client is the source of truth: store its snapshot verbatim, never run the
    // server engine here. A PATCH without `computed` leaves the snapshot as-is.
    if (dto.computed !== undefined) {
      await this.storeClientSnapshot(id, dto.computed);
    }

    return this.getDetail(id);
  }

  async remove(id: number) {
    const bid = await this.bidRepo.findOne({ where: { id, isDeleted: false } });
    if (!bid) throw new NotFoundException(`Bid ${id} not found`);
    bid.isDeleted = true;
    bid.updatedAt = new Date();
    await this.bidRepo.save(bid);
    return { ok: true };
  }

  /**
   * Deprecated for the normal client flow (handoff §3.3, Option A). The browser
   * Excel engine owns Base Bid math; this is a no-op that echoes the last stored
   * snapshot. Pass `{ forceServerCalc: true }` to run the legacy server engine as
   * a verification/audit pass (stored as a `source = 'server'` snapshot).
   */
  async calculate(id: number, dto: CalculateBidDto = {}) {
    const bid = await this.bidRepo.findOne({ where: { id, isDeleted: false } });
    if (!bid) throw new NotFoundException(`Bid ${id} not found`);

    if (!dto.forceServerCalc) {
      const latest = await this.snapshotRepo.findOne({
        where: { bidId: id },
        order: { id: 'DESC' },
      });
      return {
        version: latest?.calcVersion ?? BID_CALC_VERSION,
        computed: parseJson<Record<string, unknown>>(latest?.computedJson ?? null, {}),
        errors: [],
        warnings: [
          'Server calculate is deprecated; the client Excel engine is the source of truth. Pass forceServerCalc:true to run a server verification pass.',
        ],
      };
    }

    const content = await this.contentRepo.findOne({ where: { bidId: id } });

    const baseBid = parseJson<Record<string, any>>(content?.baseBidJson ?? null, {});
    const systems = parseJson<any[]>(content?.systemsJson ?? null, []);

    // Resolve state sales tax from Bid_States if not explicitly provided.
    if (baseBid.stateSalesTaxRate == null && baseBid.projectState) {
      const st = await this.stateRepo.findOne({ where: { stateCode: baseBid.projectState } });
      if (st) baseBid.stateSalesTaxRate = Number(st.salesTaxRate);
    }
    if (baseBid.bidDate == null && bid.bidDate) {
      baseBid.bidDate = bid.bidDate instanceof Date ? bid.bidDate.toISOString().slice(0, 10) : bid.bidDate;
    }

    const ctx: BidCalcContext = { baseBid, systems };
    const result = runBidCalc(ctx);

    const snapshot = this.snapshotRepo.create({
      bidId: id,
      calcVersion: BID_CALC_VERSION,
      source: 'server',
      inputsHash: null,
      computedJson: JSON.stringify(result.computed),
    });
    await this.snapshotRepo.save(snapshot);

    return result;
  }

  private toSummary(bid: Bid) {
    return {
      id: String(bid.id),
      estimateNumber: bid.estimateNumber,
      bidName: bid.bidName,
      status: bid.status,
      ourEntityId: bid.ourEntityId,
      companyName: bid.ourEntity?.name ?? null,
      bidDate: bid.bidDate instanceof Date ? bid.bidDate.toISOString().slice(0, 10) : bid.bidDate,
      updatedAt: bid.updatedAt instanceof Date ? bid.updatedAt.toISOString() : bid.updatedAt,
    };
  }
}
