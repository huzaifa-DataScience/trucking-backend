import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { SitelineService } from './siteline.service';
import { SitelineReportService } from './siteline-report.service';
import { Public } from '../auth/decorators';
import { JwtAuthGuard } from '../auth/guards';

/**
 * REST API for the frontend billing view.
 * All data comes from Siteline's API (real data, not demo). Separate from job/material/hauler dashboards.
 */
@Controller('siteline')
export class SitelineController {
  constructor(
    private readonly siteline: SitelineService,
    private readonly report: SitelineReportService,
  ) {}

  /** Check if Siteline is configured (for debugging). */
  @Public()
  @Get('status')
  getStatus() {
    return {
      configured: this.siteline.isConfigured(),
      message: this.siteline.isConfigured()
        ? 'Siteline module ready'
        : 'Set SITELINE_API_URL and SITELINE_API_TOKEN in .env',
    };
  }

  /** Get current company from Siteline (real data). */
  @UseGuards(JwtAuthGuard)
  @Get('company')
  async getCompany() {
    return this.siteline.getCurrentCompany();
  }

  /** Get all contracts (with project, pay apps, SOV) from Siteline (real data). */
  @UseGuards(JwtAuthGuard)
  @Get('contracts')
  async getContracts() {
    return this.siteline.getContracts();
  }

  /** Paginated contracts list (Siteline paginatedContracts GraphQL). */
  @UseGuards(JwtAuthGuard)
  @Get('contracts/paginated')
  async getPaginatedContracts(
    @Query('month') month?: string,
    @Query('payAppStatus') payAppStatus?: string,
    @Query('contractStatus') contractStatus?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.siteline.getPaginatedContracts({
      month,
      payAppStatus,
      contractStatus,
      limit: limit ? parseInt(limit, 10) : undefined,
      cursor,
    });
  }

  /** Get a single contract by id (real data). */
  @UseGuards(JwtAuthGuard)
  @Get('contracts/:id')
  async getContract(@Param('id') id: string) {
    return this.siteline.getContract(id);
  }

  /** Get a single pay app by id (real data). */
  @UseGuards(JwtAuthGuard)
  @Get('pay-apps/:id')
  async getPayApp(@Param('id') id: string) {
    return this.siteline.getPayApp(id);
  }

  /** Aging report from synced DB: net dollars by project and days-past-due bucket. */
  @UseGuards(JwtAuthGuard)
  @Get('aging-report')
  async getAgingReport() {
    return this.report.getAgingReport();
  }

  /** Overdue aging view: pay apps with daysPastDue > 50 and netDollars > 0, including PM info. */
  @UseGuards(JwtAuthGuard)
  @Get('aging-overdue')
  async getAgingOverdue() {
    return this.report.getOverdueOver50();
  }

  /** Paginated pay apps (Siteline paginatedPayApps GraphQL). */
  @UseGuards(JwtAuthGuard)
  @Get('pay-apps/paginated')
  async getPaginatedPayApps(
    @Query('submittedInMonth') submittedInMonth?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.siteline.getPaginatedPayApps({
      submittedInMonth,
      limit: limit ? parseInt(limit, 10) : undefined,
      cursor,
    });
  }
}
