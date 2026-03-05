import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Ticket } from '../database/entities';
import { LateSubmissionRowDto } from './dto/forensic.dto';
import { EfficiencyOutlierRowDto } from './dto/forensic.dto';

@Injectable()
export class ForensicService {
  constructor(
    @InjectRepository(Ticket)
    private readonly ticketRepo: Repository<Ticket>,
  ) {}

  /**
   * Late Submission Audit: tickets where CreatedAt is >24 hours after TicketDate.
   */
  async getLateSubmissionAudit(
    startDate?: string,
    endDate?: string,
  ): Promise<LateSubmissionRowDto[]> {
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
    return rows.map((r: Raw) => {
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
        systemDate: createdAt.toISOString(),
        lagTime,
        signedBy: r.signedBy ?? null,
        jobName: r.jobName ?? '',
        haulerCompanyName: r.haulerCompanyName ?? '',
      };
    });
  }

  /**
   * Efficiency Outlier Report: group by Date + Job + Destination (route),
   * compute fleet avg loads per truck, then per-truck metrics.
   */
  async getEfficiencyOutlierReport(
    startDate?: string,
    endDate?: string,
  ): Promise<EfficiencyOutlierRowDto[]> {
    // Raw query approach: get all tickets in range with job/site, then compute in memory
    // for flexibility across SQL Server versions. Alternative: use raw SQL with GROUP BY.
    const qb = this.ticketRepo
      .createQueryBuilder('t')
      .select('t.ticketDate', 'ticketDate')
      .addSelect('t.truckNumber', 'truckNumber')
      .addSelect('t.createdAt', 'createdAt')
      .addSelect('job.name', 'jobName')
      .addSelect('site.name', 'siteName')
      .leftJoin('t.job', 'job')
      .leftJoin('t.externalSite', 'site')
      .where('t.truckNumber IS NOT NULL')
      .andWhere("t.truckNumber != ''");

    if (startDate) {
      qb.andWhere('t.ticketDate >= :startDate', { startDate });
    }
    if (endDate) {
      qb.andWhere('t.ticketDate <= :endDate', { endDate });
    }
    qb.orderBy('t.ticketDate').addOrderBy('t.createdAt');

    type TicketRow = {
      ticketDate: Date;
      truckNumber: string;
      createdAt: Date;
      jobName: string;
      siteName: string;
    };
    const tickets = await qb.getRawMany<TicketRow>();

    // Group by route: date (date only) + job + site
    type RouteKey = string;
    const routeTickets = new Map<
      RouteKey,
      { date: Date; jobName: string; siteName: string; tickets: TicketRow[] }
    >();

    for (const t of tickets) {
      const d = t.ticketDate ? new Date(t.ticketDate) : new Date(0);
      const dateStr = d.toISOString().slice(0, 10);
      const key: RouteKey = `${dateStr}|${t.jobName ?? ''}|${t.siteName ?? ''}`;
      if (!routeTickets.has(key)) {
        routeTickets.set(key, {
          date: d,
          jobName: t.jobName ?? '',
          siteName: t.siteName ?? '',
          tickets: [],
        });
      }
      routeTickets.get(key)!.tickets.push(t);
    }

    const result: EfficiencyOutlierRowDto[] = [];

    for (const [, route] of routeTickets) {
      const byTruck = new Map<string, { tickets: TicketRow[] }>();
      for (const t of route.tickets) {
        const tn = t.truckNumber ?? '';
        if (!byTruck.has(tn)) byTruck.set(tn, { tickets: [] });
        byTruck.get(tn)!.tickets.push(t);
      }

      const truckCount = byTruck.size;
      const totalLoads = route.tickets.length;
      const fleetAvgLoads =
        truckCount > 0 ? Math.round((totalLoads / truckCount) * 100) / 100 : 0;

      for (const [truckNumber, data] of byTruck) {
        const loads = data.tickets.length;
        const sorted = [...data.tickets].sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        );
        const first = sorted[0]?.createdAt ? new Date(sorted[0].createdAt) : null;
        const last = sorted[sorted.length - 1]?.createdAt
          ? new Date(sorted[sorted.length - 1].createdAt)
          : null;
        const impliedHours =
          first && last
            ? (last.getTime() - first.getTime()) / (1000 * 60 * 60)
            : 0;
        const loadsPerHour =
          impliedHours > 0 ? Math.round((loads / impliedHours) * 100) / 100 : 0;

        const formatTime = (d: Date) =>
          d.toTimeString().slice(0, 5); // HH:MM

        result.push({
          date: route.date.toISOString().slice(0, 10),
          jobName: route.jobName,
          routeName: route.siteName,
          truckNumber,
          fleetAvgLoads,
          thisTruckLoads: loads,
          firstTicketTime: first ? formatTime(first) : '',
          lastTicketTime: last ? formatTime(last) : '',
          impliedHours: Math.round(impliedHours * 100) / 100,
          loadsPerHour,
        });
      }
    }

    result.sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.jobName.localeCompare(b.jobName) ||
        a.truckNumber.localeCompare(b.truckNumber),
    );
    return result;
  }
}
