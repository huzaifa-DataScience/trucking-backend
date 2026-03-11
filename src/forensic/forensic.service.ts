import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Ticket } from '../database/entities';
import {
  LateSubmissionRowDto,
  LateSubmissionAuditResponseDto,
  EfficiencyOutlierRowDto,
} from './dto/forensic.dto';

@Injectable()
export class ForensicService {
  constructor(
    @InjectRepository(Ticket)
    private readonly ticketRepo: Repository<Ticket>,
  ) {}

  /**
   * Late Submission Audit: tickets where CreatedAt is >24 hours after TicketDate.
   * Returns KPI count (Late Tickets Found) and grid rows for Tab 1.
   */
  async getLateSubmissionAudit(
    startDate?: string,
    endDate?: string,
  ): Promise<LateSubmissionAuditResponseDto> {
    const qb = this.ticketRepo
      .createQueryBuilder('t')
      .select('t.ticketNumber', 'ticketNumber')
      .addSelect('t.ticketDate', 'ticketDate')
      .addSelect('t.createdAt', 'createdAt')
      .addSelect('t.signedBy', 'signedBy')
      .addSelect('job.name', 'jobName')
      .addSelect('hauler.companyName', 'haulerCompanyName')
      .leftJoin('t.job', 'job')
      .leftJoin('t.hauler', 'hauler')
      .where(
        't.createdAt > DATEADD(hour, 24, CAST(t.ticketDate AS datetime2))',
      );

    if (startDate) {
      qb.andWhere('t.ticketDate >= :startDate', { startDate });
    }
    if (endDate) {
      qb.andWhere('t.ticketDate <= :endDate', { endDate });
    }
    qb.orderBy('t.createdAt', 'DESC');

    const rows = await qb.getRawMany<{
      ticketNumber: string;
      ticketDate: Date;
      createdAt: Date;
      signedBy: string | null;
      jobName: string;
      haulerCompanyName: string;
    }>();

    type Raw = {
      ticketNumber: string;
      ticketDate: Date;
      createdAt: Date;
      signedBy: string | null;
      jobName: string;
      haulerCompanyName: string;
    };
    const items: LateSubmissionRowDto[] = rows.map((r: Raw) => {
      const ticketDate = r.ticketDate ? new Date(r.ticketDate) : new Date(0);
      const createdAt = r.createdAt ? new Date(r.createdAt) : new Date(0);
      const diffMs = createdAt.getTime() - ticketDate.getTime();
      const diffHours = diffMs / (1000 * 60 * 60);
      const diffDays = Math.floor(diffHours / 24);
      const lagTime =
        diffDays >= 1
          ? `+${diffDays} Day${diffDays !== 1 ? 's' : ''}`
          : `+${Math.round(diffHours)} Hours`;

      return {
        ticketNumber: r.ticketNumber,
        ticketDate: ticketDate.toISOString().slice(0, 10),
        systemEntryDate: createdAt.toISOString(),
        lagTime,
        signedBy: r.signedBy ?? null,
        jobName: r.jobName ?? '',
        haulerCompanyName: r.haulerCompanyName ?? '',
      };
    });
    return { lateTicketsFound: items.length, items };
  }

