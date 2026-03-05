import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Ticket } from '../database/entities';
import { DEFAULT_PAGE_SIZE, paginate, PagedResult, PaginationQueryDto } from '../common/dto/pagination.dto';
import { TicketDetailDto } from '../common/dto/ticket-detail.dto';
import { TicketGridRowDto } from '../common/dto/ticket-grid.dto';
import { ExcelExportService } from '../common/excel-export.service';
import { mapTicketToDetail, mapTicketToGridRow } from '../common/ticket-mapper';
import { HaulerDashboardFiltersDto } from '../common/dto/filters.dto';

export interface HaulerDashboardKpisDto {
  totalTickets: number;
  uniqueTrucks: number;
  activeJobs: number;
}

export interface BillableUnitsRowDto {
  truckTypeName: string;
  totalTickets: number;
}

export interface CostCenterRowDto {
  jobName: string;
  totalTickets: number;
}

@Injectable()
export class HaulerDashboardService {
  constructor(
    @InjectRepository(Ticket)
    private readonly ticketRepo: Repository<Ticket>,
    private readonly excelExport: ExcelExportService,
  ) {}

  private applyFilters(
    qb: ReturnType<Repository<Ticket>['createQueryBuilder']>,
    filters: HaulerDashboardFiltersDto,
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
    if (filters.haulerId != null) {
      qb.andWhere(`${alias}.haulerId = :haulerId`, {
        haulerId: filters.haulerId,
      });
    }
    if (filters.jobId != null) {
      qb.andWhere(`${alias}.jobId = :jobId`, { jobId: filters.jobId });
    }
    if (filters.materialId != null) {
      qb.andWhere(`${alias}.materialId = :materialId`, {
        materialId: filters.materialId,
      });
    }
    if (filters.truckTypeId != null) {
      qb.andWhere(`${alias}.truckTypeId = :truckTypeId`, {
        truckTypeId: filters.truckTypeId,
      });
    }
    if (filters.direction && filters.direction !== 'Both') {
      qb.andWhere(`${alias}.direction = :direction`, {
        direction: filters.direction,
      });
    }
  }

  async getKpis(
    filters: HaulerDashboardFiltersDto,
  ): Promise<HaulerDashboardKpisDto> {
    const alias = 't';
    const qb = this.ticketRepo.createQueryBuilder(alias);
    this.applyFilters(qb, filters, alias);

    const totalQb = qb.clone().select('COUNT(t.id)', 'total');
    const total = parseInt((await totalQb.getRawOne<{ total: string }>())?.total ?? '0', 10);

    const uniqueTrucksQb = qb.clone().select('COUNT(DISTINCT t.truckNumber)', 'cnt');
    const uniqueRaw = await uniqueTrucksQb.getRawOne<{ cnt: string }>();
    const uniqueTrucks = parseInt(uniqueRaw?.cnt ?? '0', 10);

    const jobsQb = qb.clone().select('COUNT(DISTINCT t.jobId)', 'cnt');
    const jobsRaw = await jobsQb.getRawOne<{ cnt: string }>();
    const activeJobs = parseInt(jobsRaw?.cnt ?? '0', 10);

    return {
      totalTickets: total,
      uniqueTrucks,
      activeJobs,
    };
  }

  async getBillableUnitsSummary(
    filters: HaulerDashboardFiltersDto,
  ): Promise<BillableUnitsRowDto[]> {
    const alias = 't';
    const qb = this.ticketRepo
      .createQueryBuilder(alias)
      .select('COALESCE(truckType.name, \'Unknown\')', 'truckTypeName')
      .addSelect('COUNT(*)', 'totalTickets')
      .leftJoin(`${alias}.truckType`, 'truckType')
      .groupBy('truckType.name');
    this.applyFilters(qb, filters, alias);

    type Raw = { truckTypeName: string; totalTickets: string };
    const raw = await qb.getRawMany<Raw>();
    return raw.map((r: Raw) => ({
      truckTypeName: r.truckTypeName ?? '',
      totalTickets: parseInt(r.totalTickets, 10) || 0,
    }));
  }

  async getCostCenterSummary(
    filters: HaulerDashboardFiltersDto,
  ): Promise<CostCenterRowDto[]> {
    const alias = 't';
    const qb = this.ticketRepo
      .createQueryBuilder(alias)
      .select('job.name', 'jobName')
      .addSelect('COUNT(*)', 'totalTickets')
      .leftJoin(`${alias}.job`, 'job')
      .groupBy('job.name');
    this.applyFilters(qb, filters, alias);

    type Raw = { jobName: string; totalTickets: string };
    const raw = await qb.getRawMany<Raw>();
    return raw.map((r: Raw) => ({
      jobName: r.jobName ?? '',
      totalTickets: parseInt(r.totalTickets, 10) || 0,
    }));
  }

  async getTicketGrid(
    filters: HaulerDashboardFiltersDto,
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
    filters: HaulerDashboardFiltersDto,
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
    return this.excelExport.exportTicketGrid(rows, 'Hauler Dashboard Tickets');
  }
}
