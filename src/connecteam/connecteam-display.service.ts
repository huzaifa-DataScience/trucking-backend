import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  ConnecteamConversation,
  ConnecteamForm,
  ConnecteamFormSubmission,
  ConnecteamJob,
  ConnecteamMessage,
  ConnecteamScheduledShift,
  ConnecteamScheduler,
  ConnecteamTask,
  ConnecteamTaskBoard,
  ConnecteamTimeActivity,
  ConnecteamTimeClock,
  ConnecteamTimeOffRequest,
  ConnecteamUser,
  Job,
} from '../database/entities';
import type {
  ConnecteamJobSummary,
  ConnecteamRefJobSummary,
  ConnecteamTimingDisplay,
  ConnecteamUserSummary,
} from './connecteam-display.types';
import {
  formatDateRangeLabel,
  minutesToHours,
  parseJsonObject,
  parseUserIdsJson,
  unixSecondsToIso,
  userInitials,
} from './connecteam-display.util';

@Injectable()
export class ConnecteamDisplayService {
  constructor(
    @InjectRepository(ConnecteamUser) private readonly users: Repository<ConnecteamUser>,
    @InjectRepository(ConnecteamJob) private readonly jobs: Repository<ConnecteamJob>,
    @InjectRepository(Job) private readonly refJobs: Repository<Job>,
    @InjectRepository(ConnecteamTimeClock) private readonly timeClocks: Repository<ConnecteamTimeClock>,
    @InjectRepository(ConnecteamScheduler) private readonly schedulers: Repository<ConnecteamScheduler>,
    @InjectRepository(ConnecteamForm) private readonly forms: Repository<ConnecteamForm>,
    @InjectRepository(ConnecteamTaskBoard) private readonly taskBoards: Repository<ConnecteamTaskBoard>,
  ) {}

  formatUserDisplayName(
    u: Pick<ConnecteamUser, 'firstName' | 'lastName' | 'email' | 'employeeId' | 'userId'> | null | undefined,
  ): string {
    if (!u) return 'Unknown user';
    const name = [u.firstName, u.lastName].filter(Boolean).join(' ').trim();
    if (name) return name;
    if (u.email?.trim()) return u.email.trim();
    if (u.employeeId?.trim()) return `Employee ${u.employeeId.trim()}`;
    return `User ${u.userId}`;
  }

  formatJobLabel(j: Pick<ConnecteamJob, 'title' | 'code' | 'normalizedJobNumber' | 'jobId'> | null | undefined): string {
    if (!j) return 'Unknown job';
    const title = j.title?.trim() || j.code?.trim() || null;
    const num = j.normalizedJobNumber?.trim();
    if (num && title) return `${num} — ${title}`;
    if (num) return num;
    if (title) return title;
    return j.jobId;
  }

  toRefJobSummary(j: Job): ConnecteamRefJobSummary {
    return {
      id: j.id,
      jobNumber: j.jobNumber,
      name: j.name,
      jobAddress: j.jobAddress,
      city: j.city,
      isActive: j.isActive,
    };
  }

  toUserSummary(u: ConnecteamUser): ConnecteamUserSummary {
    return {
      userId: u.userId,
      displayName: this.formatUserDisplayName(u),
      initials: userInitials(u.firstName, u.lastName),
      firstName: u.firstName,
      lastName: u.lastName,
      email: u.email,
      employeeId: u.employeeId,
      phoneNumber: u.phoneNumber,
      userType: u.userType,
      profilePictureUrl: u.profilePictureUrl,
    };
  }

  stubUserSummary(userId: number): ConnecteamUserSummary {
    return {
      userId,
      displayName: `User ${userId}`,
      initials: '?',
      firstName: null,
      lastName: null,
      email: null,
      employeeId: null,
      phoneNumber: null,
      userType: null,
      profilePictureUrl: null,
    };
  }

  toJobSummary(j: ConnecteamJob, refJob?: Job | null): ConnecteamJobSummary {
    return {
      jobId: j.jobId,
      jobLabel: this.formatJobLabel(j),
      title: j.title,
      code: j.code,
      normalizedJobNumber: j.normalizedJobNumber,
      companyLabel: j.companyLabel,
      gpsAddress: j.gpsAddress,
      refJobId: j.refJobId,
      refJob: refJob ? this.toRefJobSummary(refJob) : null,
    };
  }

