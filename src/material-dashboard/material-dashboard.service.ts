import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Ticket } from '../database/entities';
import { DEFAULT_PAGE_SIZE, paginate, PagedResult, PaginationQueryDto } from '../common/dto/pagination.dto';
import { TicketDetailDto } from '../common/dto/ticket-detail.dto';
import { TicketGridRowDto } from '../common/dto/ticket-grid.dto';
import { ExcelExportService } from '../common/excel-export.service';
import { mapTicketToDetail, mapTicketToGridRow } from '../common/ticket-mapper';
import { MaterialDashboardFiltersDto } from '../common/dto/filters.dto';

export interface MaterialDashboardKpisDto {
  totalTickets: number;
  topSource: string | null; // #1 External Site for Imports
  topDestination: string | null; // #1 External Site for Exports
  activeJobs: number; // distinct jobs moving this material
}

export interface SitesSummaryRowDto {
  externalSiteName: string;
  direction: string;
  totalTickets: number;
}

export interface JobsSummaryRowDto {
  jobName: string;
  direction: string;
  totalTickets: number;
}

@Injectable()
export class MaterialDashboardService {
  constructor(
    @InjectRepository(Ticket)
    private readonly ticketRepo: Repository<Ticket>,
    private readonly excelExport: ExcelExportService,
  ) {}

  private applyFilters(
    qb: ReturnType<Repository<Ticket>['createQueryBuilder']>,
    filters: MaterialDashboardFiltersDto,
    alias: string,
  ) {
    if (filters.startDate) {
      qb.andWhere(`${alias}.ticketDate >= :startDate`, {
        startDate: filters.startDate,
      });
    }
    if (filters.endDate) {
      qb.andWhere(`${alias}.ticketDate <= :endDate`, {
        endDate: filters.endDate,
      });
    }
    if (filters.materialId != null) {
      qb.andWhere(`${alias}.materialId = :materialId`, {
        materialId: filters.materialId,
      });
    }
    if (filters.jobId != null) {
      qb.andWhere(`${alias}.jobId = :jobId`, { jobId: filters.jobId });
    }
    if (filters.entityId != null) {
      qb.leftJoin(`${alias}.job`, 'jobFilter');
      qb.andWhere('jobFilter.entityId = :entityId', { entityId: filters.entityId });
    }
    if (filters.direction && filters.direction !== 'Both') {
      qb.andWhere(`${alias}.direction = :direction`, {
        direction: filters.direction,
      });
    }
  }

  async getKpis(
    filters: MaterialDashboardFiltersDto,
  ): Promise<MaterialDashboardKpisDto> {
    const alias = 't';
    const qb = this.ticketRepo
      .createQueryBuilder(alias)
      .leftJoin(`${alias}.externalSite`, 'site')
      .leftJoin(`${alias}.job`, 'job');
    this.applyFilters(qb, filters, alias);

    const totalQb = qb.clone().select('COUNT(DISTINCT t.id)', 'total');
    const total = parseInt((await totalQb.getRawOne<{ total: string }>())?.total ?? '0', 10);

    const topImportQb = this.ticketRepo
      .createQueryBuilder(alias)
      .select('site.name', 'name')
      .addSelect('COUNT(*)', 'cnt')
      .leftJoin(`${alias}.externalSite`, 'site')
      .where(`${alias}.direction = 'Import'`);
    this.applyFilters(topImportQb, filters, alias);
    topImportQb.groupBy('site.name').orderBy('cnt', 'DESC').limit(1);
    const topImport = await topImportQb.getRawOne<{ name: string }>();

    const topExportQb = this.ticketRepo
      .createQueryBuilder(alias)
      .select('site.name', 'name')
      .addSelect('COUNT(*)', 'cnt')
      .leftJoin(`${alias}.externalSite`, 'site')
      .where(`${alias}.direction = 'Export'`);
    this.applyFilters(topExportQb, filters, alias);
    topExportQb.groupBy('site.name').orderBy('cnt', 'DESC').limit(1);
    const topExport = await topExportQb.getRawOne<{ name: string }>();

    const jobsQb = qb.clone().select('COUNT(DISTINCT t.jobId)', 'cnt');
    const jobsRaw = await jobsQb.getRawOne<{ cnt: string }>();
    const activeJobs = parseInt(jobsRaw?.cnt ?? '0', 10);

    return {
      totalTickets: total,
      topSource: topImport?.name ?? null,
      topDestination: topExport?.name ?? null,
      activeJobs,
    };
  }