  /**
   * Efficiency Outlier Report (Tab 2).
   * Peer group: Same Date + Same Job + Same Material + Same Destination.
   * Exclude single-load trucks from benchmark; show them as "Single Load" (grey).
   * Cycle time = Duration / (TicketCount - 1) in minutes. Red flag if > 15% slower than fleet benchmark.
   */
  async getEfficiencyOutlierReport(
    startDate?: string,
    endDate?: string,
    jobId?: string,
    materialId?: string,
  ): Promise<EfficiencyOutlierRowDto[]> {
    const qb = this.ticketRepo
      .createQueryBuilder('t')
      .select('t.ticketDate', 'ticketDate')
      .addSelect('t.truckNumber', 'truckNumber')
      .addSelect('t.createdAt', 'createdAt')
      .addSelect('job.name', 'jobName')
      .addSelect('material.name', 'materialName')
      .addSelect('site.name', 'siteName')
      .addSelect('hauler.companyName', 'haulerCompanyName')
      .leftJoin('t.job', 'job')
      .leftJoin('t.material', 'material')
      .leftJoin('t.externalSite', 'site')
      .leftJoin('t.hauler', 'hauler')
      .where('t.truckNumber IS NOT NULL')
      .andWhere("t.truckNumber != ''");

    if (startDate) {
      qb.andWhere('t.ticketDate >= :startDate', { startDate });
    }
    if (endDate) {
      qb.andWhere('t.ticketDate <= :endDate', { endDate });
    }
    if (jobId) {
      qb.andWhere('t.jobId = :jobId', { jobId: parseInt(jobId, 10) });
    }
    if (materialId) {
      qb.andWhere('t.materialId = :materialId', {
        materialId: parseInt(materialId, 10),
      });
    }
    qb.orderBy('t.ticketDate').addOrderBy('t.createdAt');

    type TicketRow = {
      ticketDate: Date;
      truckNumber: string;
      createdAt: Date;
      jobName: string;
      materialName: string;
      siteName: string;
      haulerCompanyName: string;
    };
    const tickets = await qb.getRawMany<TicketRow>();

    // Peer group: Date + Job + Material + Destination (site)
    type RouteKey = string;
    const routeTickets = new Map<
      RouteKey,
      {
        date: Date;
        jobName: string;
        materialName: string;
        siteName: string;
        tickets: TicketRow[];
      }
    >();

    for (const t of tickets) {
      const d = t.ticketDate ? new Date(t.ticketDate) : new Date(0);
      const dateStr = d.toISOString().slice(0, 10);
      const key: RouteKey = `${dateStr}|${t.jobName ?? ''}|${t.materialName ?? ''}|${t.siteName ?? ''}`;
      if (!routeTickets.has(key)) {
        routeTickets.set(key, {
          date: d,
          jobName: t.jobName ?? '',
          materialName: t.materialName ?? '',
          siteName: t.siteName ?? '',
          tickets: [],
        });
      }
      routeTickets.get(key)!.tickets.push(t);
    }

    const result: EfficiencyOutlierRowDto[] = [];

    for (const [, route] of routeTickets) {
      const byTruck = new Map<string, { tickets: TicketRow[]; haulerName: string }>();
      for (const t of route.tickets) {
        const tn = t.truckNumber ?? '';
        if (!byTruck.has(tn)) {
          byTruck.set(tn, { tickets: [], haulerName: t.haulerCompanyName ?? '' });
        }
        byTruck.get(tn)!.tickets.push(t);
      }

      // Step 1 & 2: Per truck: Duration = Max(CreatedAt)-Min(CreatedAt), IndividualAvg = Duration/(TicketCount-1) in minutes.
      const truckMetrics: Array<{
        truckNumber: string;
        haulerName: string;
        totalTickets: number;
        firstAt: Date;
        lastAt: Date;
        durationMs: number;
        myAvgCycleMinutes: number | null; // null if single load
      }> = [];

      for (const [truckNumber, data] of byTruck) {
        const count = data.tickets.length;
        const sorted = [...data.tickets].sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        );
        const firstAt = new Date(sorted[0].createdAt);
        const lastAt = new Date(sorted[sorted.length - 1].createdAt);
        const durationMs = lastAt.getTime() - firstAt.getTime();
        const myAvgCycleMinutes =
          count > 1 ? durationMs / (1000 * 60 * (count - 1)) : null;

        truckMetrics.push({
          truckNumber,
          haulerName: data.haulerName,
          totalTickets: count,
          firstAt,
          lastAt,
          durationMs,
          myAvgCycleMinutes,
        });
      }

      // Step 3: Group benchmark = AVG(IndividualAvg) for trucks with TicketCount >= 2
      const cycleTimesForBenchmark = truckMetrics
        .filter((m) => m.myAvgCycleMinutes != null)
        .map((m) => m.myAvgCycleMinutes!);
      const fleetBenchmark =
        cycleTimesForBenchmark.length > 0
          ? cycleTimesForBenchmark.reduce((a, b) => a + b, 0) /
            cycleTimesForBenchmark.length
          : 0;

      const routeLabel = `${route.materialName} → ${route.siteName}`;

      const formatDuration = (ms: number) => {
        const totalMins = Math.round(ms / (1000 * 60));
        const h = Math.floor(totalMins / 60);
        const m = totalMins % 60;
        return `${h}:${m.toString().padStart(2, '0')}`;
      };

      for (const m of truckMetrics) {
        let status: 'Green' | 'RED' | 'Single Load';
        let statusLabel: string;
        if (m.totalTickets === 1) {
          status = 'Single Load';
          statusLabel = 'Single Load';
        } else if (
          fleetBenchmark > 0 &&
          m.myAvgCycleMinutes! > fleetBenchmark * 1.15
        ) {
          status = 'RED';
          statusLabel = 'SLOW (>15%)';
        } else {
          status = 'Green';
          statusLabel = 'Within 15%';
        }

        result.push({
          date: route.date.toISOString().slice(0, 10),
          jobName: route.jobName,
          route: routeLabel,
          truckNumber: m.truckNumber,
          haulerName: m.haulerName,
          totalTickets: m.totalTickets,
          workDuration: formatDuration(m.durationMs),
          myAvgCycle:
            m.myAvgCycleMinutes != null
              ? Math.round(m.myAvgCycleMinutes * 100) / 100
              : 0,
          fleetBenchmark: Math.round(fleetBenchmark * 100) / 100,
          status,
          statusLabel,
        });
      }
    }

    // Sort: descending by Status (RED first, then Single Load, then Green)
    const statusOrder = (s: string) =>
      s === 'RED' ? 0 : s === 'Single Load' ? 1 : 2;
    result.sort(
      (a, b) =>
        statusOrder(a.status) - statusOrder(b.status) ||
        a.date.localeCompare(b.date) ||
        a.jobName.localeCompare(b.jobName) ||
        a.truckNumber.localeCompare(b.truckNumber),
    );
    return result;
  }
}
