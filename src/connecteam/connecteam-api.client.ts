import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import fetch from 'node-fetch';
import { dedupeByKey } from './connecteam-batch.util';

export type ConnecteamPaging = { offset?: number; total?: number };

export type ConnecteamMe = { companyName: string; companyId: string };

export type ConnecteamApiUser = {
  userId: number;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phoneNumber?: string | null;
  userType?: string | null;
  isArchived?: boolean;
  profilePictureUrl?: string | null;
  createdAt?: number;
  modifiedAt?: number;
  lastLogin?: number;
  customFields?: Array<{ name?: string; type?: string; value?: unknown }>;
};

export type ConnecteamApiJob = {
  jobId: string;
  title?: string | null;
  code?: string | null;
  description?: string | null;
  color?: string | null;
  isDeleted?: boolean;
  customFields?: Array<{ name?: string; type?: string; value?: unknown }>;
  gps?: { address?: string | null; latitude?: number | null; longitude?: number | null } | null;
};

export type ConnecteamApiTimeClock = { id: number; name: string; isArchived?: boolean };

export type ConnecteamApiShift = {
  id: string;
  start?: { timestamp?: number; timezone?: string } | null;
  end?: { timestamp?: number; timezone?: string } | null;
  jobId?: string | null;
  subJobId?: string | null;
  employeeNote?: string | null;
  managerNote?: string | null;
  createdAt?: number;
  modifiedAt?: number;
  isAutoClockOut?: boolean;
};

export type ConnecteamApiScheduler = {
  schedulerId: number;
  name: string;
  isArchived?: boolean;
  timezone?: string | null;
};

export type ConnecteamApiScheduledShift = {
  id: string;
  title?: string;
  jobId?: string | null;
  startTime?: number;
  endTime?: number;
  timezone?: string;
  isOpenShift?: boolean;
  isPublished?: boolean;
  assignedUserIds?: number[];
  locationData?: { gps?: { address?: string | null } | null } | null;
};

export type ConnecteamApiForm = {
  formId?: string;
  id?: string;
  name?: string | null;
  isArchived?: boolean;
};

export type ConnecteamApiFormSubmission = {
  formSubmissionId?: string;
  id?: string;
  userId?: number | null;
  submittingUserId?: number | null;
  submittingTimestamp?: number;
  submissionTimestamp?: number;
  submittedAt?: number;
  status?: string | null;
  answers?: unknown;
};

export type ConnecteamApiTaskBoard = {
  id: number;
  name: string;
  isArchived?: boolean;
};

export type ConnecteamApiTask = {
  id: string;
  title?: string | null;
  status?: string | null;
  type?: string | null;
  startTime?: number | null;
  dueDate?: number | null;
  userIds?: number[];
  labelIds?: string[];
  isArchived?: boolean;
  description?: Array<{ type?: string; html?: string }>;
};

export type ConnecteamApiConversation = {
  id: string;
  title?: string | null;
  type?: string | null;
  conversationSource?: string | null;
};

export type ConnecteamApiTimeOffRequest = {
  id: string;
  userId: number;
  policyTypeId?: string | null;
  status: string;
  isAllDay?: boolean;
  startDate?: string;
  endDate?: string;
  startTime?: string | null;
  endTime?: string | null;
  timezone?: string | null;
  duration?: { units?: string; amount?: number } | null;
  employeeNote?: string | null;
  managerNote?: string | null;
  timeClockId?: number | null;
};

