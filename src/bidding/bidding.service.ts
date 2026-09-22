import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import {
  Bid,
  BidContent,
  BidCalcSnapshot,
  BidState,
  Job,
} from '../database/entities';
import { ExcelExportService } from '../common/excel-export.service';
import { ApiErrorCode, apiConflict } from '../common/errors/api-error';
import { CalculateBidDto, CreateBidDto, HandoffBidDto, PatchBidDto, SetOutcomeDto } from './dto/bidding.dto';
import { runBidCalc, BID_CALC_VERSION, BidCalcContext } from './bidding-calc';
import { BiddingAttachmentsService } from './bidding-attachments.service';
import { BiddingCommentsService } from './bidding-comments.service';
import { BiddingActivityService } from './bidding-activity.service';
import { BiddingAssignmentNotificationsService } from './bidding-assignment-notifications.service';
import { BiddingLookupsService } from './bidding-lookups.service';
import { SpecsService } from './specs/specs.service';
import { resolveTrimbleProjectIdForJob } from './resolve-trimble-project';
import { ConnecteamChatService } from '../connecteam/connecteam-chat.service';
import { bindAssignmentCrew, resolveEstimatesTeamId } from './process/bid-crew';
import {
  BID_LIST_EXCEL_COLUMNS,
  bidListExcelRow,
  canEditBid,
  dashboardNotifications,
  fillPlateGroups,
  isNewBid,
  plateForRole,
  type BidEditor,
} from './process/bid-plate';
import {
  BidProcessError,
  absorbIntake,
  applyHandoff,
  applyOutcome,
  emptyProcess,
  mergeProcess,
  normalizeProjectNumber,
  parseProcess,
  workflowChrome,
  type BidProcess,
  type HandoffAction,
  type HandoffCtx,
  type OutcomeStatus,
} from './process/bid-process';

/** Soft cap for the client `computed` snapshot (matches frontend handoff §3.1). */
const MAX_COMPUTED_BYTES = 256 * 1024;
const COMPANY_INFO_STRING_MAX = 500;

const parseCompanyInfo = (s: string | null | undefined): Record<string, unknown> =>
  parseJson<Record<string, unknown>>(s ?? null, {});

const clientCompanyNameFrom = (companyInfo: Record<string, unknown>): string | null => {
  const name = companyInfo.companyName;
  if (typeof name !== 'string') return null;
  const trimmed = name.trim();
  return trimmed || null;
};

const assertCompanyInfo = (value: Record<string, unknown>): void => {
  assertFiniteNumbers(value, 'companyInfo');
  for (const [key, val] of Object.entries(value)) {
    if (typeof val === 'string' && val.length > COMPANY_INFO_STRING_MAX) {
      throw new BadRequestException(
        `companyInfo.${key} exceeds ${COMPANY_INFO_STRING_MAX} characters`,
      );
    }
  }
};

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

type BidListQuery = {
  status?: string;
  entityId?: number;
  search?: string;
  processStage?: string;
  workType?: string;
  outcome?: string;
  ownerProjectNumber?: string;
  mechanicalEngineerProjectNumber?: string;
  teamId?: number | 'all';
  bidDateFrom?: string;
  bidDateTo?: string;
  submitDateFrom?: string;
  submitDateTo?: string;
  clientCompanyName?: string;
  editor?: BidEditor;
};

