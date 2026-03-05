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
import { MaterialDashboardFiltersDto } from '../common/dto/filters.dto';
import { MaterialDashboardService } from './material-dashboard.service';

@Controller('material-dashboard')
export class MaterialDashboardController {
  constructor(private readonly materialDashboard: MaterialDashboardService) {}

  @Get('kpis')
  async getKpis(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('materialId') materialId?: string,
    @Query('jobId') jobId?: string,
    @Query('direction') direction?: 'Import' | 'Export' | 'Both',
  ) {
    const filters: MaterialDashboardFiltersDto = {
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      materialId: materialId ? parseInt(materialId, 10) : undefined,
      jobId: jobId ? parseInt(jobId, 10) : undefined,
      direction: direction || undefined,
    };
    return this.materialDashboard.getKpis(filters);
  }

  @Get('summary/sites')
  async getSitesSummary(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('materialId') materialId?: string,
    @Query('jobId') jobId?: string,
    @Query('direction') direction?: 'Import' | 'Export' | 'Both',
  ) {
    const filters: MaterialDashboardFiltersDto = {
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      materialId: materialId ? parseInt(materialId, 10) : undefined,
      jobId: jobId ? parseInt(jobId, 10) : undefined,
      direction: direction || undefined,
    };
    return this.materialDashboard.getSitesSummary(filters);
  }

  @Get('summary/jobs')
  async getJobsSummary(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('materialId') materialId?: string,
    @Query('jobId') jobId?: string,
    @Query('direction') direction?: 'Import' | 'Export' | 'Both',
  ) {
    const filters: MaterialDashboardFiltersDto = {
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      materialId: materialId ? parseInt(materialId, 10) : undefined,
      jobId: jobId ? parseInt(jobId, 10) : undefined,
      direction: direction || undefined,
    };
    return this.materialDashboard.getJobsSummary(filters);
  }

  @Get('tickets')
  async getTicketGrid(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('materialId') materialId?: string,
    @Query('jobId') jobId?: string,
    @Query('direction') direction?: 'Import' | 'Export' | 'Both',
    @Query('page', new DefaultValuePipe(1), new ParseIntPipe({ optional: true })) page?: number,
    @Query('pageSize', new DefaultValuePipe(50), new ParseIntPipe({ optional: true })) pageSize?: number,
  ) {
    const filters: MaterialDashboardFiltersDto = {
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      materialId: materialId ? parseInt(materialId, 10) : undefined,
      jobId: jobId ? parseInt(jobId, 10) : undefined,
      direction: direction || undefined,
    };
    return this.materialDashboard.getTicketGrid(filters, { page, pageSize });
  }

  @Get('tickets/export')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  async exportTickets(
    @Res({ passthrough: true }) res: Response,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('materialId') materialId?: string,
    @Query('jobId') jobId?: string,
    @Query('direction') direction?: 'Import' | 'Export' | 'Both',
  ) {
    const filters: MaterialDashboardFiltersDto = {
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      materialId: materialId ? parseInt(materialId, 10) : undefined,
      jobId: jobId ? parseInt(jobId, 10) : undefined,
      direction: direction || undefined,
    };
    const buffer = await this.materialDashboard.exportTicketGrid(filters);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="material-dashboard-tickets.xlsx"`,
    );
    return new StreamableFile(buffer);
  }

  @Get('tickets/detail/:ticketNumber')
  async getTicketDetail(@Param('ticketNumber') ticketNumber: string) {
    return this.materialDashboard.getTicketDetail(ticketNumber);
  }
}
