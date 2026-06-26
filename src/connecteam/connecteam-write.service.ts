import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RequestUser } from '../auth/strategies/jwt.strategy';
import {
  ConnecteamConversation,
  ConnecteamForm,
  ConnecteamFormSubmission,
  ConnecteamMessage,
  ConnecteamScheduledShift,
  ConnecteamScheduler,
  ConnecteamTask,
  ConnecteamTaskBoard,
  ConnecteamTimeActivity,
  ConnecteamTimeClock,
  ConnecteamTimeOffRequest,
  ConnecteamUser,
  Role,
} from '../database/entities';
import { ConnecteamApiClient } from './connecteam-api.client';
import { isNativeConnecteamId, nativeConnecteamId } from './connecteam-native-id.util';
import { shiftDurationMinutes } from './connecteam.util';
import type {
  ClockInDto,
  ClockOutDto,
  CreateConversationDto,
  CreateScheduledShiftDto,
  CreateTaskDto,
  CreateTimeActivityDto,
  CreateTimeOffDto,
  PatchScheduledShiftDto,
  PatchTaskDto,
  PatchTimeActivityDto,
  PatchTimeOffStatusDto,
  SendMessageDto,
  SubmitFormDto,
} from './dto/connecteam-write.dto';

@Injectable()
export class ConnecteamWriteService {
  private readonly logger = new Logger(ConnecteamWriteService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly api: ConnecteamApiClient,
    @InjectRepository(ConnecteamUser) private readonly users: Repository<ConnecteamUser>,
    @InjectRepository(ConnecteamTimeClock) private readonly timeClocks: Repository<ConnecteamTimeClock>,
    @InjectRepository(ConnecteamTimeActivity)
    private readonly timeActivities: Repository<ConnecteamTimeActivity>,
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
    @InjectRepository(ConnecteamMessage) private readonly messages: Repository<ConnecteamMessage>,
  ) {}

  private writeThroughEnabled(): boolean {
    return this.config.get<string>('CONNECTEAM_WRITE_THROUGH', 'false') === 'true' && this.api.isConfigured();
  }

  private isAdmin(actor: RequestUser): boolean {
    return actor.role === Role.Admin;
  }

  async resolveConnecteamUser(actor: RequestUser): Promise<ConnecteamUser | null> {
    const byLink = await this.users.findOne({ where: { appUserId: actor.id } });
    if (byLink) return byLink;
    const email = actor.email.trim().toLowerCase();
    if (!email) return null;
    return this.users
      .createQueryBuilder('u')
      .where('LOWER(u.email) = :email', { email })
      .andWhere('u.isArchived = 0')
      .getOne();
  }


  private async requireUserAccess(actor: RequestUser, targetUserId: number): Promise<void> {
    if (this.isAdmin(actor)) return;
    const self = await this.resolveConnecteamUser(actor);
    if (!self || self.userId !== targetUserId) {
      throw new ForbiddenException('You can only act for your own workforce profile');
    }
  }

  private async requireAdmin(actor: RequestUser): Promise<void> {
    if (!this.isAdmin(actor)) throw new ForbiddenException('Admin role required');
  }

  async getMe(actor: RequestUser) {
    const user = await this.resolveConnecteamUser(actor);
    return { linked: Boolean(user), connecteamUser: user };
  }

  async linkAppUser(connecteamUserId: number, appUserId: number) {
    const row = await this.users.findOne({ where: { userId: connecteamUserId } });
    if (!row) throw new NotFoundException('Connecteam user not found');
    row.appUserId = appUserId;
    await this.users.save(row);
    return { ok: true, user: row };
  }

  async getOpenShift(timeClockId: number, userId: number, actor: RequestUser) {
    await this.requireUserAccess(actor, userId);
    const row = await this.timeActivities
      .createQueryBuilder('a')
      .where('a.timeClockId = :timeClockId', { timeClockId })
      .andWhere('a.userId = :userId', { userId })
      .andWhere('a.endTimestamp IS NULL')
      .orderBy('a.startTimestamp', 'DESC')
      .getOne();
    return { openShift: row };
  }

