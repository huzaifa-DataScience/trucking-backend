import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Ticket } from '../database/entities';
import { DEFAULT_PAGE_SIZE, paginate, PagedResult, PaginationQueryDto } from '../common/dto/pagination.dto';
import { TicketDetailDto } from '../common/dto/ticket-detail.dto';
import { TicketGridRowDto } from '../common/dto/ticket-grid.dto';
import { ExcelExportService } from '../common/excel-export.service';
import { mapTicketToDetail, mapTicketToGridRow } from '../common/ticket-mapper';
import { JobDashboardFiltersDto } from '../common/dto/filters.dto';

export interface JobDashboardKpisDto {
  totalTickets: number;
  flowBalance: string; // e.g. "15 Imports / 45 Exports"
  lastActive: string | null; // ISO date of most recent ticket
}

export interface VendorSummaryRowDto {
  companyName: string;
  truckTypeName: string;
  totalTickets: number;
}

export interface MaterialSummaryRowDto {
  materialName: string;
  totalTickets: number;
}

@Injectable()
export class JobDashboardService {
  constructor(
    @InjectRepository(Ticket)
    private readonly ticketRepo: Repository<Ticket>,
    private readonly excelExport: ExcelExportService,
  ) {}

  private applyFilters(
    qb: ReturnType<Repository<Ticket>['createQueryBuilder']>,
    filters: JobDashboardFiltersDto,
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
    if (filters.jobId != null) {
      qb.andWhere(`${alias}.jobId = :jobId`, { jobId: filters.jobId });
    }
    if (filters.direction && filters.direction !== 'Both') {
      qb.andWhere(`${alias}.direction = :direction`, {
        direction: filters.direction,
      });
    }
    if (filters.entityId != null) {
      qb.leftJoin(`${alias}.job`, 'jobFilter');
      qb.andWhere('jobFilter.entityId = :entityId', { entityId: filters.entityId });
    }
  }

  async getKpis(filters: JobDashboardFiltersDto): Promise<JobDashboardKpisDto> {
    const alias = 't';
    const baseQb = () => {
      const q = this.ticketRepo.createQueryBuilder(alias);
      this.applyFilters(q, filters, alias);
      return q;
    };

    const totalQb = baseQb().select('COUNT(t.id)', 'total');
    const total = parseInt(
      (await totalQb.getRawOne<{ total: string }>())?.total ?? '0',
      10,
    );

    const importQb = baseQb()
      .select('COUNT(t.id)', 'cnt')
      .andWhere('t.direction = :dir', { dir: 'Import' });
    const imports = parseInt(
      (await importQb.getRawOne<{ cnt: string }>())?.cnt ?? '0',
      10,
    );
    const exportQb = baseQb()
      .select('COUNT(t.id)', 'cnt')
      .andWhere('t.direction = :dir', { dir: 'Export' });
    const exports = parseInt(
      (await exportQb.getRawOne<{ cnt: string }>())?.cnt ?? '0',
      10,
    );

    const lastQb = baseQb().select('MAX(t.ticketDate)', 'last');
    const lastRaw = await lastQb.getRawOne<{ last: Date | null }>();
    const lastActive = lastRaw?.last
      ? new Date(lastRaw.last).toISOString().slice(0, 10)
      : null;

    return {
      totalTickets: total,
      flowBalance: `${imports} Imports / ${exports} Exports`,
      lastActive,
    };
  }

  async getVendorSummary(
    filters: JobDashboardFiltersDto,
  ): Promise<VendorSummaryRowDto[]> {
    const alias = 't';
    const qb = this.ticketRepo
      .createQueryBuilder(alias)
      .select('hauler.companyName', 'companyName')
      .addSelect('COALESCE(truckType.name, \'\')', 'truckTypeName')
      .addSelect('COUNT(*)', 'totalTickets')
      .leftJoin(`${alias}.hauler`, 'hauler')
      .leftJoin(`${alias}.truckType`, 'truckType')
      .groupBy('hauler.companyName')
      .addGroupBy('truckType.name');
    this.applyFilters(qb, filters, alias);

    type Raw = { companyName: string; truckTypeName: string; totalTickets: string };
    const raw = await qb.getRawMany<Raw>();
    return raw.map((r: Raw) => ({
      companyName: r.companyName ?? '',
      truckTypeName: r.truckTypeName ?? '',
      totalTickets: parseInt(r.totalTickets, 10) || 0,
    }));
  }

  async getMaterialSummary(
    filters: JobDashboardFiltersDto,
  ): Promise<MaterialSummaryRowDto[]> {
    const alias = 't';
    const qb = this.ticketRepo
      .createQueryBuilder(alias)
      .select('material.name', 'materialName')
      .addSelect('COUNT(*)', 'totalTickets')
      .leftJoin(`${alias}.material`, 'material')
      .groupBy('material.name');
    this.applyFilters(qb, filters, alias);

    type Raw = { materialName: string; totalTickets: string };
    const raw = await qb.getRawMany<Raw>();
    return raw.map((r: Raw) => ({
      materialName: r.materialName ?? '',
      totalTickets: parseInt(r.totalTickets, 10) || 0,
    }));
  }

  async getTicketGrid(
    filters: JobDashboardFiltersDto,
    pagination: PaginationQueryDto,
  ): Promise<PagedResult<TicketGridRowDto>> {
    const alias = 't';
    const qb = this.ticketRepo
      .createQueryBuilder(alias)
      .leftJoinAndSelect(`${alias}.job`, 'job')
      .leftJoinAndSelect('job.ourEntity', 'ourEntity')
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
      relations: ['job', 'job.ourEntity', 'hauler', 'material', 'externalSite', 'truckType', 'photos'],
    });
    return t ? mapTicketToDetail(t) : null;
  }

  async exportTicketGrid(
    filters: JobDashboardFiltersDto,
  ): Promise<Buffer> {
    const alias = 't';
    const qb = this.ticketRepo
      .createQueryBuilder(alias)
      .leftJoinAndSelect(`${alias}.job`, 'job')
      .leftJoinAndSelect('job.ourEntity', 'ourEntity')
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
    return this.excelExport.exportTicketGrid(rows, 'Job Dashboard Tickets');
  }
}
