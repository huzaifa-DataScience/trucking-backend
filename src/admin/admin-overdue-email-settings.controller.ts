import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { Roles } from '../auth/decorators';
import { Role } from '../database/entities';
import { AppSettingsService } from '../app-settings/app-settings.service';
import { UpdateOverdueEmailSendingDto } from './dto/update-overdue-email-sending.dto';

/**
 * Admin toggle for Siteline overdue lead-PM emails (cron).
 * Env OVERDUE_EMAIL_ENABLED must still be true (master); this is the in-app switch.
 */
@Controller('admin/settings/overdue-email-sending')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Admin)
export class AdminOverdueEmailSettingsController {
  constructor(private readonly appSettings: AppSettingsService) {}

  @Get()
  async getStatus() {
    return this.appSettings.getOverdueEmailSendingStatus();
  }

  @Patch()
  async setEnabled(@Body() body: UpdateOverdueEmailSendingDto) {
    await this.appSettings.setOverdueEmailSendingEnabled(body.enabled);
    return this.appSettings.getOverdueEmailSendingStatus();
  }
}
