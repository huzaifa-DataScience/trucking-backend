import { Controller, Get, NotFoundException, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards';
import { ClearstoryMockService } from './clearstory-mock.service';
import {
  ClearstoryBallInCourt,
  ClearstoryProjectSummaryDto,
  ClearstoryStatusBucket,
  ClearstoryTaskDto,
} from './dto/clearstory.dto';

function parseIntParam(v: string): number {
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n)) throw new NotFoundException('Invalid id');
  return n;
}

@UseGuards(JwtAuthGuard)
@Controller('clearstory-mock')
export class ClearstoryMockController {
  constructor(private readonly mock: ClearstoryMockService) {}

  @Get('projects')
  listProjects(
    @Query('search') search?: string,
    @Query('division') division?: string,
    @Query('customer') customer?: string,
  ) {
    let projects = this.mock.listProjects();
    const q = (search ?? '').trim().toLowerCase();
    if (q) {
      projects = projects.filter((p) => {
        const hay = `${p.name ?? ''} ${p.jobNumber ?? ''} ${p.customerName ?? ''}`.toLowerCase();
        return hay.includes(q);
      });
    }
    if (division) projects = projects.filter((p) => (p.division ?? '') === division);
    if (customer) projects = projects.filter((p) => (p.customerName ?? '') === customer);
    return { projects };
  }

  @Get('projects/:id/summary')
  getProjectSummary(@Param('id') id: string): ClearstoryProjectSummaryDto {
    const pid = parseIntParam(id);
    const project = this.mock.getProject(pid);
    if (!project) throw new NotFoundException('Project not found');
    const cors = this.mock.listCors(pid);

    const totals = {
      approved: 0,
      atp: 0,
      inReview: 0,
      placeholder: 0,
      void: 0,
    };
    for (const co of cors) {
      const amt = Number(co.latestVersion?.grandTotal ?? 0);
      if (!Number.isFinite(amt)) continue;
      switch (co.statusBucket) {
        case 'APPROVED':
          totals.approved += amt;
          break;
        case 'ATP':
          totals.atp += amt;
          break;
        case 'IN_REVIEW':
          totals.inReview += amt;
          break;
        case 'PLACEHOLDER':
          totals.placeholder += amt;
          break;
        case 'VOID':
          totals.void += amt;
          break;
      }
    }

    const revisedContractValue =
      project.baseContractValue +
      totals.approved +
      totals.atp +
      totals.inReview +
      totals.placeholder;

    return {
      project,
      totals,
      revisedContractValue,
      reconciliation: {
        redFlag: false,
        clearstory: revisedContractValue,
        siteline: null,
        foundation: null,
        lastCheckedAt: new Date().toISOString(),
        notes: [],
      },
    };
  }

  @Get('projects/:id/cors')
  listProjectCors(
    @Param('id') id: string,
    @Query('bucket') bucket?: string,
    @Query('ballInCourt') ballInCourt?: string,
    @Query('stage') stage?: string,
  ) {
    const pid = parseIntParam(id);
    const project = this.mock.getProject(pid);
    if (!project) throw new NotFoundException('Project not found');
    let items = this.mock.listCors(pid);
    if (bucket) items = items.filter((i) => i.statusBucket === (bucket as ClearstoryStatusBucket));
    if (ballInCourt)
      items = items.filter((i) => i.ballInCourt === (ballInCourt as ClearstoryBallInCourt));
    if (stage) items = items.filter((i) => (i.stage ?? '') === stage);
    return { projectId: pid, items };
  }

  @Get('tasks')
  listTasks(): { generatedAt: string; items: ClearstoryTaskDto[] } {
    // Stub: frontend can wire a “task” view now; later we’ll populate from reconciliation + aging.
    return {
      generatedAt: new Date().toISOString(),
      items: [
        {
          id: 'task-1',
          type: 'RECONCILIATION_MISMATCH',
          severity: 'RED_FLAG',
          title: 'Contract value mismatch',
          projectJobNumber: 'JOB-1001',
          ageDays: 9,
          detail: 'Clearstory value does not match Siteline/Foundation (mock).',
        },
      ],
    };
  }
}