  async clockIn(timeClockId: number, dto: ClockInDto, actor: RequestUser) {
    await this.requireUserAccess(actor, dto.userId);
    await this.ensureTimeClock(timeClockId);

    const existing = await this.timeActivities
      .createQueryBuilder('a')
      .where('a.timeClockId = :timeClockId', { timeClockId })
      .andWhere('a.userId = :userId', { userId: dto.userId })
      .andWhere('a.endTimestamp IS NULL')
      .getOne();
    if (existing) throw new BadRequestException('User already has an open shift on this time clock');

    const now = Math.floor(Date.now() / 1000);
    const startTs = dto.timestamp ?? now;
    const tz = dto.timezone ?? 'America/Los_Angeles';
    let shiftId = nativeConnecteamId();

    if (this.writeThroughEnabled()) {
      try {
        const res = await this.api.clockIn(timeClockId, {
          userId: dto.userId,
          jobId: dto.jobId,
          timezone: tz,
          timestamp: dto.timestamp,
          schedulerShiftId: dto.schedulerShiftId,
          locationData: dto.locationData,
        });
        shiftId = String(res.shiftId ?? res.id ?? shiftId);
      } catch (e) {
        this.logger.warn(`Connecteam clock-in write-through failed: ${(e as Error).message}`);
      }
    }

    const row = this.timeActivities.create({
      timeClockId,
      shiftId,
      userId: dto.userId,
      jobId: dto.jobId ?? null,
      subJobId: null,
      startTimestamp: String(startTs),
      endTimestamp: null,
      startTimezone: tz,
      endTimezone: null,
      durationMinutes: null,
      employeeNote: null,
      managerNote: null,
      isAutoClockOut: false,
      createdAt: new Date(),
      modifiedAt: new Date(),
      lastSyncedAt: new Date(),
      recordSource: isNativeConnecteamId(shiftId) ? 'native' : 'sync',
    });
    await this.timeActivities.save(row);
    return { ok: true, timeActivity: row };
  }

  async clockOut(timeClockId: number, dto: ClockOutDto, actor: RequestUser) {
    await this.requireUserAccess(actor, dto.userId);
    await this.ensureTimeClock(timeClockId);

    const open = await this.timeActivities
      .createQueryBuilder('a')
      .where('a.timeClockId = :timeClockId', { timeClockId })
      .andWhere('a.userId = :userId', { userId: dto.userId })
      .andWhere('a.endTimestamp IS NULL')
      .orderBy('a.startTimestamp', 'DESC')
      .getOne();
    if (!open) throw new BadRequestException('No open shift found for this user');

    const now = Math.floor(Date.now() / 1000);
    const endTs = dto.timestamp ?? now;
    const tz = dto.timezone ?? open.startTimezone ?? 'America/Los_Angeles';
    const startTs = Number(open.startTimestamp);

    if (this.writeThroughEnabled()) {
      try {
        await this.api.clockOut(timeClockId, {
          userId: dto.userId,
          timezone: tz,
          timestamp: dto.timestamp,
          locationData: dto.locationData,
        });
      } catch (e) {
        this.logger.warn(`Connecteam clock-out write-through failed: ${(e as Error).message}`);
      }
    }

    open.endTimestamp = String(endTs);
    open.endTimezone = tz;
    open.durationMinutes = shiftDurationMinutes(startTs, endTs);
    open.modifiedAt = new Date();
    open.lastSyncedAt = new Date();
    await this.timeActivities.save(open);
    return { ok: true, timeActivity: open };
  }

