import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { SitelineService } from './siteline.service';
import { SitelineReportService, type BillingPageOpts } from './siteline-report.service';
import { SitelineEntityConfigService, SITELINE_ENTITY_IDS } from './siteline-entity-config.service';
import { SitelineReconciliationGapsService } from './siteline-reconciliation-gaps.service';
import { SitelineProjectDetailService } from './siteline-project-detail.service';
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

/** `1,2,3` → known company ids only, in the given order (default: all three). */
function parseEntityIds(v: unknown): number[] {
  const known = SITELINE_ENTITY_IDS as readonly number[];
  const ids = (parseCsv(v) ?? []).map(Number).filter((n) => known.includes(n));
  return ids.length ? [...new Set(ids)] : [...known];
}

function billingPageOpts(
  page?: string,
  pageSize?: string,
  sortBy?: string,
  sortDir?: string,
  all?: string,
  fields?: string,
): BillingPageOpts {
  const allRows = parseBool(all) === true;
  return {
    page: parseNum(page),
    pageSize: parseNum(pageSize),
    sortBy: sortBy?.trim() || undefined,
    sortDir: sortDir === 'desc' ? 'desc' : 'asc',
    all: allRows,
    navOnly: allRows && fields === 'nav',
  };
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
    private readonly entityConfig: SitelineEntityConfigService,
    private readonly reconciliationGaps: SitelineReconciliationGapsService,
    private readonly projectDetail: SitelineProjectDetailService,
  ) {}

  /** Check if Siteline is configured (for debugging). */
  @Public()
  @Get('status')
  getStatus() {
    const diagnostics = this.siteline.getConnectionDiagnostics();
    const hints: string[] = [];
    if (diagnostics.dotEnvTokenMatchesLoaded === false) {
      hints.push(
        'SITELINE_API_TOKEN in .env does not match what the app loaded — process.env overrides .env (shell/Docker/IDE). Unset the variable in the environment or update it there.',
      );
    }
    if (diagnostics.dotEnvUrlMatchesLoaded === false) {
      hints.push(
        'SITELINE_API_URL in .env differs from loaded URL — align process env with Postman (often https://api-external.siteline.com).',
      );
    }
    return {
      ...diagnostics,
      hints,
      message: diagnostics.configured
        ? hints.length
          ? 'Siteline is configured but env precedence or URL may be wrong — see hints.'
          : 'Siteline module ready'
        : 'Set SITELINE_API_URL and SITELINE_API_TOKEN in .env',
    };
  }

  /**
   * Lookup: Ref_OurEntities.EntityID → Siteline company UUID/name (tokens stay in .env).
   * Refreshed from `currentCompany` on sync boot and aging/contract cron.
   */
  @UseGuards(JwtAuthGuard)
  @Get('entity-config')
  async getEntityConfig() {
    return this.entityConfig.listConfigs();
  }

  /** Re-fetch Siteline `currentCompany` for all entities and update `Siteline_EntityConfig`. */
  @UseGuards(JwtAuthGuard)
  @Post('entity-config/refresh')
  async refreshEntityConfig() {
    return this.entityConfig.refreshAllCompanies();
  }

  /** Get current company from Siteline (real data). Optional `entityId` uses that entity's token. */
  @UseGuards(JwtAuthGuard)
  @Get('company')
  async getCompany(@Query('entityId') entityId?: string) {
    const id = parseNum(entityId);
    if (id != null && this.entityConfig.isEntityConfigured(id)) {
      return this.siteline.getCurrentCompany(this.entityConfig.getTokenForEntity(id));
    }
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

  /** Get a single contract by id — **lean** Siteline payload (`ContractSummary`: id, totals, numbers, project name). For full pay apps/SOV use sync DB tables or extend API. */
  @UseGuards(JwtAuthGuard)
  @Get('contracts/:id')
  async getContract(@Param('id') id: string) {
    return this.siteline.getContract(id);
  }

  /**
   * Billing project page: one Siteline contract with its pay apps, PM, days-to-paid,
   * and the Clearstory project (matched by job number) with its change orders. Synced data only.
   */
  @UseGuards(JwtAuthGuard)
  @Get('projects/:contractId')
  async getProjectDetail(@Param('contractId') contractId: string) {
    return this.projectDetail.getDetail(contractId);
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
    @Query('entityId') entityId?: string,
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
      entityId: parseNum(entityId),
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
   * Overdue aging view from latest `Siteline_AgingContracts` (default minDaysPastDue 51 → AR past 50 days).
   */
  @UseGuards(JwtAuthGuard)
  @Get('aging-overdue')
  async getAgingOverdue(
    @Query('entityId') entityId?: string,
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
      entityId: parseNum(entityId),
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

  /**
   * Billing A/R aging table, one page at a time. `entityIds` = companies to merge (default all three);
   * same filters as `aging-report`. Returns the page plus `totals` / `summary` for every matching row.
   * `all=1` returns every row (CSV export); `all=1&fields=nav` only contract id + project name.
   */
  @UseGuards(JwtAuthGuard)
  @Get('aging-report/page')
  async getAgingReportPage(
    @Query('entityIds') entityIds?: string,
    @Query('search') search?: string,
    @Query('overdueOnly') overdueOnly?: string,
    @Query('minDaysPastDue') minDaysPastDue?: string,
    @Query('maxDaysPastDue') maxDaysPastDue?: string,
    @Query('minNetDollars') minNetDollars?: string,
    @Query('maxNetDollars') maxNetDollars?: string,
    @Query('includeStatuses') includeStatuses?: string,
    @Query('excludeStatuses') excludeStatuses?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: string,
    @Query('all') all?: string,
    @Query('fields') fields?: string,
  ) {
    return this.report.getAgingReportPage(
      parseEntityIds(entityIds),
      {
        search,
        overdueOnly: parseBool(overdueOnly),
        minDaysPastDue: parseNum(minDaysPastDue),
        maxDaysPastDue: parseNum(maxDaysPastDue),
        minNetDollars: parseNum(minNetDollars),
        maxNetDollars: parseNum(maxNetDollars),
        includeStatuses: parseCsv(includeStatuses),
        excludeStatuses: parseCsv(excludeStatuses),
      },
      billingPageOpts(page, pageSize, sortBy, sortDir, all, fields),
    );
  }

  /** Billing Past due table, one page at a time (same idea as `aging-report/page`). */
  @UseGuards(JwtAuthGuard)
  @Get('aging-overdue/page')
  async getAgingOverduePage(
    @Query('entityIds') entityIds?: string,
    @Query('search') search?: string,
    @Query('overdueOnly') overdueOnly?: string,
    @Query('minDaysPastDue') minDaysPastDue?: string,
    @Query('maxDaysPastDue') maxDaysPastDue?: string,
    @Query('minNetDollars') minNetDollars?: string,
    @Query('maxNetDollars') maxNetDollars?: string,
    @Query('includeStatuses') includeStatuses?: string,
    @Query('excludeStatuses') excludeStatuses?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: string,
    @Query('all') all?: string,
    @Query('fields') fields?: string,
  ) {
    return this.report.getAgingOverduePage(
      parseEntityIds(entityIds),
      {
        search,
        overdueOnly: parseBool(overdueOnly),
        minDaysPastDue: parseNum(minDaysPastDue),
        maxDaysPastDue: parseNum(maxDaysPastDue),
        minNetDollars: parseNum(minNetDollars),
        maxNetDollars: parseNum(maxNetDollars),
        includeStatuses: parseCsv(includeStatuses),
        excludeStatuses: parseCsv(excludeStatuses),
      },
      billingPageOpts(page, pageSize, sortBy, sortDir, all, fields),
    );
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

  /**
   * Siteline billing rows with no usable Clearstory comparison (for Billings UI + ops).
   */
  @UseGuards(JwtAuthGuard)
  @Get('reconciliation/gaps')
  async getReconciliationGaps(@Query('entityId') entityId?: string) {
    const result = await this.reconciliationGaps.findGaps(parseNum(entityId));
    return {
      items: result.items,
      evaluatedAt: result.evaluatedAt,
      entityId: result.entityId,
      entityName: result.entityName,
    };
  }
}
