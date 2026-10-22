import type { PfPageOpts } from './project-financials-paging';
import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards';
import { SITELINE_ENTITY_IDS } from '../siteline/siteline-entity-config.service';
import { PfListFilters, ProjectFinancialsService } from './project-financials.service';

function parseEntityId(raw?: string): number | undefined {
  if (raw == null || raw.trim() === '') return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n)) return undefined;
  const id = Math.trunc(n);
  return (SITELINE_ENTITY_IDS as readonly number[]).includes(id) ? id : undefined;
}

function parseAlert(raw?: string): PfListFilters['alert'] {
  if (raw === 'fix' || raw === 'not_in_siteline' || raw === 'any') return raw;
  return undefined;
}

/** Page / sort query for the Job book and BOM tables. */
function pageOpts(page?: string, pageSize?: string, sortBy?: string, sortDir?: string): PfPageOpts {
  const num = (v?: string) => (v != null && v.trim() !== '' && Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : undefined);
  return { page: num(page), pageSize: num(pageSize), sortBy: sortBy?.trim() || undefined, sortDir: sortDir === 'desc' ? 'desc' : 'asc' };
}

function filters(q: {
  entityId?: string;
  pm?: string;
  search?: string;
  view?: string;
  alert?: string;
}): PfListFilters {
  return {
    entityId: parseEntityId(q.entityId),
    pm: q.pm,
    search: q.search,
    view: q.view === 'all' ? 'all' : 'active',
    alert: parseAlert(q.alert),
  };
}

@Controller('project-financials')
@UseGuards(JwtAuthGuard)
export class ProjectFinancialsController {
  constructor(private readonly pf: ProjectFinancialsService) {}

  @Get('meta')
  meta() {
    return this.pf.meta();
  }

  @Get('filters')
  filtersList() {
    return this.pf.filters();
  }

  @Get('summary')
  summary(
    @Query('entityId') entityId?: string,
    @Query('pm') pm?: string,
    @Query('search') search?: string,
    @Query('view') view?: string,
    @Query('alert') alert?: string,
  ) {
    return this.pf.summary(filters({ entityId, pm, search, view, alert }));
  }

  /** Excel Tracking Info BOM — same rows as /jobs, paint `bom`. */
  @Get('bom')
  bom(
    @Query('entityId') entityId?: string,
    @Query('pm') pm?: string,
    @Query('search') search?: string,
    @Query('view') view?: string,
    @Query('alert') alert?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: string,
  ) {
    const f = filters({ entityId, pm, search, view, alert });
    // Without `page` every job is returned as before; with it, one page sorted on the server.
    if (page == null) return this.pf.listJobs(f);
    return this.pf.listJobsPage(f, 'bom', pageOpts(page, pageSize, sortBy, sortDir));
  }

  @Get('jobs')
  jobs(
    @Query('entityId') entityId?: string,
    @Query('pm') pm?: string,
    @Query('search') search?: string,
    @Query('view') view?: string,
    @Query('alert') alert?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: string,
  ) {
    const f = filters({ entityId, pm, search, view, alert });
    // Without `page` every job is returned as before; with it, one page sorted on the server.
    if (page == null) return this.pf.listJobs(f);
    return this.pf.listJobsPage(f, 'jobs', pageOpts(page, pageSize, sortBy, sortDir));
  }

  @Get('jobs/:jobNumber')
  job(@Param('jobNumber') jobNumber: string) {
    return this.pf.getJob(decodeURIComponent(jobNumber));
  }
}
