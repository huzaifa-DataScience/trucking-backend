import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../auth/guards';
import type { RequestUser } from '../auth/strategies/jwt.strategy';
import {
  ConnecteamForm,
  ConnecteamFormSubmission,
  ConnecteamJob,
  ConnecteamScheduledShift,
  ConnecteamScheduler,
  ConnecteamTimeActivity,
  ConnecteamTimeClock,
  ConnecteamTimeOffRequest,
  ConnecteamUser,
  ConnecteamTaskBoard,
  ConnecteamTask,
  ConnecteamConversation,
} from '../database/entities';
import { ConnecteamChatService } from './connecteam-chat.service';
import { ConnecteamDisplayService } from './connecteam-display.service';
import { ConnecteamReportService } from './connecteam-report.service';
import { ConnecteamSyncService } from './connecteam-sync.service';

type AuthedRequest = { user: RequestUser };
@UseGuards(JwtAuthGuard)
@Controller('connecteam')
export class ConnecteamController {
  constructor(
    private readonly sync: ConnecteamSyncService,
    private readonly reports: ConnecteamReportService,
    private readonly display: ConnecteamDisplayService,
    private readonly chat: ConnecteamChatService,
    @InjectRepository(ConnecteamUser) private readonly users: Repository<ConnecteamUser>,
    @InjectRepository(ConnecteamJob) private readonly jobs: Repository<ConnecteamJob>,
    @InjectRepository(ConnecteamTimeClock) private readonly timeClocks: Repository<ConnecteamTimeClock>,
    @InjectRepository(ConnecteamTimeActivity) private readonly timeActivities: Repository<ConnecteamTimeActivity>,
    @InjectRepository(ConnecteamScheduler) private readonly schedulers: Repository<ConnecteamScheduler>,
    @InjectRepository(ConnecteamScheduledShift)
    private readonly scheduledShifts: Repository<ConnecteamScheduledShift>,
    @InjectRepository(ConnecteamForm) private readonly forms: Repository<ConnecteamForm>,
    @InjectRepository(ConnecteamFormSubmission)
    private readonly formSubmissions: Repository<ConnecteamFormSubmission>,
    @InjectRepository(ConnecteamTimeOffRequest)
    private readonly timeOffRequests: Repository<ConnecteamTimeOffRequest>,
    @InjectRepository(ConnecteamTaskBoard) private readonly taskBoards: Repository<ConnecteamTaskBoard>,
    @InjectRepository(ConnecteamTask) private readonly tasks: Repository<ConnecteamTask>,
    @InjectRepository(ConnecteamConversation)
    private readonly conversations: Repository<ConnecteamConversation>,
  ) {}

  @Get('status')
  async getStatus() {
    const h = await this.sync.getHealthInfo();
    return {
      module: 'connecteam',
      ready: h.configured === 'true',
      ...h,
      chatSync: this.chat.getChatSyncStatus(),
      message:
        'Workforce mirror + write API: clock, schedule, PTO, forms, tasks, chat. Native records use app-* IDs and survive Connecteam sync off. POST /connecteam/sync to refresh mirror.',
    };
  }

  /** Bidirectional chat sync readiness (Connecteam ↔ our site). */
  @Get('chat/sync-status')
  getChatSyncStatus() {
    return this.chat.getChatSyncStatus();
  }

  @Post('sync')
  async runSyncNow() {
    if (this.sync.isSyncRunning()) {
      return { ok: false, message: 'Connecteam sync is already running.' };
    }
    return this.sync.syncNow();
  }

  @Get('reports/hours-by-job')
  async hoursByJob(
    @Query('jobId') jobId?: string,
    @Query('normalizedJobNumber') normalizedJobNumber?: string,
    @Query('refJobId') refJobIdRaw?: string,
    @Query('limit') limit?: string,
  ) {
    const refJobId =
      refJobIdRaw != null && String(refJobIdRaw).trim() !== ''
        ? Number(refJobIdRaw)
        : undefined;
    const rows = await this.reports.hoursByJob({
      jobId,
      normalizedJobNumber,
      refJobId: refJobId != null && Number.isFinite(refJobId) ? refJobId : undefined,
      limit: limit ? Number(limit) : undefined,
    });
    return { rows: await this.reports.enrichHoursByJob(rows) };
  }