  async createTimeActivity(timeClockId: number, dto: CreateTimeActivityDto, actor: RequestUser) {
    await this.requireUserAccess(actor, dto.userId);
    await this.ensureTimeClock(timeClockId);

    const tz = dto.startTimezone ?? 'America/Los_Angeles';
    let shiftId = nativeConnecteamId();

    if (this.writeThroughEnabled()) {
      try {
        const res = await this.api.createTimeActivities(timeClockId, [
          {
            userId: dto.userId,
            shifts: [
              {
                start: { timestamp: dto.startTimestamp, timezone: tz },
                end: dto.endTimestamp
                  ? { timestamp: dto.endTimestamp, timezone: dto.endTimezone ?? tz }
                  : undefined,
                jobId: dto.jobId,
                employeeNote: dto.employeeNote,
                managerNote: dto.managerNote,
              },
            ],
            manualbreaks: [],
          },
        ]);
        const remoteId = res.timeActivities?.[0]?.shifts?.[0]?.id;
        if (remoteId) shiftId = remoteId;
      } catch (e) {
        this.logger.warn(`Connecteam create time activity write-through failed: ${(e as Error).message}`);
      }
    }

    const row = this.timeActivities.create({
      timeClockId,
      shiftId,
      userId: dto.userId,
      jobId: dto.jobId ?? null,
      subJobId: null,
      startTimestamp: String(dto.startTimestamp),
      endTimestamp: dto.endTimestamp != null ? String(dto.endTimestamp) : null,
      startTimezone: tz,
      endTimezone: dto.endTimezone ?? tz,
      durationMinutes: shiftDurationMinutes(dto.startTimestamp, dto.endTimestamp ?? null),
      employeeNote: dto.employeeNote ?? null,
      managerNote: dto.managerNote ?? null,
      isAutoClockOut: false,
      createdAt: new Date(),
      modifiedAt: new Date(),
      lastSyncedAt: new Date(),
      recordSource: isNativeConnecteamId(shiftId) ? 'native' : 'sync',
    });
    await this.timeActivities.save(row);
    return { ok: true, timeActivity: row };
  }

  async patchTimeActivity(
    timeClockId: number,
    shiftId: string,
    dto: PatchTimeActivityDto,
    actor: RequestUser,
  ) {
    const row = await this.timeActivities.findOne({ where: { timeClockId, shiftId } });
    if (!row) throw new NotFoundException('Time activity not found');
    await this.requireUserAccess(actor, row.userId);

    if (this.writeThroughEnabled() && row.recordSource === 'sync' && !isNativeConnecteamId(shiftId)) {
      try {
        await this.api.updateTimeActivities(timeClockId, [
          {
            userId: row.userId,
            shifts: [
              {
                id: shiftId,
                start: dto.startTimestamp
                  ? { timestamp: dto.startTimestamp, timezone: dto.startTimezone ?? row.startTimezone ?? undefined }
                  : undefined,
                end: dto.endTimestamp
                  ? { timestamp: dto.endTimestamp, timezone: dto.endTimezone ?? row.endTimezone ?? undefined }
                  : undefined,
                jobId: dto.jobId ?? undefined,
                employeeNote: dto.employeeNote ?? undefined,
                managerNote: dto.managerNote ?? undefined,
              },
            ],
          },
        ]);
      } catch (e) {
        this.logger.warn(`Connecteam update time activity write-through failed: ${(e as Error).message}`);
      }
    }

    if (dto.startTimestamp != null) row.startTimestamp = String(dto.startTimestamp);
    if (dto.endTimestamp !== undefined) row.endTimestamp = dto.endTimestamp != null ? String(dto.endTimestamp) : null;
    if (dto.startTimezone !== undefined) row.startTimezone = dto.startTimezone;
    if (dto.endTimezone !== undefined) row.endTimezone = dto.endTimezone;
    if (dto.jobId !== undefined) row.jobId = dto.jobId;
    if (dto.employeeNote !== undefined) row.employeeNote = dto.employeeNote;
    if (dto.managerNote !== undefined) row.managerNote = dto.managerNote;
    row.durationMinutes = shiftDurationMinutes(
      Number(row.startTimestamp),
      row.endTimestamp != null ? Number(row.endTimestamp) : null,
    );
    row.modifiedAt = new Date();
    row.lastSyncedAt = new Date();
    await this.timeActivities.save(row);
    return { ok: true, timeActivity: row };
  }

