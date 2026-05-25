import { Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { Roles } from '../auth/decorators';
import { Role } from '../database/entities';
import { SitelineClearstoryGapAlertService } from '../siteline/siteline-clearstory-gap-alert.service';

@Controller('admin/jobs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Admin)
export class AdminSitelineJobsController {
  constructor(private readonly gapAlerts: SitelineClearstoryGapAlertService) {}

  @Post('siteline-clearstory-gap-alert/run')
  async runGapAlert() {
    return this.gapAlerts.runGapAlertJob();
  }
}
