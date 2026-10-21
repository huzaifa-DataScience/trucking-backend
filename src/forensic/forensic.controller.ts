import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ForensicService } from './forensic.service';
import { JwtAuthGuard } from '../auth/guards';

function intOrUndefined(raw?: string): number | undefined {
  if (raw == null || raw.trim() === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.trunc(n) : undefined;
}

@Controller('forensic')
@UseGuards(JwtAuthGuard)
export class ForensicController {
  constructor(private readonly forensic: ForensicService) {}

  /** Tab 1: Late Submission Audit – tickets entered >24h after ticket date */
  @Get('late-submission')
  async getLateSubmissionAudit(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: string,
  ) {
    // Without `page` every row is returned as before (Excel export uses it).
    if (page == null) return this.forensic.getLateSubmissionAudit(startDate, endDate);
    return this.forensic.getLateSubmissionPage(startDate, endDate, {
      page: intOrUndefined(page),
      pageSize: intOrUndefined(pageSize),
      sortBy,
      sortDir,
    });
  }

  /** Tab 2: Efficiency Outlier – cycle time vs fleet benchmark; 15% rule; peer group = Date+Job+Material+Destination */
  @Get('efficiency-outlier')
  async getEfficiencyOutlierReport(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('jobId') jobId?: string,
    @Query('materialId') materialId?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: string,
  ) {
    // Without `page` every row is returned as before (Excel export uses it).
    if (page == null) {
      return this.forensic.getEfficiencyOutlierReport(startDate, endDate, jobId, materialId);
    }
    return this.forensic.getEfficiencyOutlierPage(startDate, endDate, jobId, materialId, {
      page: intOrUndefined(page),
      pageSize: intOrUndefined(pageSize),
      sortBy,
      sortDir,
    });
  }
}
