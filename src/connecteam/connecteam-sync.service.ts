import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  ConnecteamAccount,
  ConnecteamForm,
  ConnecteamFormSubmission,
  ConnecteamJob,
  ConnecteamScheduledShift,
  ConnecteamScheduler,
  ConnecteamSyncState,
  ConnecteamTimeActivity,
  ConnecteamTimeClock,
  ConnecteamTimeOffRequest,
  ConnecteamUser,
  ConnecteamTaskBoard,
  ConnecteamTask,
  ConnecteamConversation,
  Job,
} from '../database/entities';
import { ConnecteamApiClient } from './connecteam-api.client';
import { chunkArray } from './connecteam-batch.util';
import {
  extractCompanyLabel,
  extractEmployeeId,
  formatYmd,
  normalizeConnecteamJobNumber,
  shiftDurationMinutes,
  unixSecondsToDate,
} from './connecteam.util';

const CONNECTEAM_CRON_EXPR =
  (process.env.CONNECTEAM_SYNC_CRON ?? '0 30 */6 * * *').trim() || '0 30 */6 * * *';

const UPSERT_CHUNK = 50;

const STATE_KEYS = {
  lastRunStartedAt: 'lastRunStartedAt',
  lastRunFinishedAt: 'lastRunFinishedAt',
  lastSuccessfulRunAt: 'lastSuccessfulRunAt',
  lastError: 'lastError',
  lastPhase: 'lastPhase',
  usersSynced: 'usersSynced',
  jobsSynced: 'jobsSynced',
  timeClocksSynced: 'timeClocksSynced',
  shiftsSynced: 'shiftsSynced',
  schedulersSynced: 'schedulersSynced',
  scheduledShiftsSynced: 'scheduledShiftsSynced',
  formsSynced: 'formsSynced',
  formSubmissionsSynced: 'formSubmissionsSynced',
  timeOffSynced: 'timeOffSynced',
  taskBoardsSynced: 'taskBoardsSynced',
  tasksSynced: 'tasksSynced',
  conversationsSynced: 'conversationsSynced',
} as const;

export type ConnecteamSyncResult = {
  ok: boolean;
  usersSynced: number;
  jobsSynced: number;
  timeClocksSynced: number;
  shiftsSynced: number;
  schedulersSynced: number;
  scheduledShiftsSynced: number;
  formsSynced: number;
  formSubmissionsSynced: number;
  timeOffSynced: number;
  taskBoardsSynced: number;
  tasksSynced: number;
  conversationsSynced: number;
  error?: string;
};

@Injectable()
export class ConnecteamSyncService implements OnModuleInit {
  private readonly logger = new Logger(ConnecteamSyncService.name);
  private syncRunning = false;

  constructor(
    private readonly config: ConfigService,
    private readonly api: ConnecteamApiClient,
    private readonly dataSource: DataSource,
    @InjectRepository(ConnecteamSyncState) private readonly state: Repository<ConnecteamSyncState>,
    @InjectRepository(ConnecteamAccount) private readonly account: Repository<ConnecteamAccount>,
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
    @InjectRepository(Job) private readonly refJobs: Repository<Job>,
  ) {}

  async onModuleInit(): Promise<void> {
    const enabled = this.isEnabled();
    this.logger.log(
      `Connecteam sync will run on cron "${CONNECTEAM_CRON_EXPR}"${enabled ? '' : ' (DISABLED via CONNECTEAM_SYNC_ENABLED=false)'}`,
    );
  }

  isSyncRunning(): boolean {
    return this.syncRunning;
  }

  isEnabled(): boolean {
    return this.config.get<string>('CONNECTEAM_SYNC_ENABLED', 'true') !== 'false';
  }

  @Cron(CONNECTEAM_CRON_EXPR, { name: 'connecteam-sync' })
  async cronTick(): Promise<void> {
    if (!this.isEnabled()) return;
    if (this.syncRunning) {
      this.logger.warn('Connecteam sync already in progress — skipping cron tick.');
      return;
    }
    await this.syncNow().catch((err) =>
      this.logger.error(`Connecteam cron sync failed: ${err?.message ?? err}`),
    );
  }

