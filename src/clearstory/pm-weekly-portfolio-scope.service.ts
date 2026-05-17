import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SitelineAgingContract, SitelineAgingSummary } from '../database/entities';
import { resolveLeadPmEmailFromFullName } from '../siteline/siteline-pm-email.util';
import { ClearstoryContractComparisonService } from './clearstory-contract-comparison.service';

/**
 * Job numbers in scope for PJ COR weekly report — same portfolio PMs see on the
 * weekly AR email (latest Siteline aging snapshot), excluding inactive-only comparisons.
 */
@Injectable()
export class PmWeeklyPortfolioScopeService {
  private readonly logger = new Logger(PmWeeklyPortfolioScopeService.name);

  constructor(
    @InjectRepository(SitelineAgingSummary)
    private readonly agingSummaryRepo: Repository<SitelineAgingSummary>,
    @InjectRepository(SitelineAgingContract)
    private readonly agingContractRepo: Repository<SitelineAgingContract>,
    private readonly contractComparison: ClearstoryContractComparisonService,
  ) {}

  async jobNumbersForPjCorReport(): Promise<Set<string>> {
    const latest = await this.latestAgingSummary();
    if (!latest) {
      this.logger.warn('PJ COR portfolio scope: no Siteline_AgingSummary snapshot');
      return new Set();
    }

    const agingRows = await this.agingContractRepo.find({ where: { snapshotId: latest.id } });
    const candidateJobs = new Set<string>();

    for (const row of agingRows) {
      const pmEmail = resolveLeadPmEmailFromFullName(row.leadPmEmail, row.leadPmName);
      if (!pmEmail) continue;
      const job = row.internalProjectNumber?.trim() || row.projectNumber?.trim();
      if (job) candidateJobs.add(job.toLowerCase());
    }

    const scoped = new Set<string>();
    for (const job of candidateJobs) {
      const cmp = await this.contractComparison.getByJobNumber(job);
      if (
        cmp?.comparison.status === 'inactive_clearstory' ||
        cmp?.comparison.status === 'inactive_siteline'
      ) {
        continue;
      }
      scoped.add(job);
    }

    this.logger.log(
      `PJ COR portfolio scope: snapshot=${latest.id}, pm_weekly_jobs=${candidateJobs.size}, after_active_filter=${scoped.size}`,
    );
    return scoped;
  }

  private async latestAgingSummary(): Promise<SitelineAgingSummary | null> {
    const rows = await this.agingSummaryRepo.find({ order: { id: 'DESC' }, take: 1 });
    return rows[0] ?? null;
  }
}
