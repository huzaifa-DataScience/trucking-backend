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
import { HaulerDashboardFiltersDto } from '../common/dto/filters.dto';
import { HaulerDashboardService } from './hauler-dashboard.service';

@Controller('hauler-dashboard')
export class HaulerDashboardController {
  constructor(private readonly haulerDashboard: HaulerDashboardService) {}

  @Get('kpis')
  async getKpis(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('haulerId') haulerId?: string,
    @Query('jobId') jobId?: string,
    @Query('materialId') materialId?: string,
    @Query('truckTypeId') truckTypeId?: string,
    @Query('entityId') entityId?: string,
    @Query('direction') direction?: 'Import' | 'Export' | 'Both',
  ) {
    const filters: HaulerDashboardFiltersDto = {
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      haulerId: haulerId ? parseInt(haulerId, 10) : undefined,
      jobId: jobId ? parseInt(jobId, 10) : undefined,
      materialId: materialId ? parseInt(materialId, 10) : undefined,
      truckTypeId: truckTypeId ? parseInt(truckTypeId, 10) : undefined,
      entityId: entityId ? parseInt(entityId, 10) : undefined,
      direction: direction || undefined,
    };
    return this.haulerDashboard.getKpis(filters);
  }

  @Get('summary/billable-units')
  async getBillableUnitsSummary(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('haulerId') haulerId?: string,
    @Query('jobId') jobId?: string,
    @Query('materialId') materialId?: string,
    @Query('truckTypeId') truckTypeId?: string,
    @Query('entityId') entityId?: string,
    @Query('direction') direction?: 'Import' | 'Export' | 'Both',
  ) {
    const filters: HaulerDashboardFiltersDto = {
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      haulerId: haulerId ? parseInt(haulerId, 10) : undefined,
      jobId: jobId ? parseInt(jobId, 10) : undefined,
      materialId: materialId ? parseInt(materialId, 10) : undefined,
      truckTypeId: truckTypeId ? parseInt(truckTypeId, 10) : undefined,
      entityId: entityId ? parseInt(entityId, 10) : undefined,
      direction: direction || undefined,
    };
    return this.haulerDashboard.getBillableUnitsSummary(filters);
  }

  @Get('summary/cost-center')
  async getCostCenterSummary(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('haulerId') haulerId?: string,
    @Query('jobId') jobId?: string,
    @Query('materialId') materialId?: string,
    @Query('truckTypeId') truckTypeId?: string,
    @Query('entityId') entityId?: string,
    @Query('direction') direction?: 'Import' | 'Export' | 'Both',
  ) {
    const filters: HaulerDashboardFiltersDto = {
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      haulerId: haulerId ? parseInt(haulerId, 10) : undefined,
      jobId: jobId ? parseInt(jobId, 10) : undefined,
      materialId: materialId ? parseInt(materialId, 10) : undefined,
      truckTypeId: truckTypeId ? parseInt(truckTypeId, 10) : undefined,
      entityId: entityId ? parseInt(entityId, 10) : undefined,
      direction: direction || undefined,
    };
    return this.haulerDashboard.getCostCenterSummary(filters);
  }

  @Get('tickets')
  async getTicketGrid(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('haulerId') haulerId?: string,
    @Query('jobId') jobId?: string,
    @Query('materialId') materialId?: string,
    @Query('truckTypeId') truckTypeId?: string,
    @Query('entityId') entityId?: string,
    @Query('direction') direction?: 'Import' | 'Export' | 'Both',
    @Query('page', new DefaultValuePipe(1), new ParseIntPipe({ optional: true })) page?: number,
    @Query('pageSize', new DefaultValuePipe(50), new ParseIntPipe({ optional: true })) pageSize?: number,
  ) {
    const filters: HaulerDashboardFiltersDto = {
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      haulerId: haulerId ? parseInt(haulerId, 10) : undefined,
      jobId: jobId ? parseInt(jobId, 10) : undefined,
      materialId: materialId ? parseInt(materialId, 10) : undefined,
      truckTypeId: truckTypeId ? parseInt(truckTypeId, 10) : undefined,
      entityId: entityId ? parseInt(entityId, 10) : undefined,
      direction: direction || undefined,
    };
    return this.haulerDashboard.getTicketGrid(filters, { page, pageSize });
  }

  @Get('tickets/export')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  async exportTickets(
    @Res({ passthrough: true }) res: Response,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('haulerId') haulerId?: string,
    @Query('jobId') jobId?: string,
    @Query('materialId') materialId?: string,
    @Query('truckTypeId') truckTypeId?: string,
    @Query('entityId') entityId?: string,
    @Query('direction') direction?: 'Import' | 'Export' | 'Both',
  ) {
    const filters: HaulerDashboardFiltersDto = {
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      haulerId: haulerId ? parseInt(haulerId, 10) : undefined,
      jobId: jobId ? parseInt(jobId, 10) : undefined,
      materialId: materialId ? parseInt(materialId, 10) : undefined,
      truckTypeId: truckTypeId ? parseInt(truckTypeId, 10) : undefined,
      entityId: entityId ? parseInt(entityId, 10) : undefined,
      direction: direction || undefined,
    };
    const buffer = await this.haulerDashboard.exportTicketGrid(filters);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="hauler-dashboard-tickets.xlsx"`,
    );
    return new StreamableFile(buffer);
  }

  @Get('tickets/detail/:ticketNumber')
  async getTicketDetail(@Param('ticketNumber') ticketNumber: string) {
    return this.haulerDashboard.getTicketDetail(ticketNumber);
  }
}