  async getHealthInfo(): Promise<Record<string, string | null>> {
    const keys = Object.values(STATE_KEYS);
    const rows = await this.state.find({ where: keys.map((key) => ({ key })) });
    const map = new Map(rows.map((r) => [r.key, r.value]));
    const configured = this.api.isConfigured();
    const accounts = configured ? await this.account.find({ take: 1, order: { lastSyncedAt: 'DESC' } }) : [];
    const account = accounts[0] ?? null;
    const out: Record<string, string | null> = {
      configured: String(configured),
      companyName: account?.companyName ?? null,
      companyId: account?.companyId ?? null,
      lastRunStartedAt: map.get(STATE_KEYS.lastRunStartedAt) ?? null,
      lastRunFinishedAt: map.get(STATE_KEYS.lastRunFinishedAt) ?? null,
      lastSuccessfulRunAt: map.get(STATE_KEYS.lastSuccessfulRunAt) ?? null,
      lastError: map.get(STATE_KEYS.lastError) ?? null,
      lastPhase: map.get(STATE_KEYS.lastPhase) ?? null,
    };
    for (const k of Object.values(STATE_KEYS)) {
      if (!(k in out)) out[k] = map.get(k) ?? null;
    }
    return out;
  }

  async syncNow(): Promise<ConnecteamSyncResult> {
    const empty: ConnecteamSyncResult = {
      ok: false,
      usersSynced: 0,
      jobsSynced: 0,
      timeClocksSynced: 0,
      shiftsSynced: 0,
      schedulersSynced: 0,
      scheduledShiftsSynced: 0,
      formsSynced: 0,
      formSubmissionsSynced: 0,
      timeOffSynced: 0,
      taskBoardsSynced: 0,
      tasksSynced: 0,
      conversationsSynced: 0,
    };

    if (!this.api.isConfigured()) return { ...empty, error: 'CONNECTEAM_API_KEY is not set' };
    if (this.syncRunning) return { ...empty, error: 'Sync already running' };

    this.syncRunning = true;
    const counts = { ...empty };
    await this.setState(STATE_KEYS.lastRunStartedAt, new Date().toISOString());
    await this.setState(STATE_KEYS.lastError, null);

    try {
      await this.setState(STATE_KEYS.lastPhase, 'account');
      const me = await this.api.getMe();
      await this.account.save({ companyId: me.companyId, companyName: me.companyName, lastSyncedAt: new Date() });

      await this.setState(STATE_KEYS.lastPhase, 'users');
      counts.usersSynced = await this.syncUsers();

      await this.setState(STATE_KEYS.lastPhase, 'jobs');
      counts.jobsSynced = await this.syncJobs();

      await this.setState(STATE_KEYS.lastPhase, 'timeClocks');
      counts.timeClocksSynced = await this.syncTimeClocks();

      await this.setState(STATE_KEYS.lastPhase, 'timeActivities');
      counts.shiftsSynced = await this.syncTimeActivities();

      await this.setState(STATE_KEYS.lastPhase, 'schedulers');
      counts.schedulersSynced = await this.syncSchedulers();

      await this.setState(STATE_KEYS.lastPhase, 'scheduledShifts');
      counts.scheduledShiftsSynced = await this.syncScheduledShifts();

      await this.setState(STATE_KEYS.lastPhase, 'forms');
      counts.formsSynced = await this.syncForms();

      await this.setState(STATE_KEYS.lastPhase, 'formSubmissions');
      counts.formSubmissionsSynced = await this.syncFormSubmissions();

      await this.setState(STATE_KEYS.lastPhase, 'timeOff');
      counts.timeOffSynced = await this.syncTimeOff();

      await this.setState(STATE_KEYS.lastPhase, 'taskBoards');
      counts.taskBoardsSynced = await this.syncTaskBoards();

      await this.setState(STATE_KEYS.lastPhase, 'tasks');
      counts.tasksSynced = await this.syncTasks();

      await this.setState(STATE_KEYS.lastPhase, 'conversations');
      counts.conversationsSynced = await this.syncConversations();

      const finished = new Date().toISOString();
      await this.setState(STATE_KEYS.lastRunFinishedAt, finished);
      await this.setState(STATE_KEYS.lastSuccessfulRunAt, finished);
      await this.setState(STATE_KEYS.lastPhase, 'done');
      for (const [k, v] of Object.entries(counts)) {
        if (k === 'ok' || k === 'error') continue;
        const stateKey = (STATE_KEYS as Record<string, string>)[k];
        if (stateKey) await this.setState(stateKey, String(v));
      }

      this.logger.log(
        `Connecteam sync done: users=${counts.usersSynced}, jobs=${counts.jobsSynced}, clocks=${counts.timeClocksSynced}, timeShifts=${counts.shiftsSynced}, schedulers=${counts.schedulersSynced}, scheduledShifts=${counts.scheduledShiftsSynced}, forms=${counts.formsSynced}, submissions=${counts.formSubmissionsSynced}, timeOff=${counts.timeOffSynced}, taskBoards=${counts.taskBoardsSynced}, tasks=${counts.tasksSynced}, conversations=${counts.conversationsSynced}`,
      );

      return { ...counts, ok: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.setState(STATE_KEYS.lastError, msg);
      await this.setState(STATE_KEYS.lastPhase, 'error');
      await this.setState(STATE_KEYS.lastRunFinishedAt, new Date().toISOString());
      this.logger.error(`Connecteam sync failed: ${msg}`);
      return { ...counts, ok: false, error: msg };
    } finally {
      this.syncRunning = false;
    }
  }

  private async syncUsers(): Promise<number> {
    const rows = await this.api.listAllUsers();
    const now = new Date();
    const entities = rows.map((u) => ({
      userId: u.userId,
      firstName: u.firstName ?? null,
      lastName: u.lastName ?? null,
      email: u.email ?? null,
      phoneNumber: u.phoneNumber ?? null,
      userType: u.userType ?? null,
      employeeId: extractEmployeeId(u.customFields),
      isArchived: Boolean(u.isArchived),
      profilePictureUrl: u.profilePictureUrl ?? null,
      createdAt: unixSecondsToDate(u.createdAt),
      modifiedAt: unixSecondsToDate(u.modifiedAt),
      lastLoginAt: unixSecondsToDate(u.lastLogin),
      lastSyncedAt: now,
    }));
    for (const part of chunkArray(entities, UPSERT_CHUNK)) {
      await this.users.upsert(part, ['userId']);
    }
    return entities.length;
  }

  private async syncJobs(): Promise<number> {
    const rows = await this.api.listAllJobs();
    const now = new Date();
    const refByNumber = await this.loadRefJobIds();
    const entities = rows.map((j) => {
      const normalized = normalizeConnecteamJobNumber(j.code);
      const refJobId =
        (normalized && refByNumber.get(normalized)) ||
        (j.code && refByNumber.get(j.code.trim())) ||
        null;
      return {
        jobId: j.jobId,
        title: j.title ?? null,
        code: j.code ?? null,
        normalizedJobNumber: normalized,
        description: j.description ?? null,
        color: j.color ?? null,
        companyLabel: extractCompanyLabel(j.customFields),
        gpsAddress: j.gps?.address ?? null,
        gpsLatitude: j.gps?.latitude ?? null,
        gpsLongitude: j.gps?.longitude ?? null,
        isDeleted: Boolean(j.isDeleted),
        refJobId,
        lastSyncedAt: now,
      };
    });
    for (const part of chunkArray(entities, UPSERT_CHUNK)) {
      await this.jobs.upsert(part, ['jobId']);
    }
    return entities.length;
  }

  private async syncTimeClocks(): Promise<number> {
    const rows = await this.api.listTimeClocks();
    const now = new Date();
    const entities = rows.map((c) => ({
      timeClockId: c.id,
      name: c.name,
      isArchived: Boolean(c.isArchived),
      lastSyncedAt: now,
    }));
    for (const part of chunkArray(entities, UPSERT_CHUNK)) {
      await this.timeClocks.upsert(part, ['timeClockId']);
    }
    return entities.length;
  }

  private async syncTimeActivities(): Promise<number> {
    const days = Number(this.config.get<string>('CONNECTEAM_TIME_ACTIVITIES_DAYS', '30')) || 30;
    const end = new Date();
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - Math.max(1, Math.min(92, days)));
    const startDate = formatYmd(start);
    const endDate = formatYmd(end);
    const clocks = await this.timeClocks.find({ where: { isArchived: false } });
    const now = new Date();
    const entities: ConnecteamTimeActivity[] = [];

    for (const clock of clocks) {
      const shifts = await this.api.listShifts(clock.timeClockId, startDate, endDate);
      for (const { userId, shift } of shifts) {
        const startTs = shift.start?.timestamp ?? null;
        const endTs = shift.end?.timestamp ?? null;
        entities.push({
          timeClockId: clock.timeClockId,
          shiftId: shift.id,
          userId,
          jobId: shift.jobId ?? null,
          subJobId: shift.subJobId ?? null,
          startTimestamp: startTs != null ? String(startTs) : null,
          endTimestamp: endTs != null ? String(endTs) : null,
          startTimezone: shift.start?.timezone ?? null,
          endTimezone: shift.end?.timezone ?? null,
          durationMinutes: shiftDurationMinutes(startTs, endTs),
          employeeNote: shift.employeeNote ?? null,
          managerNote: shift.managerNote ?? null,
          isAutoClockOut: Boolean(shift.isAutoClockOut),
          createdAt: unixSecondsToDate(shift.createdAt),
          modifiedAt: unixSecondsToDate(shift.modifiedAt),
          lastSyncedAt: now,
          recordSource: 'sync',
        } as ConnecteamTimeActivity);
      }
    }

    for (const part of chunkArray(entities, UPSERT_CHUNK)) {
      await this.timeActivities.upsert(part, ['timeClockId', 'shiftId']);
    }
    return entities.length;
  }