  stubJobSummary(jobId: string): ConnecteamJobSummary {
    return {
      jobId,
      jobLabel: jobId,
      title: null,
      code: null,
      normalizedJobNumber: null,
      companyLabel: null,
      gpsAddress: null,
      refJobId: null,
      refJob: null,
    };
  }

  timingFromUnixSeconds(
    startTs: string | number | null | undefined,
    endTs: string | number | null | undefined,
    durationMinutes?: number | null,
  ): ConnecteamTimingDisplay {
    const startAt = unixSecondsToIso(startTs);
    const endAt = unixSecondsToIso(endTs);
    const isOpen = startAt != null && endAt == null;
    let mins = durationMinutes ?? null;
    if (mins == null && startTs != null && endTs != null) {
      const s = Number(startTs);
      const e = Number(endTs);
      if (Number.isFinite(s) && Number.isFinite(e) && e > s) mins = Math.round(((e - s) / 60) * 100) / 100;
    }
    return {
      startAt,
      endAt,
      isOpen,
      durationMinutes: mins,
      durationHours: minutesToHours(mins),
    };
  }

  enrichUserRow(u: ConnecteamUser): ConnecteamUser & ConnecteamUserSummary {
    return { ...u, ...this.toUserSummary(u) };
  }

  async enrichUserRows(rows: ConnecteamUser[]): Promise<Array<ConnecteamUser & ConnecteamUserSummary>> {
    return rows.map((u) => this.enrichUserRow(u));
  }

  async enrichJobRows(rows: ConnecteamJob[]) {
    const refIds = [...new Set(rows.map((j) => j.refJobId).filter((id): id is number => id != null))];
    const refRows = refIds.length ? await this.refJobs.find({ where: { id: In(refIds) } }) : [];
    const refMap = new Map(refRows.map((r) => [r.id, r]));
    return rows.map((j) => {
      const refJob = j.refJobId != null ? refMap.get(j.refJobId) ?? null : null;
      const summary = this.toJobSummary(j, refJob);
      return { ...j, jobLabel: summary.jobLabel, refJob: summary.refJob };
    });
  }

  private async userMap(ids: number[]): Promise<Map<number, ConnecteamUser>> {
    const unique = [...new Set(ids.filter((n) => Number.isFinite(n)))];
    if (!unique.length) return new Map();
    const rows = await this.users.find({ where: { userId: In(unique) } });
    return new Map(rows.map((u) => [u.userId, u]));
  }

  private async jobMap(ids: string[]): Promise<Map<string, ConnecteamJob>> {
    const unique = [...new Set(ids.map((s) => s.trim()).filter(Boolean))];
    if (!unique.length) return new Map();
    const rows = await this.jobs.find({ where: { jobId: In(unique) } });
    return new Map(rows.map((j) => [j.jobId, j]));
  }

  private async refJobMapFromConnecteamJobs(jMap: Map<string, ConnecteamJob>): Promise<Map<number, Job>> {
    const refIds = [...new Set([...jMap.values()].map((j) => j.refJobId).filter((id): id is number => id != null))];
    if (!refIds.length) return new Map();
    const rows = await this.refJobs.find({ where: { id: In(refIds) } });
    return new Map(rows.map((r) => [r.id, r]));
  }

  private async timeClockMap(ids: number[]): Promise<Map<number, ConnecteamTimeClock>> {
    const unique = [...new Set(ids.filter((n) => Number.isFinite(n)))];
    if (!unique.length) return new Map();
    const rows = await this.timeClocks.find({ where: { timeClockId: In(unique) } });
    return new Map(rows.map((c) => [c.timeClockId, c]));
  }

  private async schedulerMap(ids: number[]): Promise<Map<number, ConnecteamScheduler>> {
    const unique = [...new Set(ids.filter((n) => Number.isFinite(n)))];
    if (!unique.length) return new Map();
    const rows = await this.schedulers.find({ where: { schedulerId: In(unique) } });
    return new Map(rows.map((s) => [s.schedulerId, s]));
  }

  private async formMap(ids: string[]): Promise<Map<string, ConnecteamForm>> {
    const unique = [...new Set(ids.map((s) => s.trim()).filter(Boolean))];
    if (!unique.length) return new Map();
    const rows = await this.forms.find({ where: { formId: In(unique) } });
    return new Map(rows.map((f) => [f.formId, f]));
  }

