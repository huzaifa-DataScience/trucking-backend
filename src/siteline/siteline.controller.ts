import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { SitelineService } from './siteline.service';
import { SitelineReportService } from './siteline-report.service';
import { Public } from '../auth/decorators';
import { JwtAuthGuard } from '../auth/guards';

function parseBool(v: unknown): boolean | undefined {
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim().toLowerCase();
  if (s === 'true' || s === '1' || s === 'yes') return true;
  if (s === 'false' || s === '0' || s === 'no') return false;
  return undefined;
}

function parseNum(v: unknown): number | undefined {
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  if (!s) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

function parseCsv(v: unknown): string[] | undefined {
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  if (!s) return undefined;
  const parts = s
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length ? parts : undefined;
}

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
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.siteline.getPaginatedContracts({
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

  /**
   * Aging report: **default** reads `Siteline_AgingContracts` / `Siteline_AgingSummary` populated by the Siteline sync
   * cron (`agingDashboard`). `useSitelineDashboard=false` uses synced pay apps + local due-date buckets instead.
   */
  @UseGuards(JwtAuthGuard)
  @Get('aging-report')
  async getAgingReport(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('search') search?: string,
    @Query('overdueOnly') overdueOnly?: string,
    @Query('minDaysPastDue') minDaysPastDue?: string,
    @Query('maxDaysPastDue') maxDaysPastDue?: string,
    @Query('minNetDollars') minNetDollars?: string,
    @Query('maxNetDollars') maxNetDollars?: string,
    @Query('includeStatuses') includeStatuses?: string,
    @Query('excludeStatuses') excludeStatuses?: string,
    @Query('useSitelineDashboard') useSitelineDashboard?: string,
  ) {
    return this.report.getAgingReport({
      startDate,
      endDate,
      search,
      overdueOnly: parseBool(overdueOnly),
      minDaysPastDue: parseNum(minDaysPastDue),
      maxDaysPastDue: parseNum(maxDaysPastDue),
      minNetDollars: parseNum(minNetDollars),
      maxNetDollars: parseNum(maxNetDollars),
      includeStatuses: parseCsv(includeStatuses),
      excludeStatuses: parseCsv(excludeStatuses),
      useSitelineDashboard: parseBool(useSitelineDashboard),
    });
  }

  /**
   * Overdue aging view: pay apps with netDollars > 0 and days past due at least `minDaysPastDue`
   * (default 51, matching legacy "> 50 days"; pass 10, 23, etc. for a custom floor).
   */
  @UseGuards(JwtAuthGuard)
  @Get('aging-overdue')
  async getAgingOverdue(
    @Query('search') search?: string,
    @Query('overdueOnly') overdueOnly?: string,
    @Query('minDaysPastDue') minDaysPastDue?: string,
    @Query('maxDaysPastDue') maxDaysPastDue?: string,
    @Query('minNetDollars') minNetDollars?: string,
    @Query('maxNetDollars') maxNetDollars?: string,
    @Query('includeStatuses') includeStatuses?: string,
    @Query('excludeStatuses') excludeStatuses?: string,
  ) {
    return this.report.getOverdueOver50({
      search,
      overdueOnly: parseBool(overdueOnly),
      minDaysPastDue: parseNum(minDaysPastDue),
      maxDaysPastDue: parseNum(maxDaysPastDue),
      minNetDollars: parseNum(minNetDollars),
      maxNetDollars: parseNum(maxNetDollars),
      includeStatuses: parseCsv(includeStatuses),
      excludeStatuses: parseCsv(excludeStatuses),
    });
  }

  /** Paginated pay apps (Siteline paginatedPayApps GraphQL). */
  @UseGuards(JwtAuthGuard)
  @Get('pay-apps/paginated')
  async getPaginatedPayApps(
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.siteline.getPaginatedPayApps({
      limit: limit ? parseInt(limit, 10) : undefined,
      cursor,
    });
  }

  /**
   * Debug: show raw DB pay app dates and how we bucket them.
   * Use to compare with Siteline's agingDashboard buckets for a specific internal project number.
   */
  @UseGuards(JwtAuthGuard)
  @Get('debug/aging')
  async debugAging(@Query('internalProjectNumber') internalProjectNumber: string) {
    return this.report.debugAgingByInternalProjectNumber(String(internalProjectNumber ?? '').trim());
  }
}
