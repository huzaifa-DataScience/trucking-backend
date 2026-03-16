import {
  Controller,
  Get,
  Param,
  Query,
  Res,
  StreamableFile,
  Header,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { Response } from 'express';
import { JobDashboardFiltersDto } from '../common/dto/filters.dto';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { JobDashboardService } from './job-dashboard.service';

@Controller('job-dashboard')
export class JobDashboardController {
  constructor(private readonly jobDashboard: JobDashboardService) {}

  @Get('filters/options')
  async getFilterOptions() {
    // Options for Job dropdown, etc. can be added via separate endpoints if needed
    return { message: 'Use /jobs for job list' };
  }

  @Get('kpis')
  async getKpis(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('jobId') jobId?: string,
    @Query('entityId') entityId?: string,
    @Query('direction') direction?: 'Import' | 'Export' | 'Both',
  ) {
    const filters: JobDashboardFiltersDto = {
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      jobId: jobId ? parseInt(jobId, 10) : undefined,
      entityId: entityId ? parseInt(entityId, 10) : undefined,
      direction: direction || undefined,
    };
    return this.jobDashboard.getKpis(filters);
  }

  @Get('summary/vendor')
  async getVendorSummary(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('jobId') jobId?: string,
    @Query('entityId') entityId?: string,
    @Query('direction') direction?: 'Import' | 'Export' | 'Both',
  ) {
    const filters: JobDashboardFiltersDto = {
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      jobId: jobId ? parseInt(jobId, 10) : undefined,
      entityId: entityId ? parseInt(entityId, 10) : undefined,
      direction: direction || undefined,
    };
    return this.jobDashboard.getVendorSummary(filters);
  }

  @Get('summary/material')
  async getMaterialSummary(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('jobId') jobId?: string,
    @Query('entityId') entityId?: string,
    @Query('direction') direction?: 'Import' | 'Export' | 'Both',
  ) {
    const filters: JobDashboardFiltersDto = {
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      jobId: jobId ? parseInt(jobId, 10) : undefined,
      entityId: entityId ? parseInt(entityId, 10) : undefined,
      direction: direction || undefined,
    };
    return this.jobDashboard.getMaterialSummary(filters);
  }

  @Get('tickets')
  async getTicketGrid(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('jobId') jobId?: string,
    @Query('entityId') entityId?: string,
    @Query('direction') direction?: 'Import' | 'Export' | 'Both',
    @Query('page', new DefaultValuePipe(1), new ParseIntPipe({ optional: true })) page?: number,
    @Query('pageSize', new DefaultValuePipe(50), new ParseIntPipe({ optional: true })) pageSize?: number,
  ) {
    const filters: JobDashboardFiltersDto = {
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      jobId: jobId ? parseInt(jobId, 10) : undefined,
      entityId: entityId ? parseInt(entityId, 10) : undefined,
      direction: direction || undefined,
    };
    return this.jobDashboard.getTicketGrid(filters, { page, pageSize });
  }

  @Get('tickets/export')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  async exportTickets(
    @Res({ passthrough: true }) res: Response,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('jobId') jobId?: string,
    @Query('entityId') entityId?: string,
    @Query('direction') direction?: 'Import' | 'Export' | 'Both',
  ) {
    const filters: JobDashboardFiltersDto = {
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      jobId: jobId ? parseInt(jobId, 10) : undefined,
      entityId: entityId ? parseInt(entityId, 10) : undefined,
      direction: direction || undefined,
    };
    const buffer = await this.jobDashboard.exportTicketGrid(filters);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="job-dashboard-tickets.xlsx"`,
    );
    return new StreamableFile(buffer);
  }

  @Get('tickets/detail/:ticketNumber')
  async getTicketDetail(@Param('ticketNumber') ticketNumber: string) {
    return this.jobDashboard.getTicketDetail(ticketNumber);
  }
}