  private async taskBoardMap(ids: number[]): Promise<Map<number, ConnecteamTaskBoard>> {
    const unique = [...new Set(ids.filter((n) => Number.isFinite(n)))];
    if (!unique.length) return new Map();
    const rows = await this.taskBoards.find({ where: { taskBoardId: In(unique) } });
    return new Map(rows.map((b) => [b.taskBoardId, b]));
  }

  private resolveUser(userId: number, uMap: Map<number, ConnecteamUser>): ConnecteamUserSummary {
    const u = uMap.get(userId);
    return u ? this.toUserSummary(u) : this.stubUserSummary(userId);
  }

  private resolveJob(
    jobId: string | null | undefined,
    jMap: Map<string, ConnecteamJob>,
    refMap: Map<number, Job>,
  ): ConnecteamJobSummary | null {
    if (!jobId?.trim()) return null;
    const j = jMap.get(jobId);
    return j ? this.toJobSummary(j, j.refJobId != null ? refMap.get(j.refJobId) : null) : this.stubJobSummary(jobId);
  }

  async enrichTimeActivities(rows: ConnecteamTimeActivity[]) {
    const uMap = await this.userMap(rows.map((r) => r.userId));
    const jMap = await this.jobMap(rows.map((r) => r.jobId).filter((id): id is string => Boolean(id)));
    const refMap = await this.refJobMapFromConnecteamJobs(jMap);
    const cMap = await this.timeClockMap(rows.map((r) => r.timeClockId));

    return rows.map((row) => {
      const timing = this.timingFromUnixSeconds(row.startTimestamp, row.endTimestamp, row.durationMinutes);
      const job = this.resolveJob(row.jobId, jMap, refMap);
      const shiftLabel = job?.jobLabel ?? row.employeeNote?.trim() ?? 'Work shift';
      return {
        ...row,
        user: this.resolveUser(row.userId, uMap),
        job,
        timeClockName: cMap.get(row.timeClockId)?.name ?? null,
        shiftLabel,
        ...timing,
      };
    });
  }

  async enrichScheduledShifts(rows: ConnecteamScheduledShift[]) {
    const userIds = rows.flatMap((r) => parseUserIdsJson(r.assignedUserIdsJson));
    const uMap = await this.userMap(userIds);
    const jMap = await this.jobMap(rows.map((r) => r.jobId).filter((id): id is string => Boolean(id)));
    const refMap = await this.refJobMapFromConnecteamJobs(jMap);
    const sMap = await this.schedulerMap(rows.map((r) => r.schedulerId));

    return rows.map((row) => {
      const assignedUsers = parseUserIdsJson(row.assignedUserIdsJson).map((id) => this.resolveUser(id, uMap));
      const job = this.resolveJob(row.jobId, jMap, refMap);
      const timing = this.timingFromUnixSeconds(row.startTime, row.endTime);
      const shiftLabel =
        row.title?.trim() || job?.jobLabel || assignedUsers.map((u) => u.displayName).join(', ') || 'Scheduled shift';
      return {
        ...row,
        shiftLabel,
        schedulerName: sMap.get(row.schedulerId)?.name ?? null,
        job,
        assignedUsers,
        assignedUserNames: assignedUsers.map((u) => u.displayName),
        ...timing,
      };
    });
  }

  async enrichTimeOffRequests(rows: ConnecteamTimeOffRequest[]) {
    const uMap = await this.userMap(rows.map((r) => r.userId));
    return rows.map((row) => ({
      ...row,
      user: this.resolveUser(row.userId, uMap),
      dateRangeLabel: formatDateRangeLabel(row.startDate, row.endDate, row.isAllDay),
      durationLabel:
        row.durationAmount != null && row.durationUnits
          ? `${row.durationAmount} ${row.durationUnits}`
          : null,
    }));
  }

  async enrichFormSubmissions(rows: ConnecteamFormSubmission[]) {
    const uMap = await this.userMap(rows.map((r) => r.userId ?? NaN).filter(Number.isFinite));
    const fMap = await this.formMap(rows.map((r) => r.formId));
    return rows.map((row) => {
      const user = row.userId != null ? this.resolveUser(row.userId, uMap) : null;
      const form = fMap.get(row.formId);
      const answers = parseJsonObject(row.summaryJson);
      return {
        ...row,
        formName: form?.name ?? null,
        user,
        submittedByName: user?.displayName ?? null,
        submittedAtIso: unixSecondsToIso(row.submittedAt),
        answers,
      };
    });
  }

