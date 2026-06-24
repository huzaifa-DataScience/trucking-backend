import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../auth/guards';
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
import { ConnecteamReportService } from './connecteam-report.service';
import { ConnecteamSyncService } from './connecteam-sync.service';

@UseGuards(JwtAuthGuard)
@Controller('connecteam')
export class ConnecteamController {
  constructor(
    private readonly sync: ConnecteamSyncService,
    private readonly reports: ConnecteamReportService,
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
      message:
        'Connecteam mirror: users, jobs, time clock, scheduler, forms, time off, tasks, chat. SQL-backed; POST /connecteam/sync to refresh.',
    };
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
    @Query('limit') limit?: string,
  ) {
    return {
      rows: await this.reports.hoursByJob({
        jobId,
        normalizedJobNumber,
        limit: limit ? Number(limit) : undefined,
      }),
    };
  }

  @Get('reports/hours-by-user')
  async hoursByUser(@Query('userId') userId?: string, @Query('limit') limit?: string) {
    return {
      rows: await this.reports.hoursByUser({
        userId: userId ? Number(userId) : undefined,
        limit: limit ? Number(limit) : undefined,
      }),
    };
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
    return { page: pageNum, pageSize: pageSizeNum, total, users: rows };
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
    return { page: pageNum, pageSize: pageSizeNum, total, jobs: rows };
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
    return { page: pageNum, pageSize: pageSizeNum, total, timeActivities: rows };
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
    return { page: pageNum, pageSize: pageSizeNum, total, scheduledShifts: rows };
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
    return { page: pageNum, pageSize: pageSizeNum, total, formSubmissions: rows };
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
    return { page: pageNum, pageSize: pageSizeNum, total, timeOffRequests: rows };
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
    return { page: pageNum, pageSize: pageSizeNum, total, tasks: rows };
  }

  @Get('conversations')
  async listConversations(
    @Query('search') search?: string,
    @Query('type') type?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const q = (search ?? '').trim().toLowerCase();
    const pageNum = Math.max(1, Math.floor(Number(page) || 1));
    const pageSizeNum = Math.max(1, Math.min(200, Math.floor(Number(pageSize) || 50)));
    const qb = this.conversations.createQueryBuilder('c');
    if (type?.trim()) qb.andWhere('c.type = :type', { type: type.trim() });
    if (q) qb.andWhere('LOWER(c.title) LIKE :q', { q: `%${q}%` });
    qb.orderBy('c.title', 'ASC');
    qb.skip((pageNum - 1) * pageSizeNum).take(pageSizeNum);
    const [rows, total] = await qb.getManyAndCount();
    return { page: pageNum, pageSize: pageSizeNum, total, conversations: rows };
  }
}
