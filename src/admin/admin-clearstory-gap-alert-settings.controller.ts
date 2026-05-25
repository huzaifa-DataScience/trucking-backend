import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { Roles } from '../auth/decorators';
import { Role } from '../database/entities';
import { AppSettingsService } from '../app-settings/app-settings.service';
import { UpdateOverdueEmailSendingDto } from './dto/update-overdue-email-sending.dto';

@Controller('admin/settings/siteline-clearstory-gap-alert')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Admin)
export class AdminClearstoryGapAlertSettingsController {
  constructor(private readonly appSettings: AppSettingsService) {}

  @Get()
  async getStatus() {
    return this.appSettings.getSitelineClearstoryGapAlertStatus();
  }

  @Patch()
  async setEnabled(@Body() body: UpdateOverdueEmailSendingDto) {
    await this.appSettings.setSitelineClearstoryGapAlertEnabled(body.enabled);
    return this.appSettings.getSitelineClearstoryGapAlertStatus();
  }
}