  private async syncSchedulers(): Promise<number> {
    const rows = await this.api.listSchedulers();
    const now = new Date();
    const entities = rows.map((s) => ({
      schedulerId: s.schedulerId,
      name: s.name,
      timezone: s.timezone ?? null,
      isArchived: Boolean(s.isArchived),
      lastSyncedAt: now,
    }));
    for (const part of chunkArray(entities, UPSERT_CHUNK)) {
      await this.schedulers.upsert(part, ['schedulerId']);
    }
    return entities.length;
  }

  private async syncScheduledShifts(): Promise<number> {
    const days = Number(this.config.get<string>('CONNECTEAM_SCHEDULER_DAYS', '30')) || 30;
    const end = new Date();
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - Math.max(1, Math.min(92, days)));
    const startTime = Math.floor(start.getTime() / 1000);
    const endTime = Math.floor(end.getTime() / 1000);
    const schedulers = await this.schedulers.find({ where: { isArchived: false } });
    const now = new Date();
    const entities: ConnecteamScheduledShift[] = [];

    for (const sched of schedulers) {
      const shifts = await this.api.listSchedulerShifts(sched.schedulerId, startTime, endTime);
      for (const s of shifts) {
        entities.push({
          schedulerId: sched.schedulerId,
          shiftId: s.id,
          title: s.title ?? null,
          jobId: s.jobId ?? null,
          startTime: s.startTime != null ? String(s.startTime) : null,
          endTime: s.endTime != null ? String(s.endTime) : null,
          timezone: s.timezone ?? null,
          isOpenShift: Boolean(s.isOpenShift),
          isPublished: Boolean(s.isPublished),
          assignedUserIdsJson: JSON.stringify(s.assignedUserIds ?? []),
          locationAddress: s.locationData?.gps?.address ?? null,
          lastSyncedAt: now,
          recordSource: 'sync',
        } as ConnecteamScheduledShift);
      }
    }

