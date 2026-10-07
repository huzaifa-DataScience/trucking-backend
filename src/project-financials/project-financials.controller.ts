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
  ) {
    return this.pf.listJobs(filters({ entityId, pm, search, view, alert }));
  }

  @Get('jobs')
  jobs(
    @Query('entityId') entityId?: string,
    @Query('pm') pm?: string,
    @Query('search') search?: string,
    @Query('view') view?: string,
    @Query('alert') alert?: string,
  ) {
    return this.pf.listJobs(filters({ entityId, pm, search, view, alert }));
  }

  @Get('jobs/:jobNumber')
  job(@Param('jobNumber') jobNumber: string) {
    return this.pf.getJob(decodeURIComponent(jobNumber));
  }
}