  async getSitesSummary(
    filters: MaterialDashboardFiltersDto,
  ): Promise<SitesSummaryRowDto[]> {
    const alias = 't';
    const qb = this.ticketRepo
      .createQueryBuilder(alias)
      .select('site.name', 'externalSiteName')
      .addSelect('t.direction', 'direction')
      .addSelect('COUNT(*)', 'totalTickets')
      .leftJoin(`${alias}.externalSite`, 'site')
      .groupBy('site.name')
      .addGroupBy('t.direction');
    this.applyFilters(qb, filters, alias);

    type Raw = { externalSiteName: string; direction: string; totalTickets: string };
    const raw = await qb.getRawMany<Raw>();
    return raw.map((r: Raw) => ({
      externalSiteName: r.externalSiteName ?? '',
      direction: r.direction ?? '',
      totalTickets: parseInt(r.totalTickets, 10) || 0,
    }));
  }

  async getJobsSummary(
    filters: MaterialDashboardFiltersDto,
  ): Promise<JobsSummaryRowDto[]> {
    const alias = 't';
    const qb = this.ticketRepo
      .createQueryBuilder(alias)
      .select('job.name', 'jobName')
      .addSelect('t.direction', 'direction')
      .addSelect('COUNT(*)', 'totalTickets')
      .leftJoin(`${alias}.job`, 'job')
      .groupBy('job.name')
      .addGroupBy('t.direction');
    this.applyFilters(qb, filters, alias);

    type Raw = { jobName: string; direction: string; totalTickets: string };
    const raw = await qb.getRawMany<Raw>();
    return raw.map((r: Raw) => ({
      jobName: r.jobName ?? '',
      direction: r.direction ?? '',
      totalTickets: parseInt(r.totalTickets, 10) || 0,
    }));
  }

  async getTicketGrid(
    filters: MaterialDashboardFiltersDto,
    pagination: PaginationQueryDto,
  ): Promise<PagedResult<TicketGridRowDto>> {
    const alias = 't';
    const qb = this.ticketRepo
      .createQueryBuilder(alias)
      .leftJoinAndSelect(`${alias}.job`, 'job')
      .leftJoinAndSelect(`${alias}.hauler`, 'hauler')
      .leftJoinAndSelect(`${alias}.material`, 'material')
      .leftJoinAndSelect(`${alias}.externalSite`, 'site')
      .leftJoinAndSelect(`${alias}.truckType`, 'truckType')
      .leftJoinAndSelect(`${alias}.photos`, 'photos')
      .orderBy(`${alias}.ticketDate`, 'DESC')
      .addOrderBy(`${alias}.createdAt`, 'DESC');
    this.applyFilters(qb, filters, alias);

    const page = Math.max(1, pagination.page ?? 1);
    const pageSize = Math.min(100, pagination.pageSize ?? DEFAULT_PAGE_SIZE);
    qb.skip((page - 1) * pageSize).take(pageSize);

    const [tickets, total] = await qb.getManyAndCount();
    const rows = tickets.map(mapTicketToGridRow);
    return paginate(rows, total, page, pageSize);
  }

  async getTicketDetail(ticketNumber: string): Promise<TicketDetailDto | null> {
    const t = await this.ticketRepo.findOne({
      where: { ticketNumber },
      relations: ['job', 'hauler', 'material', 'externalSite', 'truckType', 'photos'],
    });
    return t ? mapTicketToDetail(t) : null;
  }

  async exportTicketGrid(
    filters: MaterialDashboardFiltersDto,
  ): Promise<Buffer> {
    const alias = 't';
    const qb = this.ticketRepo
      .createQueryBuilder(alias)
      .leftJoinAndSelect(`${alias}.job`, 'job')
      .leftJoinAndSelect(`${alias}.hauler`, 'hauler')
      .leftJoinAndSelect(`${alias}.material`, 'material')
      .leftJoinAndSelect(`${alias}.externalSite`, 'site')
      .leftJoinAndSelect(`${alias}.truckType`, 'truckType')
      .leftJoinAndSelect(`${alias}.photos`, 'photos')
      .orderBy(`${alias}.ticketDate`, 'DESC')
      .addOrderBy(`${alias}.createdAt`, 'DESC');
    this.applyFilters(qb, filters, alias);

    const tickets = await qb.getMany();
    const rows = tickets.map(mapTicketToGridRow);
    return this.excelExport.exportTicketGrid(rows, 'Material Dashboard Tickets');
  }
}