  async createScheduledShift(schedulerId: number, dto: CreateScheduledShiftDto, actor: RequestUser) {
    await this.requireAdmin(actor);
    await this.ensureScheduler(schedulerId);

    let shiftId = nativeConnecteamId();
    const payload = {
      startTime: dto.startTime,
      endTime: dto.endTime,
      title: dto.title,
      jobId: dto.jobId,
      timezone: dto.timezone,
      isPublished: dto.isPublished ?? false,
      isOpenShift: dto.isOpenShift ?? false,
      assignedUserIds: dto.assignedUserIds ?? [],
    };

    if (this.writeThroughEnabled()) {
      try {
        const res = await this.api.createSchedulerShifts(schedulerId, [payload]);
        if (res.shifts?.[0]?.id) shiftId = res.shifts[0].id;
      } catch (e) {
        this.logger.warn(`Connecteam create shift write-through failed: ${(e as Error).message}`);
      }
    }

    const row = this.scheduledShifts.create({
      schedulerId,
      shiftId,
      title: dto.title ?? null,
      jobId: dto.jobId ?? null,
      startTime: String(dto.startTime),
      endTime: String(dto.endTime),
      timezone: dto.timezone ?? null,
      isOpenShift: Boolean(dto.isOpenShift),
      isPublished: Boolean(dto.isPublished),
      assignedUserIdsJson: JSON.stringify(dto.assignedUserIds ?? []),
      locationAddress: dto.locationAddress ?? null,
      lastSyncedAt: new Date(),
      recordSource: isNativeConnecteamId(shiftId) ? 'native' : 'sync',
    });
    await this.scheduledShifts.save(row);
    return { ok: true, scheduledShift: row };
  }

  async patchScheduledShift(
    schedulerId: number,
    shiftId: string,
    dto: PatchScheduledShiftDto,
    actor: RequestUser,
  ) {
    await this.requireAdmin(actor);
    const row = await this.scheduledShifts.findOne({ where: { schedulerId, shiftId } });
    if (!row) throw new NotFoundException('Scheduled shift not found');

    if (this.writeThroughEnabled() && !isNativeConnecteamId(shiftId)) {
      try {
        await this.api.updateSchedulerShifts(schedulerId, [
          {
            id: shiftId,
            startTime: dto.startTime ?? Number(row.startTime),
            endTime: dto.endTime ?? Number(row.endTime),
            title: dto.title ?? row.title,
            jobId: dto.jobId ?? row.jobId,
            timezone: dto.timezone ?? row.timezone,
            isPublished: dto.isPublished ?? row.isPublished,
            isOpenShift: dto.isOpenShift ?? row.isOpenShift,
            assignedUserIds: dto.assignedUserIds ?? JSON.parse(row.assignedUserIdsJson ?? '[]'),
          },
        ]);
      } catch (e) {
        this.logger.warn(`Connecteam update shift write-through failed: ${(e as Error).message}`);
      }
    }

    if (dto.startTime != null) row.startTime = String(dto.startTime);
    if (dto.endTime != null) row.endTime = String(dto.endTime);
    if (dto.title !== undefined) row.title = dto.title;
    if (dto.jobId !== undefined) row.jobId = dto.jobId;
    if (dto.timezone !== undefined) row.timezone = dto.timezone;
    if (dto.isPublished != null) row.isPublished = dto.isPublished;
    if (dto.isOpenShift != null) row.isOpenShift = dto.isOpenShift;
    if (dto.assignedUserIds) row.assignedUserIdsJson = JSON.stringify(dto.assignedUserIds);
    if (dto.locationAddress !== undefined) row.locationAddress = dto.locationAddress;
    row.lastSyncedAt = new Date();
    await this.scheduledShifts.save(row);
    return { ok: true, scheduledShift: row };
  }

