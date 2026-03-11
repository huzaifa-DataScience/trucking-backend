import { Controller, Get, Query } from '@nestjs/common';
import { ForensicService } from './forensic.service';

@Controller('forensic')
export class ForensicController {
  constructor(private readonly forensic: ForensicService) {}

  /** Tab 1: Late Submission Audit – tickets entered >24h after ticket date */
  @Get('late-submission')
  async getLateSubmissionAudit(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.forensic.getLateSubmissionAudit(startDate, endDate);
  }

  /** Tab 2: Efficiency Outlier – cycle time vs fleet benchmark; 15% rule; peer group = Date+Job+Material+Destination */
  @Get('efficiency-outlier')
  async getEfficiencyOutlierReport(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('jobId') jobId?: string,
    @Query('materialId') materialId?: string,
  ) {
    return this.forensic.getEfficiencyOutlierReport(
      startDate,
      endDate,
      jobId,
      materialId,
    );
  }
}
