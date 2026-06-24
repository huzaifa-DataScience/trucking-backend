import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConnecteamJob, ConnecteamTimeActivity, ConnecteamUser } from '../database/entities';

export type HoursByJobRow = {
  jobId: string | null;
  normalizedJobNumber: string | null;
  jobTitle: string | null;
  refJobId: number | null;
  totalMinutes: number;
  shiftCount: number;
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
  ) {}

  async hoursByJob(opts?: {
    jobId?: string;
    normalizedJobNumber?: string;
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
      .where('a.durationMinutes IS NOT NULL')
      .groupBy('a.jobId')
      .addGroupBy('j.normalizedJobNumber')
      .addGroupBy('j.title')
      .addGroupBy('j.refJobId')
      .orderBy('totalMinutes', 'DESC')
      .take(limit);

    if (opts?.jobId?.trim()) qb.andWhere('a.jobId = :jobId', { jobId: opts.jobId.trim() });
    if (opts?.normalizedJobNumber?.trim()) {
      qb.andWhere('j.normalizedJobNumber = :jn', { jn: opts.normalizedJobNumber.trim() });
    }

    const rows = await qb.getRawMany<{
      jobId: string | null;
      normalizedJobNumber: string | null;
      jobTitle: string | null;
      refJobId: number | null;
      totalMinutes: string;
      shiftCount: string;
    }>();

    return rows.map((r) => ({
      jobId: r.jobId,
      normalizedJobNumber: r.normalizedJobNumber,
      jobTitle: r.jobTitle,
      refJobId: r.refJobId != null ? Number(r.refJobId) : null,
      totalMinutes: Number(r.totalMinutes ?? 0),
      shiftCount: Number(r.shiftCount ?? 0),
    }));
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
}