  async enrichTasks(rows: ConnecteamTask[]) {
    const userIds = rows.flatMap((r) => parseUserIdsJson(r.userIdsJson));
    const uMap = await this.userMap(userIds);
    const bMap = await this.taskBoardMap(rows.map((r) => r.taskBoardId));
    return rows.map((row) => {
      const assignedUsers = parseUserIdsJson(row.userIdsJson).map((id) => this.resolveUser(id, uMap));
      const board = bMap.get(row.taskBoardId);
      return {
        ...row,
        taskBoardName: board?.name ?? null,
        assignedUsers,
        assignedUserNames: assignedUsers.map((u) => u.displayName),
        startAt: unixSecondsToIso(row.startTime),
        dueAt: unixSecondsToIso(row.dueDate),
        taskLabel: row.title?.trim() || 'Task',
      };
    });
  }

  async enrichMessages(rows: ConnecteamMessage[]) {
    const uMap = await this.userMap(rows.map((r) => r.userId ?? NaN).filter(Number.isFinite));
    return rows.map((row) => {
      const user = row.userId != null ? this.resolveUser(row.userId, uMap) : null;
      let attachments: unknown[] | null = null;
      if (row.attachmentsJson?.trim()) {
        try {
          attachments = JSON.parse(row.attachmentsJson) as unknown[];
        } catch {
          attachments = null;
        }
      }
      return {
        ...row,
        user,
        senderName: user?.displayName ?? (row.userId != null ? `User ${row.userId}` : 'System'),
        sentAtIso: row.sentAt instanceof Date ? row.sentAt.toISOString() : String(row.sentAt),
        attachments,
      };
    });
  }

  enrichConversations(rows: ConnecteamConversation[]) {
    return rows.map((row) => ({
      ...row,
      conversationLabel: row.title?.trim() || (row.type === 'private' ? 'Direct message' : 'Conversation'),
      typeLabel: row.type?.trim() || 'chat',
      lastMessageAtIso: row.lastMessageAt instanceof Date ? row.lastMessageAt.toISOString() : null,
    }));
  }

  async enrichReportHoursByJob(
    rows: Array<{
      jobId: string | null;
      normalizedJobNumber: string | null;
      jobTitle: string | null;
      refJobId: number | null;
      totalMinutes: number;
      shiftCount: number;
    }>,
  ) {
    const jobIds = rows.map((r) => r.jobId).filter((id): id is string => Boolean(id));
    const jMap = await this.jobMap(jobIds);
    const refMap = await this.refJobMapFromConnecteamJobs(jMap);
    const extraRefIds = rows.map((r) => r.refJobId).filter((id): id is number => id != null);
    if (extraRefIds.length) {
      const missing = extraRefIds.filter((id) => !refMap.has(id));
      if (missing.length) {
        const extra = await this.refJobs.find({ where: { id: In(missing) } });
        for (const r of extra) refMap.set(r.id, r);
      }
    }

    return rows.map((r) => {
      const j = r.jobId ? jMap.get(r.jobId) : undefined;
      const refJobId = r.refJobId ?? j?.refJobId ?? null;
      const refJob = refJobId != null ? refMap.get(refJobId) : null;
      const jobLabel = j
        ? this.formatJobLabel(j)
        : r.normalizedJobNumber && r.jobTitle
          ? `${r.normalizedJobNumber} — ${r.jobTitle}`
          : r.normalizedJobNumber || r.jobTitle || r.jobId || 'Unknown job';
      return {
        ...r,
        jobLabel,
        companyLabel: j?.companyLabel ?? null,
        refJob: refJob ? this.toRefJobSummary(refJob) : null,
        totalHours: minutesToHours(r.totalMinutes) ?? 0,
      };
    });
  }

  enrichReportHoursByUser(
    rows: Array<{
      userId: number;
      firstName: string | null;
      lastName: string | null;
      email: string | null;
      totalMinutes: number;
      shiftCount: number;
    }>,
    uMap?: Map<number, ConnecteamUser>,
  ) {
    return rows.map((r) => {
      const u = uMap?.get(r.userId);
      const displayName = u
        ? this.formatUserDisplayName(u)
        : [r.firstName, r.lastName].filter(Boolean).join(' ').trim() || r.email || `User ${r.userId}`;
      return {
        ...r,
        displayName,
        initials: userInitials(r.firstName, r.lastName),
        employeeId: u?.employeeId ?? null,
        totalHours: minutesToHours(r.totalMinutes) ?? 0,
      };
    });
  }
}