@Injectable()
export class BiddingService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Bid) private readonly bidRepo: Repository<Bid>,
    @InjectRepository(BidContent) private readonly contentRepo: Repository<BidContent>,
    @InjectRepository(BidCalcSnapshot) private readonly snapshotRepo: Repository<BidCalcSnapshot>,
    @InjectRepository(BidState) private readonly stateRepo: Repository<BidState>,
    @InjectRepository(Job) private readonly jobRepo: Repository<Job>,
    private readonly attachments: BiddingAttachmentsService,
    @Inject(forwardRef(() => BiddingCommentsService))
    private readonly comments: BiddingCommentsService,
    private readonly activity: BiddingActivityService,
    private readonly assignmentNotifications: BiddingAssignmentNotificationsService,
    private readonly specs: SpecsService,
    private readonly lookups: BiddingLookupsService,
    private readonly chat: ConnecteamChatService,
    private readonly excelExport: ExcelExportService,
  ) {}

  /** Auto-fill Trimble project from bid.job → JobNumber match (unless client set trimble explicitly). */
  private async applyTrimbleFromJob(
    bid: Bid,
    opts: { jobId?: number | null; trimbleExplicit?: boolean },
  ): Promise<void> {
    if (opts.trimbleExplicit) return;
    const jobId = opts.jobId !== undefined ? opts.jobId : bid.jobId;
    if (jobId == null) return;
    const resolved = await resolveTrimbleProjectIdForJob(this.dataSource, jobId);
    if (resolved != null) bid.trimbleProjectId = resolved;
  }

  async list(params: BidListQuery) {
    const qb = this.bidRepo
      .createQueryBuilder('b')
      .leftJoinAndSelect('b.ourEntity', 'e')
      .where('b.isDeleted = :del', { del: false });

    if (params.status) qb.andWhere('b.status = :status', { status: params.status });
    if (params.entityId != null) qb.andWhere('b.ourEntityId = :eid', { eid: params.entityId });
    if (params.processStage) qb.andWhere('b.processStage = :ps', { ps: params.processStage });
    if (params.workType) qb.andWhere('b.workType = :wt', { wt: params.workType });
    if (params.outcome) qb.andWhere('b.outcomeStatus = :oc', { oc: params.outcome });
    // Intake bids may not have a bid date yet. For list date filters, use the
    // last update as their effective date so recent captain work is discoverable.
    if (params.bidDateFrom) {
      qb.andWhere(
        '(b.bidDate >= :bdf OR (b.bidDate IS NULL AND b.updatedAt >= :bdf))',
        { bdf: params.bidDateFrom },
      );
    }
    if (params.bidDateTo) {
      qb.andWhere(
        '(b.bidDate <= :bdt OR (b.bidDate IS NULL AND b.updatedAt < DATEADD(day, 1, :bdt)))',
        { bdt: params.bidDateTo },
      );
    }
    if (params.submitDateFrom) qb.andWhere('b.submitDate >= :sdf', { sdf: params.submitDateFrom });
    if (params.submitDateTo) qb.andWhere('b.submitDate <= :sdt', { sdt: params.submitDateTo });
    const opn = normalizeProjectNumber(params.ownerProjectNumber);
    const mepn = normalizeProjectNumber(params.mechanicalEngineerProjectNumber);
    const teamId = resolveEstimatesTeamId({
      queryTeamId: params.teamId,
      role: params.editor?.role,
      userTeamId: params.editor?.bidTeamId ?? null,
    });
    const needProcess = !!(params.search || opn || mepn || teamId != null || params.clientCompanyName);
    if (needProcess) qb.leftJoin(BidContent, 'cnt', 'cnt.bidId = b.id');
    if (params.search) {
      const q = params.search.replace(/#/g, '').trim();
      qb.andWhere(
        `(b.estimateNumber LIKE :q OR b.bidName LIKE :q
          OR JSON_VALUE(cnt.CompanyInfoJson, '$.companyName') LIKE :q
          OR JSON_VALUE(cnt.ProcessJson, '$.drawingName') LIKE :q
          OR REPLACE(REPLACE(ISNULL(JSON_VALUE(cnt.ProcessJson, '$.ownerProjectNumber'), ''), '#', ''), ' ', '') LIKE :q
          OR REPLACE(REPLACE(ISNULL(JSON_VALUE(cnt.ProcessJson, '$.mechanicalEngineerProjectNumber'), ''), '#', ''), ' ', '') LIKE :q)`,
        { q: `%${q}%` },
      );
    }
    if (opn) {
      qb.andWhere(
        `REPLACE(REPLACE(ISNULL(JSON_VALUE(cnt.ProcessJson, '$.ownerProjectNumber'), ''), '#', ''), ' ', '') = :opn`,
        { opn },
      );
    }
    if (mepn) {
      qb.andWhere(
        `REPLACE(REPLACE(ISNULL(JSON_VALUE(cnt.ProcessJson, '$.mechanicalEngineerProjectNumber'), ''), '#', ''), ' ', '') = :mepn`,
        { mepn },
      );
    }
    if (teamId != null) {
      qb.andWhere(
        `TRY_CONVERT(int, JSON_VALUE(cnt.ProcessJson, '$.assignment.teamId')) = :teamId`,
        { teamId },
      );
    }
    if (params.clientCompanyName) {
      qb.andWhere(`JSON_VALUE(cnt.CompanyInfoJson, '$.companyName') = :ccn`, {
        ccn: params.clientCompanyName,
      });
    }
    qb.orderBy('b.updatedAt', 'DESC');

    const rows = await qb.getMany();
    const contents =
      rows.length > 0
        ? await this.contentRepo.find({ where: { bidId: In(rows.map((r) => r.id)) } })
        : [];
    const contentByBid = new Map(contents.map((c) => [c.bidId, c]));
    return rows.map((b) => this.toSummary(b, contentByBid.get(b.id), params.editor));
  }

  /** Same rows/filters as `list()`. Captain / AE inherit their team filter. */
  async exportList(params: BidListQuery): Promise<Buffer> {
    const rows = await this.list(params);
    const teams = await this.lookups.getTeams();
    const teamName = new Map(teams.map((t) => [t.id, t.teamName]));
    return this.excelExport.exportSheet(
      BID_LIST_EXCEL_COLUMNS,
      rows.map((r) => bidListExcelRow(r, r.teamId != null ? teamName.get(r.teamId) ?? null : null)),
      'Bids',
    );
  }

  /** Role home: due / upcoming / assigned for this login + chat unread. Full list stays on GET /bids. */
  async myPlate(user: BidEditor) {
    const plate = plateForRole(user.role);
    const rows = await this.list({ editor: user });
    const groups = fillPlateGroups(user.role, rows, { bidTeamId: user.bidTeamId ?? null });
    const messages =
      user.id != null
        ? await this.chat.inboxPreview(user.id)
        : { totalUnread: 0, items: [] };
    const mentions =
      user.id != null ? await this.comments.unreadMentions(user.id) : [];
    const notifications = [
      ...mentions.map((m) => ({
        kind: 'comment_mention' as const,
        title: m.title,
        body: m.body,
        bidId: String(m.bidId),
        commentId: m.commentId,
        at: m.at,
      })),
      ...dashboardNotifications(groups, messages.items),
    ].slice(0, 15);
    return {
      role: plate.role,
      plateId: plate.plateId,
      title: plate.title,
      hint: plate.hint,
      teamId: user.bidTeamId ?? null,
      counts: {
        due: groups.find((g) => g.id === 'due')?.rows.length ?? 0,
        upcoming: groups.find((g) => g.id === 'upcoming')?.rows.length ?? 0,
        assigned: groups.find((g) => g.id === 'assigned')?.rows.length ?? 0,
        unreadMessages: messages.totalUnread,
        notifications: notifications.length,
      },
      groups,
      messages,
      notifications,
    };
  }

  async assertUserCanEdit(bidId: number, editor?: BidEditor) {
    if (!editor?.role) return;
    const bid = await this.bidRepo.findOne({ where: { id: bidId, isDeleted: false } });
    if (!bid) throw new NotFoundException(`Bid ${bidId} not found`);
    const content = await this.contentRepo.findOne({ where: { bidId } });
    if (!canEditBid(editor, this.teamIdFromContent(content))) {
      throw new ForbiddenException('Only the assigned team can edit this bid');
    }
  }

  private teamIdFromContent(content?: BidContent | null): number | null {
    return parseProcess(parseJson(content?.processJson ?? null, null)).assignment.teamId;
  }

  async getCompanyInfoPrefillFromJob(jobId: number): Promise<Record<string, unknown>> {
    const job = await this.jobRepo.findOne({ where: { id: jobId, isActive: true } });
    if (!job) throw new NotFoundException(`Job ${jobId} not found`);
    return {
      companyName: job.name?.trim() || null,
      address: job.jobAddress?.trim() || null,
      city: job.city?.trim() || null,
      state: null,
      zip: null,
      contactName: null,
      contactEmail: null,
      contactPhone: null,
      notes: job.jobNumber ? `Job # ${job.jobNumber}` : null,
    };
  }

  async create(
    dto: CreateBidDto,
    userId?: number,
    creator?: { role?: string; bidTeamId?: number | null },
  ) {
    const process = dto.process
      ? this.mergeProcessSafe(emptyProcess(), dto.process)
      : null;
    // Captains creating their own bid should see it in their team-scoped list right
    // away, instead of it sitting unassigned until someone runs Assignment.
    if (
      process &&
      creator?.role === 'captain' &&
      userId != null &&
      process.assignment.captainUserId == null &&
      process.assignment.teamId == null
    ) {
      process.assignment.captainUserId = userId;
    }
    if (process) await this.applyAssignmentCrew(process);
    if (process) await this.specs.applySpecSheetCodes(process);
    await this.assertUniqueOpportunity({
      estimateNumber: dto.estimateNumber,
      bidName: process?.drawingName || dto.bidName,
      ownerProjectNumber: process?.ownerProjectNumber,
      mechanicalEngineerProjectNumber: process?.mechanicalEngineerProjectNumber,
    });
    const bid = this.bidRepo.create({
      ourEntityId: dto.ourEntityId,
      jobId: dto.jobId ?? null,
      trimbleProjectId: dto.trimbleProjectId ?? null,
      estimateNumber: dto.estimateNumber,
      bidName: process?.drawingName || dto.bidName?.trim() || null,
      bidDate: dto.bidDate ? new Date(dto.bidDate) : null,
      submitDate: dto.submitDate ? new Date(dto.submitDate) : null,
      timeEstimate: dto.timeEstimate ?? null,
      status: 'draft',
      processStage: process?.stage ?? 'intake',
      outcomeStatus: process?.outcome ?? 'open',
      workType: process?.workType ?? null,
      createdByUserId: userId ?? null,
      updatedByUserId: userId ?? null,
    });
    await this.applyTrimbleFromJob(bid, {
      jobId: dto.jobId ?? null,
      trimbleExplicit: dto.trimbleProjectId != null,
    });
    const saved = await this.bidRepo.save(bid);

    const content = this.contentRepo.create({
      bidId: saved.id,
      baseBidJson: dto.baseBid ? JSON.stringify(dto.baseBid) : null,
      systemsJson: dto.systems ? JSON.stringify(dto.systems) : null,
      companyInfoJson: dto.companyInfo
        ? JSON.stringify(dto.companyInfo)
        : dto.jobId
          ? JSON.stringify(await this.getCompanyInfoPrefillFromJob(dto.jobId))
          : null,
      processJson: process ? JSON.stringify(process) : null,
      inputsSchemaVer: process ? 2 : 1,
    });
    if (dto.baseBid) assertFiniteNumbers(dto.baseBid, 'baseBid');
    if (dto.companyInfo) assertCompanyInfo(dto.companyInfo);
    if (dto.systems) assertFiniteNumbers(dto.systems, 'systems');
    await this.contentRepo.save(content);

    if (process) await this.lookups.upsertFromProcess(process);

    if (dto.computed) await this.storeClientSnapshot(saved.id, dto.computed);

    await this.activity.recordCreated(saved.id, userId, dto.estimateNumber);

    if (process) {
      void this.assignmentNotifications.notify(
        saved.id,
        this.bidEmailLabel(saved.estimateNumber, saved.bidName),
        emptyProcess(),
        process,
      );
    }

    return this.getDetail(saved.id, undefined, { skipSpecCodes: true });
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

  async getDetail(id: number, editor?: BidEditor, opts?: { skipSpecCodes?: boolean }) {
    const [bid, content, clientSnap, anySnap, attachments, activitySummary] = await Promise.all([
      this.bidRepo.findOne({ where: { id, isDeleted: false }, relations: ['ourEntity'] }),
      this.contentRepo.findOne({ where: { bidId: id } }),
      this.snapshotRepo.findOne({ where: { bidId: id, source: 'client' }, order: { id: 'DESC' } }),
      this.snapshotRepo.findOne({ where: { bidId: id }, order: { id: 'DESC' } }),
      this.attachments.listForBid(id, { skipExistCheck: true }),
      this.activity.getSummary(id),
    ]);
    if (!bid) throw new NotFoundException(`Bid ${id} not found`);
    const snapshot = clientSnap ?? anySnap;

    const process = parseProcess(parseJson(content?.processJson ?? null, null));
    if (!opts?.skipSpecCodes) await this.specs.applySpecSheetCodes(process);
    return {
      ...this.toSummary(bid, content, editor),
      jobId: bid.jobId,
      trimbleProjectId: bid.trimbleProjectId == null ? null : Number(bid.trimbleProjectId),
      baseBid: parseJson<Record<string, unknown>>(content?.baseBidJson ?? null, {}),
      systems: parseJson<unknown[]>(content?.systemsJson ?? null, []),
      companyInfo: parseCompanyInfo(content?.companyInfoJson ?? null),
      process,
      workflow: workflowChrome(process, { hasDrawings: this.hasDrawingsLabel(attachments) }),
      computed: parseJson<Record<string, unknown>>(snapshot?.computedJson ?? null, {}),
      attachments,
      activitySummary,
    };
  }

  async getActivity(id: number) {
    return this.activity.listForBid(id);
  }

  async patch(id: number, dto: PatchBidDto, userId?: number) {
    const bid = await this.bidRepo.findOne({ where: { id, isDeleted: false } });
    if (!bid) throw new NotFoundException(`Bid ${id} not found`);

    const beforeBid = { ...bid };

    // Content (inputs + computed) is editable only while the bid is a draft.
    // Reopen via a status-only PATCH (`{ "status": "draft" }`) before editing.
    const touchesContent =
      dto.baseBid !== undefined ||
      dto.systems !== undefined ||
      dto.computed !== undefined ||
      dto.companyInfo !== undefined;
    if (touchesContent && bid.status !== 'draft') {
      throw new ConflictException(
        `Bid ${id} is ${bid.status}; reopen to draft before editing inputs, company info, or computed`,
      );
    }
    if (dto.process !== undefined && bid.status === 'archived') {
      throw new ConflictException(`Bid ${id} is archived; cannot edit process`);
    }

    if (dto.ourEntityId != null) bid.ourEntityId = dto.ourEntityId;
    if (dto.jobId !== undefined) bid.jobId = dto.jobId ?? null;
    if (dto.trimbleProjectId !== undefined) bid.trimbleProjectId = dto.trimbleProjectId ?? null;
    if (dto.estimateNumber != null) bid.estimateNumber = dto.estimateNumber;

    // Only when they actually change the job — not on every calc save.
    if (dto.jobId !== undefined && dto.trimbleProjectId === undefined) {
      await this.applyTrimbleFromJob(bid, { jobId: bid.jobId, trimbleExplicit: false });
    }
    let content = await this.contentRepo.findOne({ where: { bidId: id } });
    const contentBefore = content ? { ...content } : null;
    if (!content) content = this.contentRepo.create({ bidId: id });
    const existingProcess = parseProcess(parseJson(content.processJson ?? null, null));
    const processNow =
      dto.process !== undefined
        ? this.mergeProcessSafe(existingProcess, dto.process)
        : existingProcess;
    if (dto.process?.assignment !== undefined) await this.applyAssignmentCrew(processNow);
    const prevBidName = bid.bidName;
    const prevEstimate = bid.estimateNumber;
    if (processNow.drawingName) bid.bidName = processNow.drawingName;
    else if (dto.bidName !== undefined) bid.bidName = dto.bidName ?? null;
    const nextEstimate = dto.estimateNumber ?? bid.estimateNumber;
    // Spec-sheet saves send process without changing bid # / name / title-block #s.
    // Skip the JSON_VALUE scans on every Bid_Content row.
    if (
      (nextEstimate ?? '').trim().toLowerCase() !== (prevEstimate ?? '').trim().toLowerCase() ||
      (bid.bidName ?? '').trim().toLowerCase() !== (prevBidName ?? '').trim().toLowerCase() ||
      normalizeProjectNumber(processNow.ownerProjectNumber) !==
        normalizeProjectNumber(existingProcess.ownerProjectNumber) ||
      normalizeProjectNumber(processNow.mechanicalEngineerProjectNumber) !==
        normalizeProjectNumber(existingProcess.mechanicalEngineerProjectNumber)
    ) {
      await this.assertUniqueOpportunity({
        excludeId: id,
        estimateNumber: nextEstimate,
        bidName: bid.bidName,
        ownerProjectNumber: processNow.ownerProjectNumber,
        mechanicalEngineerProjectNumber: processNow.mechanicalEngineerProjectNumber,
      });
    }
    if (dto.bidDate !== undefined) bid.bidDate = dto.bidDate ? new Date(dto.bidDate) : null;
    if (dto.submitDate !== undefined) bid.submitDate = dto.submitDate ? new Date(dto.submitDate) : null;
    if (dto.timeEstimate !== undefined) {
      if (dto.timeEstimate != null && !Number.isFinite(dto.timeEstimate)) {
        throw new BadRequestException('timeEstimate must be a finite number');
      }
      bid.timeEstimate = dto.timeEstimate ?? null;
    }
    const wasDraft = bid.status === 'draft';
    if (dto.status != null) bid.status = dto.status as Bid['status'];
    if (dto.status === 'submitted' && wasDraft && bid.submitDate == null && dto.submitDate === undefined) {
      bid.submitDate = new Date();
    }
    bid.updatedAt = new Date();
    bid.updatedByUserId = userId ?? null;

    if (dto.baseBid !== undefined) {
      assertFiniteNumbers(dto.baseBid, 'baseBid');
      const existing = parseJson<Record<string, unknown>>(content.baseBidJson ?? null, {});
      content.baseBidJson = JSON.stringify({ ...existing, ...dto.baseBid });
    }
    if (dto.systems !== undefined) {
      assertFiniteNumbers(dto.systems, 'systems');
      content.systemsJson = JSON.stringify(dto.systems);
    }
    if (dto.companyInfo !== undefined) {
      assertCompanyInfo(dto.companyInfo);
      const existing = parseCompanyInfo(content.companyInfoJson ?? null);
      content.companyInfoJson = JSON.stringify({ ...existing, ...dto.companyInfo });
    }
    if (dto.process !== undefined) {
      if (dto.process.specSheets !== undefined) await this.specs.applySpecSheetCodes(processNow);
      content.processJson = JSON.stringify(processNow);
      content.inputsSchemaVer = Math.max(Number(content.inputsSchemaVer) || 1, 2);
      bid.processStage = processNow.stage;
      bid.outcomeStatus = processNow.outcome;
      bid.workType = processNow.workType;
    }
    content.updatedAt = new Date();
    await this.bidRepo.save(bid);
    await this.contentRepo.save(content);

    if (dto.process !== undefined) await this.lookups.upsertFromProcess(processNow);

    // Client is the source of truth: store its snapshot verbatim, never run the
    // server engine here. A PATCH without `computed` leaves the snapshot as-is.
    if (dto.computed !== undefined) {
      await this.storeClientSnapshot(id, dto.computed);
    }

    await this.activity.recordPatch(
      id,
      userId,
      beforeBid,
      bid,
      dto,
      contentBefore,
      content,
    );

    if (dto.process !== undefined) {
      void this.assignmentNotifications.notify(
        id,
        this.bidEmailLabel(bid.estimateNumber, bid.bidName),
        existingProcess,
        processNow,
      );
    }

    return this.getDetail(id, undefined, { skipSpecCodes: true });
  }

  async handoff(id: number, dto: HandoffBidDto, userId?: number) {
    const { bid, content } = await this.loadProcessRow(id);
    if (bid.status === 'archived') {
      throw new ConflictException(`Bid ${id} is archived; cannot hand off`);
    }
    const current = parseProcess(parseJson(content.processJson ?? null, null));
    const attachments = await this.attachments.listForBid(id);
    const next = this.handoffSafe(current, dto.action, dto.notes, {
      hasDrawings: this.hasDrawingsLabel(attachments),
    });
    return this.persistProcess(bid, content, next, userId, async () => {
      await this.activity.recordHandoff(id, userId, dto.action, current.stage, next.stage, next.outcome);
    });
  }

  async setOutcome(id: number, dto: SetOutcomeDto, userId?: number) {
    const { bid, content } = await this.loadProcessRow(id);
    if (bid.status === 'archived') {
      throw new ConflictException(`Bid ${id} is archived; cannot set outcome`);
    }
    const current = parseProcess(parseJson(content.processJson ?? null, null));
    let next: BidProcess;
    try {
      next = applyOutcome(current, dto.outcome as OutcomeStatus);
    } catch (e) {
      if (e instanceof BidProcessError) throw new BadRequestException(e.message);
      throw e;
    }
    return this.persistProcess(bid, content, next, userId, async () => {
      await this.activity.recordOutcome(id, userId, current.outcome, next.outcome);
    });
  }

  private async loadProcessRow(id: number) {
    const bid = await this.bidRepo.findOne({ where: { id, isDeleted: false } });
    if (!bid) throw new NotFoundException(`Bid ${id} not found`);
    let content = await this.contentRepo.findOne({ where: { bidId: id } });
    if (!content) content = this.contentRepo.create({ bidId: id });
    return { bid, content };
  }

  private async persistProcess(
    bid: Bid,
    content: BidContent,
    next: BidProcess,
    userId: number | undefined,
    afterSave: () => Promise<void>,
  ) {
    await this.specs.applySpecSheetCodes(next);
    content.processJson = JSON.stringify(next);
    content.inputsSchemaVer = Math.max(Number(content.inputsSchemaVer) || 1, 2);
    content.updatedAt = new Date();
    bid.processStage = next.stage;
    bid.outcomeStatus = next.outcome;
    bid.workType = next.workType;
    bid.updatedAt = new Date();
    bid.updatedByUserId = userId ?? null;
    await this.bidRepo.save(bid);
    await this.contentRepo.save(content);
    await this.lookups.upsertFromProcess(next);
    await afterSave();
    return this.getDetail(bid.id, undefined, { skipSpecCodes: true });
  }

  private handoffSafe(current: BidProcess, action: HandoffAction, notes?: string, ctx?: HandoffCtx) {
    try {
      return applyHandoff(current, action, notes, ctx);
    } catch (e) {
      if (e instanceof BidProcessError) throw new ConflictException(e.message);
      throw e;
    }
  }

  private hasDrawingsLabel(attachments: Array<{ label: string | null }>): boolean {
    return attachments.some((a) => a.label === 'drawings');
  }

  async linkDuplicate(id: number, keepBidId: number, notes: string | undefined, userId?: number) {
    if (id === keepBidId) throw new BadRequestException('Cannot link a bid to itself');
    const closed = await this.loadProcessRow(id);
    const keep = await this.loadProcessRow(keepBidId);
    if (closed.bid.status === 'archived') {
      throw new ConflictException(`Bid ${id} is already closed`);
    }
    const from = parseProcess(parseJson(closed.content.processJson ?? null, null));
    const keepProc = parseProcess(parseJson(keep.content.processJson ?? null, null));
    const absorbed = absorbIntake(keepProc, from);
    if (absorbed.drawingName) keep.bid.bidName = absorbed.drawingName;
    const closedNext = applyOutcome(
      mergeProcess(from, {
        relatedBidId: keepBidId,
        relatedBidNote: notes || `Duplicate of ${keep.bid.estimateNumber}`,
      }),
      'cancelled',
    );
    closed.bid.status = 'archived';
    await this.persistProcess(keep.bid, keep.content, absorbed, userId, async () => {
      await this.activity.recordLinkDuplicate(keepBidId, id, userId, 'keep');
    });
    await this.persistProcess(closed.bid, closed.content, closedNext, userId, async () => {
      await this.activity.recordLinkDuplicate(id, keepBidId, userId, 'closed');
    });
    return { keep: await this.getDetail(keepBidId), closed: await this.getDetail(id) };
  }

  async remove(id: number, userId?: number) {
    const bid = await this.bidRepo.findOne({ where: { id, isDeleted: false } });
    if (!bid) throw new NotFoundException(`Bid ${id} not found`);
    bid.isDeleted = true;
    bid.updatedAt = new Date();
    bid.updatedByUserId = userId ?? null;
    await this.bidRepo.save(bid);
    await this.activity.recordDeleted(id, userId);
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

  private toSummary(bid: Bid, content?: BidContent | null, editor?: BidEditor) {
    const companyInfo = parseCompanyInfo(content?.companyInfoJson ?? null);
    const process = parseProcess(parseJson(content?.processJson ?? null, null));
    const createdAt = bid.createdAt instanceof Date ? bid.createdAt.toISOString() : bid.createdAt;
    const updatedAt = bid.updatedAt instanceof Date ? bid.updatedAt.toISOString() : bid.updatedAt;
    const teamId = process.assignment.teamId;
    return {
      id: String(bid.id),
      estimateNumber: bid.estimateNumber,
      bidName: bid.bidName,
      status: bid.status,
      ourEntityId: bid.ourEntityId,
      companyName: bid.ourEntity?.name ?? null,
      clientCompanyName: clientCompanyNameFrom(companyInfo),
      trimbleProjectId: bid.trimbleProjectId == null ? null : Number(bid.trimbleProjectId),
      bidDate: bid.bidDate instanceof Date ? bid.bidDate.toISOString().slice(0, 10) : bid.bidDate,
      submitDate:
        bid.submitDate instanceof Date ? bid.submitDate.toISOString().slice(0, 10) : bid.submitDate,
      timeEstimate: bid.timeEstimate != null ? Number(bid.timeEstimate) : null,
      processStage: bid.processStage ?? 'intake',
      outcomeStatus: bid.outcomeStatus ?? 'open',
      workType: bid.workType ?? null,
      drawingName: process.drawingName,
      ownerProjectNumber: process.ownerProjectNumber,
      mechanicalEngineerProjectNumber: process.mechanicalEngineerProjectNumber,
      relatedBidId: process.relatedBidId,
      bidKind: process.bidKind,
      dueDate: process.dueDate,
      dueTime: process.dueTime,
      takeoffAssigned: process.takeoffAssignments.length,
      takeoffReceived: process.takeoffAssignments.filter(
        (a) => (a.versions?.length ?? 0) > 0 || a.finalQuantity != null,
      ).length,
      teamId,
      jobStartDate: process.schedule.expectedStart,
      jobEndDate: process.schedule.expectedCompletion,
      contractAmount: process.award.finalContractAmount,
      grossSqFootage: process.additionalDetails.grossSqFootage,
      cashExpense: process.additionalDetails.cashExpense,
      createdAt,
      updatedAt,
      isNew: isNewBid(updatedAt, createdAt),
      canEdit: editor ? canEditBid(editor, teamId) : true,
    };
  }

  private mergeProcessSafe(existing: BidProcess, patch: Record<string, unknown>): BidProcess {
    try {
      return mergeProcess(existing, patch);
    } catch (e) {
      if (e instanceof BidProcessError) throw new BadRequestException(e.message);
      throw e;
    }
  }

  private bidEmailLabel(estimateNumber: string, bidName: string | null): string {
    return bidName ? `${estimateNumber} — ${bidName}` : estimateNumber;
  }

  private async applyAssignmentCrew(process: BidProcess): Promise<void> {
    const [captains, teams] = await Promise.all([
      this.lookups.getCaptains(),
      this.lookups.getTeams(),
    ]);
    process.assignment = bindAssignmentCrew(process.assignment, captains, teams);
  }

  /** Same estimate #, name, or title-block # → one opportunity. Case-insensitive. */
  private async assertUniqueOpportunity(opts: {
    excludeId?: number;
    estimateNumber?: string | null;
    bidName?: string | null;
    ownerProjectNumber?: string | null;
    mechanicalEngineerProjectNumber?: string | null;
  }) {
    const hit = await this.findDuplicateOpportunity(opts);
    if (!hit) return;
    throw apiConflict(
      ApiErrorCode.BID_DUPLICATE,
      `A bid already exists (${hit.bid.estimateNumber}). Open that record or close this as a duplicate.`,
      {
        existingBidId: String(hit.bid.id),
        existingEstimateNumber: hit.bid.estimateNumber,
        existingBidName: hit.bid.bidName,
        match: hit.match,
      },
    );
  }

  private async findDuplicateOpportunity(opts: {
    excludeId?: number;
    estimateNumber?: string | null;
    bidName?: string | null;
    ownerProjectNumber?: string | null;
    mechanicalEngineerProjectNumber?: string | null;
  }): Promise<{ bid: Bid; match: string } | null> {
    const notSelf = opts.excludeId != null ? 'b.id != :xid' : '1=1';
    const xid = opts.excludeId ?? 0;

    const byEstimate = opts.estimateNumber?.trim();
    if (byEstimate) {
      const bid = await this.bidRepo
        .createQueryBuilder('b')
        .where('b.isDeleted = :del', { del: false })
        .andWhere('LOWER(LTRIM(RTRIM(b.estimateNumber))) = :en', { en: byEstimate.toLowerCase() })
        .andWhere(notSelf, { xid })
        .getOne();
      if (bid) return { bid, match: 'estimateNumber' };
    }

    const byName = opts.bidName?.trim();
    if (byName) {
      const bid = await this.bidRepo
        .createQueryBuilder('b')
        .where('b.isDeleted = :del', { del: false })
        .andWhere('b.status != :arch', { arch: 'archived' })
        .andWhere('LOWER(LTRIM(RTRIM(b.bidName))) = :n', { n: byName.toLowerCase() })
        .andWhere(notSelf, { xid })
        .getOne();
      if (bid) return { bid, match: 'bidName' };
    }

    const opn = normalizeProjectNumber(opts.ownerProjectNumber);
    if (opn) {
      const bid = await this.bidRepo
        .createQueryBuilder('b')
        .leftJoin(BidContent, 'cnt', 'cnt.bidId = b.id')
        .where('b.isDeleted = :del', { del: false })
        .andWhere('b.status != :arch', { arch: 'archived' })
        .andWhere(
          `REPLACE(REPLACE(ISNULL(JSON_VALUE(cnt.ProcessJson, '$.ownerProjectNumber'), ''), '#', ''), ' ', '') = :opn`,
          { opn },
        )
        .andWhere(notSelf, { xid })
        .getOne();
      if (bid) return { bid, match: 'ownerProjectNumber' };
    }
    const mepn = normalizeProjectNumber(opts.mechanicalEngineerProjectNumber);
    if (mepn) {
      const bid = await this.bidRepo
        .createQueryBuilder('b')
        .leftJoin(BidContent, 'cnt', 'cnt.bidId = b.id')
        .where('b.isDeleted = :del', { del: false })
        .andWhere('b.status != :arch', { arch: 'archived' })
        .andWhere(
          `REPLACE(REPLACE(ISNULL(JSON_VALUE(cnt.ProcessJson, '$.mechanicalEngineerProjectNumber'), ''), '#', ''), ' ', '') = :mepn`,
          { mepn },
        )
        .andWhere(notSelf, { xid })
        .getOne();
      if (bid) return { bid, match: 'mechanicalEngineerProjectNumber' };
    }
    return null;
  }
}