  async deleteScheduledShift(schedulerId: number, shiftId: string, actor: RequestUser) {
    await this.requireAdmin(actor);
    const row = await this.scheduledShifts.findOne({ where: { schedulerId, shiftId } });
    if (!row) throw new NotFoundException('Scheduled shift not found');

    if (this.writeThroughEnabled() && !isNativeConnecteamId(shiftId)) {
      try {
        await this.api.deleteSchedulerShifts(schedulerId, [shiftId]);
      } catch (e) {
        this.logger.warn(`Connecteam delete shift write-through failed: ${(e as Error).message}`);
      }
    }

    await this.scheduledShifts.delete({ schedulerId, shiftId });
    return { ok: true };
  }

  async createTimeOff(dto: CreateTimeOffDto, actor: RequestUser) {
    await this.requireUserAccess(actor, dto.userId);
    let requestId = nativeConnecteamId();

    if (this.writeThroughEnabled()) {
      try {
        const res = await this.api.createTimeOffRequest({
          userId: dto.userId,
          policyTypeId: dto.policyTypeId,
          startDate: dto.startDate,
          endDate: dto.endDate,
          isAllDay: dto.isAllDay ?? true,
          startTime: dto.startTime,
          endTime: dto.endTime,
          timezone: dto.timezone,
          employeeNote: dto.employeeNote,
          timeClockId: dto.timeClockId,
        });
        requestId = String(res.id ?? res.requestId ?? requestId);
      } catch (e) {
        this.logger.warn(`Connecteam create time-off write-through failed: ${(e as Error).message}`);
      }
    }

    const row = this.timeOffRequests.create({
      requestId,
      userId: dto.userId,
      policyTypeId: dto.policyTypeId ?? null,
      status: 'pending',
      isAllDay: dto.isAllDay ?? true,
      startDate: dto.startDate,
      endDate: dto.endDate,
      startTime: dto.startTime ?? null,
      endTime: dto.endTime ?? null,
      timezone: dto.timezone ?? null,
      durationAmount: null,
      durationUnits: null,
      employeeNote: dto.employeeNote ?? null,
      managerNote: null,
      timeClockId: dto.timeClockId ?? null,
      lastSyncedAt: new Date(),
      recordSource: isNativeConnecteamId(requestId) ? 'native' : 'sync',
    });
    await this.timeOffRequests.save(row);
    return { ok: true, timeOffRequest: row };
  }

  async patchTimeOffStatus(requestId: string, dto: PatchTimeOffStatusDto, actor: RequestUser) {
    await this.requireAdmin(actor);
    const row = await this.timeOffRequests.findOne({ where: { requestId } });
    if (!row) throw new NotFoundException('Time-off request not found');

    if (this.writeThroughEnabled() && !isNativeConnecteamId(requestId)) {
      try {
        await this.api.updateTimeOffRequest(requestId, {
          status: dto.status,
          managerNote: dto.managerNote,
        });
      } catch (e) {
        this.logger.warn(`Connecteam update time-off write-through failed: ${(e as Error).message}`);
      }
    }

    row.status = dto.status;
    if (dto.managerNote !== undefined) row.managerNote = dto.managerNote;
    row.lastSyncedAt = new Date();
    await this.timeOffRequests.save(row);
    return { ok: true, timeOffRequest: row };
  }

