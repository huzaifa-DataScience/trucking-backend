import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ConnecteamJob, ConnecteamTimeActivity, ConnecteamUser } from '../database/entities';
import { ConnecteamDisplayService } from './connecteam-display.service';
import { normalizeConnecteamJobNumber } from './connecteam.util';

export type HoursByJobRow = {
  jobId: string | null;
  normalizedJobNumber: string | null;
  jobTitle: string | null;
  refJobId: number | null;
  totalMinutes: number;
  shiftCount: number;
  /** Distinct Connecteam users who clocked on this job. */
  workerCount: number;
};

export type HoursByUserRow = {
  userId: number;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  totalMinutes: number;
  shiftCount: number;
};

@Injectable()
export class ConnecteamReportService {
  constructor(
    @InjectRepository(ConnecteamTimeActivity)
    private readonly timeActivities: Repository<ConnecteamTimeActivity>,
    @InjectRepository(ConnecteamJob) private readonly jobs: Repository<ConnecteamJob>,
    @InjectRepository(ConnecteamUser) private readonly users: Repository<ConnecteamUser>,
    private readonly display: ConnecteamDisplayService,
  ) {}

  async hoursByJob(opts?: {
    jobId?: string;
    normalizedJobNumber?: string;
    /** Prefer this when caller has Bid.jobId → Ref_Jobs.id */
    refJobId?: number;
    limit?: number;
  }): Promise<HoursByJobRow[]> {
    const limit = Math.max(1, Math.min(500, opts?.limit ?? 100));
    const qb = this.timeActivities
      .createQueryBuilder('a')
      .leftJoin(ConnecteamJob, 'j', 'j.jobId = a.jobId')
      .select('a.jobId', 'jobId')
      .addSelect('j.normalizedJobNumber', 'normalizedJobNumber')
      .addSelect('j.title', 'jobTitle')
      .addSelect('j.refJobId', 'refJobId')
      .addSelect('SUM(COALESCE(a.durationMinutes, 0))', 'totalMinutes')
      .addSelect('COUNT(*)', 'shiftCount')
      .addSelect('COUNT(DISTINCT a.userId)', 'workerCount')
      .where('a.durationMinutes IS NOT NULL')
      .groupBy('a.jobId')
      .addGroupBy('j.normalizedJobNumber')
      .addGroupBy('j.title')
      .addGroupBy('j.refJobId')
      .orderBy('totalMinutes', 'DESC')
      .take(limit);

    if (opts?.jobId?.trim()) qb.andWhere('a.jobId = :jobId', { jobId: opts.jobId.trim() });
    if (opts?.normalizedJobNumber?.trim()) {
      // Connecteam codes are often unpadded (2726); we store/match 5-digit (02726).
      const jn =
        normalizeConnecteamJobNumber(opts.normalizedJobNumber) ||
        opts.normalizedJobNumber.trim();
      qb.andWhere('j.normalizedJobNumber = :jn', { jn });
    }
    if (opts?.refJobId != null && Number.isFinite(opts.refJobId)) {
      qb.andWhere('j.refJobId = :refJobId', { refJobId: opts.refJobId });
    }

    const rows = await qb.getRawMany<{
      jobId: string | null;
      normalizedJobNumber: string | null;
      jobTitle: string | null;
      refJobId: number | null;
      totalMinutes: string;
      shiftCount: string;
      workerCount: string;
    }>();

    return rows.map((r) => {
      const raw = r as Record<string, unknown>;
      // MSSQL/TypeORM sometimes returns odd alias casing
      const workerRaw =
        r.workerCount ?? raw.WorkerCount ?? raw.worker_count ?? raw.WORKERCOUNT;
      return {
        jobId: r.jobId,
        normalizedJobNumber: r.normalizedJobNumber,
        jobTitle: r.jobTitle,
        refJobId: r.refJobId != null ? Number(r.refJobId) : null,
        totalMinutes: Number(r.totalMinutes ?? 0),
        shiftCount: Number(r.shiftCount ?? 0),
        workerCount: Number(workerRaw ?? 0) || 0,
      };
    });
  }

  /** Distinct users who clocked on a job (same filters as hoursByJob). */
  async countWorkersForJob(opts?: {
    jobId?: string;
    normalizedJobNumber?: string;
    refJobId?: number;
  }): Promise<number> {
    const qb = this.timeActivities
      .createQueryBuilder('a')
      .leftJoin(ConnecteamJob, 'j', 'j.jobId = a.jobId')
      .select('COUNT(DISTINCT a.userId)', 'n')
      .where('a.durationMinutes IS NOT NULL');

    if (opts?.jobId?.trim()) qb.andWhere('a.jobId = :jobId', { jobId: opts.jobId.trim() });
    if (opts?.normalizedJobNumber?.trim()) {
      const jn =
        normalizeConnecteamJobNumber(opts.normalizedJobNumber) ||
        opts.normalizedJobNumber.trim();
      qb.andWhere('j.normalizedJobNumber = :jn', { jn });
    }
    if (opts?.refJobId != null && Number.isFinite(opts.refJobId)) {
      qb.andWhere('j.refJobId = :refJobId', { refJobId: opts.refJobId });
    }

    const row = await qb.getRawOne<{ n: string }>();
    return Number(row?.n ?? 0) || 0;
  }

  async enrichHoursByJob(rows: HoursByJobRow[]) {
    return this.display.enrichReportHoursByJob(rows);
  }

  async hoursByUser(opts?: { userId?: number; limit?: number }): Promise<HoursByUserRow[]> {
    const limit = Math.max(1, Math.min(500, opts?.limit ?? 100));
    const qb = this.timeActivities
      .createQueryBuilder('a')
      .leftJoin(ConnecteamUser, 'u', 'u.userId = a.userId')
      .select('a.userId', 'userId')
      .addSelect('u.firstName', 'firstName')
      .addSelect('u.lastName', 'lastName')
      .addSelect('u.email', 'email')
      .addSelect('SUM(COALESCE(a.durationMinutes, 0))', 'totalMinutes')
      .addSelect('COUNT(*)', 'shiftCount')
      .where('a.durationMinutes IS NOT NULL')
      .groupBy('a.userId')
      .addGroupBy('u.firstName')
      .addGroupBy('u.lastName')
      .addGroupBy('u.email')
      .orderBy('totalMinutes', 'DESC')
      .take(limit);

    if (opts?.userId != null && Number.isFinite(opts.userId)) {
      qb.andWhere('a.userId = :uid', { uid: opts.userId });
    }

    const rows = await qb.getRawMany<{
      userId: number;
      firstName: string | null;
      lastName: string | null;
      email: string | null;
      totalMinutes: string;
      shiftCount: string;
    }>();

    return rows.map((r) => ({
      userId: Number(r.userId),
      firstName: r.firstName,
      lastName: r.lastName,
      email: r.email,
      totalMinutes: Number(r.totalMinutes ?? 0),
      shiftCount: Number(r.shiftCount ?? 0),
    }));
  }

  async enrichHoursByUser(rows: HoursByUserRow[]) {
    const userIds = rows.map((r) => r.userId);
    const uRows = userIds.length ? await this.users.find({ where: { userId: In(userIds) } }) : [];
    const uMap = new Map(uRows.map((u) => [u.userId, u]));
    return this.display.enrichReportHoursByUser(rows, uMap);
  }
}
