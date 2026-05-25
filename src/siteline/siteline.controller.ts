import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { SitelineService } from './siteline.service';
import { SitelineReportService } from './siteline-report.service';
import { SitelineEntityConfigService } from './siteline-entity-config.service';
import { SitelineReconciliationGapsService } from './siteline-reconciliation-gaps.service';
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
    private readonly entityConfig: SitelineEntityConfigService,
    private readonly reconciliationGaps: SitelineReconciliationGapsService,
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
