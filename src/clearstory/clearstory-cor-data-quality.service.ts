import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClearstoryCor, SitelineContract } from '../database/entities';
import { resolveLeadPmEmailFromFullName } from '../siteline/siteline-pm-email.util';
import { isInReviewWithTmTagViolation } from './clearstory-cor-data-quality.util';
import { mapCorToLogRow, sortCorLogRows, type CorLogRow } from './clearstory-cor-log.util';

@Injectable()
export class ClearstoryCorDataQualityService {
  constructor(
    @InjectRepository(ClearstoryCor)
    private readonly cors: Repository<ClearstoryCor>,
    @InjectRepository(SitelineContract)
    private readonly sitelineContracts: Repository<SitelineContract>,
  ) {}

  async listInReviewWithTmTagViolations(): Promise<ClearstoryCor[]> {
    const all = await this.cors.find();
    return all.filter(isInReviewWithTmTagViolation);
  }

  async jobNumberToPmEmailMap(): Promise<Map<string, string>> {
    const contracts = await this.sitelineContracts.find();
    const map = new Map<string, string>();
    for (const c of contracts) {
      const job = c.internalProjectNumber?.trim();
      const email = resolveLeadPmEmailFromFullName(c.leadPmEmail, c.leadPmName);
      if (!job || !email) continue;
      map.set(job.toLowerCase(), email.toLowerCase());
    }
    return map;
  }

  async alertRowsForPm(pmEmail: string): Promise<CorLogRow[]> {
    const violations = await this.listInReviewWithTmTagViolations();
    const jobMap = await this.jobNumberToPmEmailMap();
    const pm = pmEmail.trim().toLowerCase();
    const rows: CorLogRow[] = [];

    for (const cor of violations) {
      const job = cor.jobNumber?.trim().toLowerCase();
      if (!job) continue;
      if (jobMap.get(job) !== pm) continue;
      rows.push(mapCorToLogRow(cor, true));
    }

    return sortCorLogRows(rows);
  }

  async allAlertRows(): Promise<CorLogRow[]> {
    const violations = await this.listInReviewWithTmTagViolations();
    return sortCorLogRows(violations.map((c) => mapCorToLogRow(c, true)));
  }
}