  async submitForm(formId: string, dto: SubmitFormDto, actor: RequestUser) {
    await this.requireUserAccess(actor, dto.userId);
    const form = await this.forms.findOne({ where: { formId } });
    if (!form) throw new NotFoundException('Form not found');

    let submissionId = nativeConnecteamId();
    const submittedAt = Math.floor(Date.now() / 1000);

    if (this.writeThroughEnabled()) {
      try {
        const res = await this.api.createFormSubmission(formId, {
          userId: dto.userId,
          answers: dto.answers ?? {},
        });
        submissionId = String(res.formSubmissionId ?? res.id ?? submissionId);
      } catch (e) {
        this.logger.warn(`Connecteam form submission write-through failed: ${(e as Error).message}`);
      }
    }

    const row = this.formSubmissions.create({
      formId,
      submissionId,
      userId: dto.userId,
      submittedAt: String(submittedAt),
      status: dto.status ?? 'submitted',
      summaryJson: JSON.stringify(dto.answers ?? {}),
      lastSyncedAt: new Date(),
      recordSource: isNativeConnecteamId(submissionId) ? 'native' : 'sync',
    });
    await this.formSubmissions.save(row);
    return { ok: true, formSubmission: row };
  }

  async createTask(taskBoardId: number, dto: CreateTaskDto, actor: RequestUser) {
    await this.requireAdmin(actor);
    await this.ensureTaskBoard(taskBoardId);

    let taskId = nativeConnecteamId();
    if (this.writeThroughEnabled()) {
      try {
        const res = await this.api.createTask(taskBoardId, {
          title: dto.title,
          status: dto.status,
          type: dto.type,
          startTime: dto.startTime,
          dueDate: dto.dueDate,
          userIds: dto.userIds,
          description: dto.descriptionSummary
            ? [{ type: 'html', html: dto.descriptionSummary }]
            : undefined,
        });
        if (res.id) taskId = res.id;
      } catch (e) {
        this.logger.warn(`Connecteam create task write-through failed: ${(e as Error).message}`);
      }
    }

    const row = this.tasks.create({
      taskBoardId,
      taskId,
      title: dto.title,
      status: dto.status ?? 'open',
      type: dto.type ?? null,
      startTime: dto.startTime != null ? String(dto.startTime) : null,
      dueDate: dto.dueDate != null ? String(dto.dueDate) : null,
      userIdsJson: JSON.stringify(dto.userIds ?? []),
      labelIdsJson: JSON.stringify([]),
      isArchived: false,
      descriptionSummary: dto.descriptionSummary ?? null,
      lastSyncedAt: new Date(),
      recordSource: isNativeConnecteamId(taskId) ? 'native' : 'sync',
    });
    await this.tasks.save(row);
    return { ok: true, task: row };
  }

  async patchTask(taskBoardId: number, taskId: string, dto: PatchTaskDto, actor: RequestUser) {
    await this.requireAdmin(actor);
    const row = await this.tasks.findOne({ where: { taskBoardId, taskId } });
    if (!row) throw new NotFoundException('Task not found');

    if (this.writeThroughEnabled() && !isNativeConnecteamId(taskId)) {
      try {
        await this.api.updateTask(taskBoardId, taskId, {
          title: dto.title ?? row.title,
          status: dto.status ?? row.status,
          type: dto.type ?? row.type,
          startTime: dto.startTime ?? (row.startTime != null ? Number(row.startTime) : undefined),
          dueDate: dto.dueDate ?? (row.dueDate != null ? Number(row.dueDate) : undefined),
          userIds: dto.userIds ?? JSON.parse(row.userIdsJson ?? '[]'),
          isArchived: dto.isArchived ?? row.isArchived,
        });
      } catch (e) {
        this.logger.warn(`Connecteam update task write-through failed: ${(e as Error).message}`);
      }
    }

    if (dto.title != null) row.title = dto.title;
    if (dto.status != null) row.status = dto.status;
    if (dto.type !== undefined) row.type = dto.type;
    if (dto.startTime !== undefined) row.startTime = dto.startTime != null ? String(dto.startTime) : null;
    if (dto.dueDate !== undefined) row.dueDate = dto.dueDate != null ? String(dto.dueDate) : null;
    if (dto.userIds) row.userIdsJson = JSON.stringify(dto.userIds);
    if (dto.descriptionSummary !== undefined) row.descriptionSummary = dto.descriptionSummary;
    if (dto.isArchived != null) row.isArchived = dto.isArchived;
    row.lastSyncedAt = new Date();
    await this.tasks.save(row);
    return { ok: true, task: row };
  }