  @Get('reports/hours-by-user')
  async hoursByUser(@Query('userId') userId?: string, @Query('limit') limit?: string) {
    const rows = await this.reports.hoursByUser({
      userId: userId ? Number(userId) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
    return { rows: await this.reports.enrichHoursByUser(rows) };
  }

  @Get('users')
  async listUsers(
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('includeArchived') includeArchived?: string,
  ) {
    const q = (search ?? '').trim().toLowerCase();
    const pageNum = Math.max(1, Math.floor(Number(page) || 1));
    const pageSizeNum = Math.max(1, Math.min(200, Math.floor(Number(pageSize) || 50)));
    const qb = this.users.createQueryBuilder('u');
    if (includeArchived !== 'true') qb.andWhere('u.isArchived = :archived', { archived: false });
    if (q) {
      qb.andWhere(
        '(LOWER(u.firstName) LIKE :q OR LOWER(u.lastName) LIKE :q OR LOWER(u.email) LIKE :q OR LOWER(u.employeeId) LIKE :q)',
        { q: `%${q}%` },
      );
    }
    qb.orderBy('u.lastName', 'ASC').addOrderBy('u.firstName', 'ASC');
    qb.skip((pageNum - 1) * pageSizeNum).take(pageSizeNum);
    const [rows, total] = await qb.getManyAndCount();
    return { page: pageNum, pageSize: pageSizeNum, total, users: await this.display.enrichUserRows(rows) };
  }

  @Get('jobs')
  async listJobs(
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('includeDeleted') includeDeleted?: string,
  ) {
    const q = (search ?? '').trim().toLowerCase();
    const pageNum = Math.max(1, Math.floor(Number(page) || 1));
    const pageSizeNum = Math.max(1, Math.min(200, Math.floor(Number(pageSize) || 50)));
    const qb = this.jobs.createQueryBuilder('j');
    if (includeDeleted !== 'true') qb.andWhere('j.isDeleted = :deleted', { deleted: false });
    if (q) {
      qb.andWhere(
        '(LOWER(j.title) LIKE :q OR LOWER(j.code) LIKE :q OR LOWER(j.normalizedJobNumber) LIKE :q OR LOWER(j.companyLabel) LIKE :q)',
        { q: `%${q}%` },
      );
    }
    qb.orderBy('j.lastSyncedAt', 'DESC').addOrderBy('j.title', 'ASC');
    qb.skip((pageNum - 1) * pageSizeNum).take(pageSizeNum);
    const [rows, total] = await qb.getManyAndCount();
    return { page: pageNum, pageSize: pageSizeNum, total, jobs: await this.display.enrichJobRows(rows) };
  }

  @Get('time-clocks')
  async listTimeClocks(@Query('includeArchived') includeArchived?: string) {
    const qb = this.timeClocks.createQueryBuilder('c');
    if (includeArchived !== 'true') qb.where('c.isArchived = :archived', { archived: false });
    qb.orderBy('c.name', 'ASC');
    return { timeClocks: await qb.getMany() };
  }

  @Get('time-activities')
  async listTimeActivities(
    @Query('timeClockId') timeClockIdRaw?: string,
    @Query('userId') userIdRaw?: string,
    @Query('jobId') jobId?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const pageNum = Math.max(1, Math.floor(Number(page) || 1));
    const pageSizeNum = Math.max(1, Math.min(500, Math.floor(Number(pageSize) || 50)));
    const qb = this.timeActivities.createQueryBuilder('a');
    if (timeClockIdRaw) {
      const id = Number(timeClockIdRaw);
      if (!Number.isFinite(id)) throw new BadRequestException('timeClockId must be a number');
      qb.andWhere('a.timeClockId = :id', { id });
    }
    if (userIdRaw) {
      const id = Number(userIdRaw);
      if (!Number.isFinite(id)) throw new BadRequestException('userId must be a number');
      qb.andWhere('a.userId = :uid', { uid: id });
    }
    if (jobId?.trim()) qb.andWhere('a.jobId = :jobId', { jobId: jobId.trim() });
    qb.orderBy('a.startTimestamp', 'DESC');
    qb.skip((pageNum - 1) * pageSizeNum).take(pageSizeNum);
    const [rows, total] = await qb.getManyAndCount();
    return {
      page: pageNum,
      pageSize: pageSizeNum,
      total,
      timeActivities: await this.display.enrichTimeActivities(rows),
    };
  }

  @Get('schedulers')
  async listSchedulers(@Query('includeArchived') includeArchived?: string) {
    const qb = this.schedulers.createQueryBuilder('s');
    if (includeArchived !== 'true') qb.where('s.isArchived = :archived', { archived: false });
    qb.orderBy('s.name', 'ASC');
    return { schedulers: await qb.getMany() };
  }

  @Get('scheduled-shifts')
  async listScheduledShifts(
    @Query('schedulerId') schedulerIdRaw?: string,
    @Query('jobId') jobId?: string,
    @Query('userId') userIdRaw?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const pageNum = Math.max(1, Math.floor(Number(page) || 1));
    const pageSizeNum = Math.max(1, Math.min(500, Math.floor(Number(pageSize) || 50)));
    const qb = this.scheduledShifts.createQueryBuilder('s');
    if (schedulerIdRaw) {
      const id = Number(schedulerIdRaw);
      if (!Number.isFinite(id)) throw new BadRequestException('schedulerId must be a number');
      qb.andWhere('s.schedulerId = :id', { id });
    }
    if (jobId?.trim()) qb.andWhere('s.jobId = :jobId', { jobId: jobId.trim() });
    if (userIdRaw?.trim()) {
      qb.andWhere('s.assignedUserIdsJson LIKE :uid', { uid: `%${userIdRaw.trim()}%` });
    }
    qb.orderBy('s.startTime', 'DESC');
    qb.skip((pageNum - 1) * pageSizeNum).take(pageSizeNum);
    const [rows, total] = await qb.getManyAndCount();
    return {
      page: pageNum,
      pageSize: pageSizeNum,
      total,
      scheduledShifts: await this.display.enrichScheduledShifts(rows),
    };
  }

  @Get('forms')
  async listForms(
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('includeArchived') includeArchived?: string,
  ) {
    const q = (search ?? '').trim().toLowerCase();
    const pageNum = Math.max(1, Math.floor(Number(page) || 1));
    const pageSizeNum = Math.max(1, Math.min(200, Math.floor(Number(pageSize) || 50)));
    const qb = this.forms.createQueryBuilder('f');
    if (includeArchived !== 'true') qb.andWhere('f.isArchived = :archived', { archived: false });
    if (q) qb.andWhere('LOWER(f.name) LIKE :q', { q: `%${q}%` });
    qb.orderBy('f.name', 'ASC');
    qb.skip((pageNum - 1) * pageSizeNum).take(pageSizeNum);
    const [rows, total] = await qb.getManyAndCount();
    return { page: pageNum, pageSize: pageSizeNum, total, forms: rows };
  }

  @Get('form-submissions')
  async listFormSubmissions(
    @Query('formId') formId?: string,
    @Query('userId') userIdRaw?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const pageNum = Math.max(1, Math.floor(Number(page) || 1));
    const pageSizeNum = Math.max(1, Math.min(500, Math.floor(Number(pageSize) || 50)));
    const qb = this.formSubmissions.createQueryBuilder('s');
    if (formId?.trim()) qb.andWhere('s.formId = :formId', { formId: formId.trim() });
    if (userIdRaw) {
      const id = Number(userIdRaw);
      if (!Number.isFinite(id)) throw new BadRequestException('userId must be a number');
      qb.andWhere('s.userId = :uid', { uid: id });
    }
    qb.orderBy('s.submittedAt', 'DESC');
    qb.skip((pageNum - 1) * pageSizeNum).take(pageSizeNum);
    const [rows, total] = await qb.getManyAndCount();
    return {
      page: pageNum,
      pageSize: pageSizeNum,
      total,
      formSubmissions: await this.display.enrichFormSubmissions(rows),
    };
  }

  @Get('time-off')
  async listTimeOff(
    @Query('userId') userIdRaw?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const pageNum = Math.max(1, Math.floor(Number(page) || 1));
    const pageSizeNum = Math.max(1, Math.min(500, Math.floor(Number(pageSize) || 50)));
    const qb = this.timeOffRequests.createQueryBuilder('t');
    if (userIdRaw) {
      const id = Number(userIdRaw);
      if (!Number.isFinite(id)) throw new BadRequestException('userId must be a number');
      qb.andWhere('t.userId = :uid', { uid: id });
    }
    if (status?.trim()) qb.andWhere('t.status = :status', { status: status.trim() });
    qb.orderBy('t.startDate', 'DESC');
    qb.skip((pageNum - 1) * pageSizeNum).take(pageSizeNum);
    const [rows, total] = await qb.getManyAndCount();
    return {
      page: pageNum,
      pageSize: pageSizeNum,
      total,
      timeOffRequests: await this.display.enrichTimeOffRequests(rows),
    };
  }

  @Get('task-boards')
  async listTaskBoards(@Query('includeArchived') includeArchived?: string) {
    const qb = this.taskBoards.createQueryBuilder('b');
    if (includeArchived !== 'true') qb.where('b.isArchived = :archived', { archived: false });
    qb.orderBy('b.name', 'ASC');
    return { taskBoards: await qb.getMany() };
  }

  @Get('tasks')
  async listTasks(
    @Query('taskBoardId') taskBoardIdRaw?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('includeArchived') includeArchived?: string,
  ) {
    const q = (search ?? '').trim().toLowerCase();
    const pageNum = Math.max(1, Math.floor(Number(page) || 1));
    const pageSizeNum = Math.max(1, Math.min(500, Math.floor(Number(pageSize) || 50)));
    const qb = this.tasks.createQueryBuilder('t');
    if (taskBoardIdRaw) {
      const id = Number(taskBoardIdRaw);
      if (!Number.isFinite(id)) throw new BadRequestException('taskBoardId must be a number');
      qb.andWhere('t.taskBoardId = :id', { id });
    }
    if (includeArchived !== 'true') qb.andWhere('t.isArchived = :archived', { archived: false });
    if (status?.trim()) qb.andWhere('t.status = :status', { status: status.trim() });
    if (q) {
      qb.andWhere('(LOWER(t.title) LIKE :q OR LOWER(t.descriptionSummary) LIKE :q)', { q: `%${q}%` });
    }
    qb.orderBy('t.dueDate', 'DESC').addOrderBy('t.title', 'ASC');
    qb.skip((pageNum - 1) * pageSizeNum).take(pageSizeNum);
    const [rows, total] = await qb.getManyAndCount();
    return { page: pageNum, pageSize: pageSizeNum, total, tasks: await this.display.enrichTasks(rows) };
  }

  @Get('conversations/:conversationId')
  async getConversation(
    @Param('conversationId') conversationId: string,
    @Req() req: AuthedRequest,
  ) {
    const row = await this.conversations.findOne({ where: { conversationId } });
    if (!row || row.isDeleted) return { conversation: null };
    const [enriched] = this.display.enrichConversations([row]);
    const [withUnread] = await this.chat.withUnreadCounts(req.user.id, [enriched]);
    return { conversation: withUnread };
  }

  @Get('conversations')
  async listConversations(
    @Req() req: AuthedRequest,
    @Query('search') search?: string,
    @Query('type') type?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('includeDeleted') includeDeleted?: string,
  ) {
    const q = (search ?? '').trim().toLowerCase();
    const pageNum = Math.max(1, Math.floor(Number(page) || 1));
    const pageSizeNum = Math.max(1, Math.min(200, Math.floor(Number(pageSize) || 50)));
    const qb = this.conversations.createQueryBuilder('c');
    if (includeDeleted !== 'true') qb.andWhere('c.isDeleted = :deleted', { deleted: false });
    const skipTitles = [...this.chat.skippedTitles()];
    if (skipTitles.length) {
      qb.andWhere(
        `(c.title IS NULL OR LOWER(LTRIM(RTRIM(c.title))) NOT IN (${skipTitles.map((_, i) => `:st${i}`).join(',')}))`,
        Object.fromEntries(skipTitles.map((t, i) => [`st${i}`, t])),
      );
    }
    if (type?.trim()) qb.andWhere('c.type = :type', { type: type.trim() });
    if (q) {
      qb.andWhere(
        '(LOWER(c.title) LIKE :q OR LOWER(c.lastMessagePreview) LIKE :q OR LOWER(c.lastMessageSenderName) LIKE :q)',
        { q: `%${q}%` },
      );
    }
    qb.orderBy('c.lastMessageAt', 'DESC').addOrderBy('c.title', 'ASC');
    qb.skip((pageNum - 1) * pageSizeNum).take(pageSizeNum);
    const [rows, total] = await qb.getManyAndCount();
    const enriched = this.display.enrichConversations(rows);
    const conversations = await this.chat.withUnreadCounts(req.user.id, enriched);
    const totalUnread = await this.chat.totalUnreadForUser(req.user.id);
    return { page: pageNum, pageSize: pageSizeNum, total, totalUnread, conversations };
  }
}