    for (const part of chunkArray(entities, UPSERT_CHUNK)) {
      await this.scheduledShifts.upsert(part, ['schedulerId', 'shiftId']);
    }
    return entities.length;
  }

  private async syncForms(): Promise<number> {
    const rows = await this.api.listAllForms();
    const now = new Date();
    const entities = rows.map((f) => ({
      formId: String(f.formId ?? f.id ?? ''),
      name: f.name ?? null,
      isArchived: Boolean(f.isArchived),
      lastSyncedAt: now,
    })).filter((f) => f.formId);
    for (const part of chunkArray(entities, UPSERT_CHUNK)) {
      await this.forms.upsert(part, ['formId']);
    }
    return entities.length;
  }

  private async syncFormSubmissions(): Promise<number> {
    const days = Number(this.config.get<string>('CONNECTEAM_FORMS_SUBMISSIONS_DAYS', '30')) || 30;
    const end = Math.floor(Date.now() / 1000);
    const start = end - Math.max(1, Math.min(365, days)) * 86400;
    const forms = await this.forms.find({ where: { isArchived: false } });
    const now = new Date();
    const entities: ConnecteamFormSubmission[] = [];

    for (const form of forms) {
      let submissions: Awaited<ReturnType<ConnecteamApiClient['listFormSubmissions']>>;
      try {
        submissions = await this.api.listFormSubmissions(form.formId, start, end);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Connecteam form submissions skipped for ${form.formId}: ${msg}`);
        continue;
      }
      for (const s of submissions) {
        const submissionId = String(s.formSubmissionId ?? s.id ?? '');
        if (!submissionId) continue;
        const submittedAt = s.submissionTimestamp ?? s.submittingTimestamp ?? s.submittedAt ?? null;
        entities.push({
          formId: form.formId,
          submissionId,
          userId: s.submittingUserId ?? s.userId ?? null,
          submittedAt: submittedAt != null ? String(submittedAt) : null,
          status: s.status ?? null,
          summaryJson: s.answers != null ? JSON.stringify(s.answers).slice(0, 4000) : null,
          lastSyncedAt: now,
          recordSource: 'sync',
        } as ConnecteamFormSubmission);
      }
    }

    for (const part of chunkArray(entities, UPSERT_CHUNK)) {
      await this.formSubmissions.upsert(part, ['formId', 'submissionId']);
    }
    return entities.length;
  }

  private async syncTimeOff(): Promise<number> {
    const days = Number(this.config.get<string>('CONNECTEAM_TIME_OFF_DAYS', '90')) || 90;
    const end = new Date();
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - Math.max(1, Math.min(365, days)));
    const rows = await this.api.listTimeOffRequests(formatYmd(start), formatYmd(end));
    const now = new Date();
    const entities = rows.map((r) => ({
      requestId: r.id,
      userId: r.userId,
      policyTypeId: r.policyTypeId ?? null,
      status: r.status,
      isAllDay: Boolean(r.isAllDay ?? true),
      startDate: r.startDate ?? null,
      endDate: r.endDate ?? null,
      startTime: r.startTime ?? null,
      endTime: r.endTime ?? null,
      timezone: r.timezone ?? null,
      durationAmount: r.duration?.amount ?? null,
      durationUnits: r.duration?.units ?? null,
      employeeNote: r.employeeNote ?? null,
      managerNote: r.managerNote ?? null,
      timeClockId: r.timeClockId ?? null,
      lastSyncedAt: now,
      recordSource: 'sync' as const,
    }));
    for (const part of chunkArray(entities, UPSERT_CHUNK)) {
      await this.timeOffRequests.upsert(part, ['requestId']);
    }
    return entities.length;
  }

  private async syncTaskBoards(): Promise<number> {
    const rows = await this.api.listTaskBoards();
    const now = new Date();
    const entities = rows.map((b) => ({
      taskBoardId: b.id,
      name: b.name,
      isArchived: Boolean(b.isArchived),
      lastSyncedAt: now,
    }));
    for (const part of chunkArray(entities, UPSERT_CHUNK)) {
      await this.taskBoards.upsert(part, ['taskBoardId']);
    }
    return entities.length;
  }

  private async syncTasks(): Promise<number> {
    const boards = await this.taskBoards.find({ where: { isArchived: false } });
    const now = new Date();
    const entities: ConnecteamTask[] = [];

    for (const board of boards) {
      const rows = await this.api.listTasks(board.taskBoardId);
      for (const t of rows) {
        const html = t.description?.find((d) => d.type === 'html')?.html ?? '';
        const summary = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1000) || null;
        entities.push({
          taskBoardId: board.taskBoardId,
          taskId: t.id,
          title: t.title ?? null,
          status: t.status ?? null,
          type: t.type ?? null,
          startTime: t.startTime != null ? String(t.startTime) : null,
          dueDate: t.dueDate != null ? String(t.dueDate) : null,
          userIdsJson: JSON.stringify(t.userIds ?? []),
          labelIdsJson: JSON.stringify(t.labelIds ?? []),
          isArchived: Boolean(t.isArchived),
          descriptionSummary: summary,
          lastSyncedAt: now,
          recordSource: 'sync',
        } as ConnecteamTask);
      }
    }

    for (const part of chunkArray(entities, UPSERT_CHUNK)) {
      await this.tasks.upsert(part, ['taskBoardId', 'taskId']);
    }
    return entities.length;
  }

  private async syncConversations(): Promise<number> {
    const rows = await this.api.listConversations();
    const now = new Date();
    const entities = rows.map((c) => ({
      conversationId: c.id,
      title: c.title ?? null,
      type: c.type ?? null,
      conversationSource: c.conversationSource ?? null,
      lastSyncedAt: now,
      recordSource: 'sync' as const,
    }));
    for (const part of chunkArray(entities, UPSERT_CHUNK)) {
      await this.conversations.upsert(part, ['conversationId']);
    }
    return entities.length;
  }

  private async loadRefJobIds(): Promise<Map<string, number>> {
    const rows = await this.refJobs.find({ select: { id: true, jobNumber: true } });
    const map = new Map<string, number>();
    for (const j of rows) {
      const n = String(j.jobNumber ?? '').trim();
      if (!n) continue;
      map.set(n, j.id);
      const normalized = normalizeConnecteamJobNumber(n);
      if (normalized) map.set(normalized, j.id);
    }
    return map;
  }

  private async setState(key: string, value: string | null): Promise<void> {
    await this.state.save({ key, value, updatedAt: new Date() });
  }
}