@Injectable()
export class ConnecteamApiClient {
  private readonly logger = new Logger(ConnecteamApiClient.name);

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(this.apiKey());
  }

  async getMe(): Promise<ConnecteamMe> {
    const body = await this.getJson<{ companyName?: string; companyId?: string }>('/me');
    return { companyName: String(body.companyName ?? ''), companyId: String(body.companyId ?? '') };
  }

  async listAllUsers(pageSize = 100): Promise<ConnecteamApiUser[]> {
    const rows = await this.paginate<ConnecteamApiUser>(
      (offset, limit) => `/users/v1/users?limit=${limit}&offset=${offset}`,
      (data) => (data.users as ConnecteamApiUser[] | undefined) ?? [],
      pageSize,
    );
    return dedupeByKey(rows, (u) => String(u.userId));
  }

  async listAllJobs(pageSize = 100): Promise<ConnecteamApiJob[]> {
    const rows = await this.paginate<ConnecteamApiJob>(
      (offset, limit) => `/jobs/v1/jobs?limit=${limit}&offset=${offset}`,
      (data) => (data.jobs as ConnecteamApiJob[] | undefined) ?? [],
      pageSize,
    );
    return dedupeByKey(rows, (j) => j.jobId);
  }

  async listTimeClocks(): Promise<ConnecteamApiTimeClock[]> {
    const data = await this.getJson<{ timeClocks?: ConnecteamApiTimeClock[] }>('/time-clock/v1/time-clocks');
    return data.timeClocks ?? [];
  }

  async listShifts(
    timeClockId: number,
    startDate: string,
    endDate: string,
  ): Promise<Array<{ userId: number; shift: ConnecteamApiShift }>> {
    const qs = new URLSearchParams({ startDate, endDate, activityTypes: 'shift' });
    const data = await this.getJson<{
      timeActivitiesByUsers?: Array<{ userId: number; shifts?: ConnecteamApiShift[] }>;
    }>(`/time-clock/v1/time-clocks/${timeClockId}/time-activities?${qs.toString()}`);

    const out: Array<{ userId: number; shift: ConnecteamApiShift }> = [];
    for (const row of data.timeActivitiesByUsers ?? []) {
      for (const shift of row.shifts ?? []) {
        if (!shift?.id) continue;
        out.push({ userId: row.userId, shift });
      }
    }
    return out;
  }

  async listSchedulers(): Promise<ConnecteamApiScheduler[]> {
    const data = await this.getJson<{ schedulers?: ConnecteamApiScheduler[] }>('/scheduler/v1/schedulers');
    return data.schedulers ?? [];
  }

  async listSchedulerShifts(
    schedulerId: number,
    startTime: number,
    endTime: number,
    pageSize = 100,
  ): Promise<ConnecteamApiScheduledShift[]> {
    const rows = await this.paginate<ConnecteamApiScheduledShift>(
      (offset, limit) =>
        `/scheduler/v1/schedulers/${schedulerId}/shifts?startTime=${startTime}&endTime=${endTime}&limit=${limit}&offset=${offset}`,
      (data) => (data.shifts as ConnecteamApiScheduledShift[] | undefined) ?? [],
      pageSize,
    );
    return dedupeByKey(rows, (s) => s.id);
  }

  async listAllForms(pageSize = 100): Promise<ConnecteamApiForm[]> {
    const rows = await this.paginate<ConnecteamApiForm>(
      (offset, limit) => `/forms/v1/forms?limit=${limit}&offset=${offset}`,
      (data) => (data.forms as ConnecteamApiForm[] | undefined) ?? [],
      pageSize,
    );
    return dedupeByKey(rows, (f) => String(f.formId ?? f.id ?? ''));
  }

  async listFormSubmissions(
    formId: string,
    submittingStartTimestamp: number,
    submittingEndTimestamp: number,
    pageSize = 100,
  ): Promise<ConnecteamApiFormSubmission[]> {
    const qs = new URLSearchParams({
      submittingStartTimestamp: String(submittingStartTimestamp),
      submittingEndTimestamp: String(submittingEndTimestamp),
    });
    const rows = await this.paginate<ConnecteamApiFormSubmission>(
      (offset, limit) =>
        `/forms/v1/forms/${encodeURIComponent(formId)}/form-submissions?${qs.toString()}&limit=${limit}&offset=${offset}`,
      (data) => (data.formSubmissions as ConnecteamApiFormSubmission[] | undefined) ?? [],
      pageSize,
    );
    return dedupeByKey(rows, (s) => String(s.formSubmissionId ?? s.id ?? ''));
  }

  async listTaskBoards(pageSize = 100): Promise<ConnecteamApiTaskBoard[]> {
    const rows = await this.paginate<ConnecteamApiTaskBoard>(
      (offset, limit) => `/tasks/v1/taskboards?limit=${limit}&offset=${offset}`,
      (data) => (data.taskBoards as ConnecteamApiTaskBoard[] | undefined) ?? [],
      pageSize,
    );
    return dedupeByKey(rows, (b) => String(b.id));
  }

  async listTasks(taskBoardId: number, pageSize = 100): Promise<ConnecteamApiTask[]> {
    const rows = await this.paginate<ConnecteamApiTask>(
      (offset, limit) =>
        `/tasks/v1/taskboards/${taskBoardId}/tasks?limit=${limit}&offset=${offset}`,
      (data) => (data.tasks as ConnecteamApiTask[] | undefined) ?? [],
      pageSize,
    );
    return dedupeByKey(rows, (t) => t.id);
  }

  async listConversations(pageSize = 100): Promise<ConnecteamApiConversation[]> {
    const rows = await this.paginate<ConnecteamApiConversation>(
      (offset, limit) => `/chat/v1/conversations?limit=${limit}&offset=${offset}`,
      (data) => (data.conversations as ConnecteamApiConversation[] | undefined) ?? [],
      pageSize,
    );
    return dedupeByKey(rows, (c) => c.id);
  }

  async listTimeOffRequests(
    startDate: string,
    endDate: string,
    statuses: string[] = ['approved', 'pending', 'denied'],
    pageSize = 100,
  ): Promise<ConnecteamApiTimeOffRequest[]> {
    const statusQs = statuses.map((s) => `statuses=${encodeURIComponent(s)}`).join('&');
    const rows = await this.paginate<ConnecteamApiTimeOffRequest>(
      (offset, limit) =>
        `/time-off/v1/requests?startDate=${startDate}&endDate=${endDate}&${statusQs}&limit=${limit}&offset=${offset}`,
      (data) => (data.requests as ConnecteamApiTimeOffRequest[] | undefined) ?? [],
      pageSize,
    );
    return dedupeByKey(rows, (r) => r.id);
  }

  private apiKey(): string {
    return (this.config.get<string>('CONNECTEAM_API_KEY') ?? '').trim();
  }

  private baseUrl(): string {
    return (this.config.get<string>('CONNECTEAM_API_BASE_URL') ?? 'https://api.connecteam.com').replace(/\/$/, '');
  }

  private async getJson<T>(path: string): Promise<T> {
    const key = this.apiKey();
    if (!key) throw new Error('CONNECTEAM_API_KEY is not set');
    const url = `${this.baseUrl()}${path.startsWith('/') ? path : `/${path}`}`;
    const res = await fetch(url, { headers: { accept: 'application/json', 'X-API-KEY': key } });
    return this.parseJson<T>(res, path);
  }

  private async parseJson<T>(res: Awaited<ReturnType<typeof fetch>>, path: string): Promise<T> {
    const text = await res.text();
    let parsed: { data?: T; detail?: unknown; error?: string } = {};
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      parsed = {};
    }
    if (!res.ok) {
      const msg =
        typeof parsed.error === 'string'
          ? parsed.error
          : JSON.stringify(parsed.detail ?? text).slice(0, 500);
      this.logger.warn(`Connecteam GET ${path} → ${res.status}: ${msg}`);
      throw new Error(`Connecteam API ${res.status}: ${msg}`);
    }
    return (parsed.data ?? parsed) as T;
  }

  private async paginate<T>(
    pathFn: (offset: number, limit: number) => string,
    pick: (data: Record<string, unknown>) => T[],
    pageSize: number,
  ): Promise<T[]> {
    const all: T[] = [];
    let offset = 0;

    for (let guard = 0; guard < 500; guard++) {
      const path = pathFn(offset, pageSize);
      const key = this.apiKey();
      if (!key) throw new Error('CONNECTEAM_API_KEY is not set');
      const url = `${this.baseUrl()}${path}`;
      const res = await fetch(url, { headers: { accept: 'application/json', 'X-API-KEY': key } });
      const json = (await res.json()) as { data?: Record<string, unknown>; paging?: ConnecteamPaging };
      if (!res.ok) throw new Error(`Connecteam API ${res.status} on ${path}`);

      const batch = pick((json.data ?? {}) as Record<string, unknown>);
      if (!batch.length) break;
      all.push(...batch);

      const next = json.paging?.offset;
      const total = json.paging?.total;
      if (batch.length < pageSize) break;
      if (next == null || next === offset) break;
      if (total != null && all.length >= total) break;
      offset = next;
    }

    return all;
  }
}