  async deleteTask(taskBoardId: number, taskId: string, actor: RequestUser) {
    await this.requireAdmin(actor);
    const row = await this.tasks.findOne({ where: { taskBoardId, taskId } });
    if (!row) throw new NotFoundException('Task not found');

    if (this.writeThroughEnabled() && !isNativeConnecteamId(taskId)) {
      try {
        await this.api.deleteTask(taskBoardId, taskId);
      } catch (e) {
        this.logger.warn(`Connecteam delete task write-through failed: ${(e as Error).message}`);
      }
    }

    await this.tasks.delete({ taskBoardId, taskId });
    return { ok: true };
  }

  async createConversation(dto: CreateConversationDto, actor: RequestUser) {
    const conversationId = nativeConnecteamId();
    const row = this.conversations.create({
      conversationId,
      title: dto.title,
      type: dto.type ?? 'team',
      conversationSource: 'app',
      lastSyncedAt: new Date(),
      recordSource: 'native',
    });
    await this.conversations.save(row);
    return { ok: true, conversation: row, createdByAppUserId: actor.id };
  }

  async listMessages(conversationId: string, page = 1, pageSize = 50) {
    await this.ensureConversation(conversationId);
    const take = Math.max(1, Math.min(200, pageSize));
    const skip = (Math.max(1, page) - 1) * take;

    const [rows, total] = await this.messages.findAndCount({
      where: { conversationId },
      order: { sentAt: 'DESC' },
      skip,
      take,
    });

    if (this.writeThroughEnabled() && rows.length === 0) {
      try {
        const remote = await this.api.listChatMessages(conversationId, take, skip);
        return { page, pageSize: take, total: remote.messages?.length ?? 0, messages: remote.messages ?? [], source: 'connecteam' };
      } catch {
        // fall through to local
      }
    }

    return { page, pageSize: take, total, messages: rows, source: 'local' };
  }

  async sendMessage(conversationId: string, dto: SendMessageDto, actor: RequestUser) {
    await this.ensureConversation(conversationId);
    const self = await this.resolveConnecteamUser(actor);
    const userId = dto.userId ?? self?.userId ?? null;
    if (userId != null) await this.requireUserAccess(actor, userId);

    let externalMessageId: string | null = null;
    if (this.writeThroughEnabled() && !isNativeConnecteamId(conversationId)) {
      try {
        const res = await this.api.sendChatMessage(conversationId, {
          userId: userId ?? undefined,
          text: dto.body,
        });
        externalMessageId = String(res.id ?? res.messageId ?? '') || null;
      } catch (e) {
        this.logger.warn(`Connecteam send message write-through failed: ${(e as Error).message}`);
      }
    }

    const row = this.messages.create({
      conversationId,
      userId,
      appUserId: actor.id,
      body: dto.body.trim(),
      sentAt: new Date(),
      recordSource: 'native',
      externalMessageId,
    });
    await this.messages.save(row);
    return { ok: true, message: row };
  }

  private async ensureTimeClock(timeClockId: number): Promise<void> {
    const row = await this.timeClocks.findOne({ where: { timeClockId } });
    if (!row) throw new NotFoundException('Time clock not found');
  }

  private async ensureScheduler(schedulerId: number): Promise<void> {
    const row = await this.schedulers.findOne({ where: { schedulerId } });
    if (!row) throw new NotFoundException('Scheduler not found');
  }

  private async ensureTaskBoard(taskBoardId: number): Promise<void> {
    const row = await this.taskBoards.findOne({ where: { taskBoardId } });
    if (!row) throw new NotFoundException('Task board not found');
  }

  private async ensureConversation(conversationId: string): Promise<void> {
    const row = await this.conversations.findOne({ where: { conversationId } });
    if (!row) throw new NotFoundException('Conversation not found');
  }
}
