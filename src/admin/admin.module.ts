import { Module } from '@nestjs/common';
import { AppSettingsModule } from '../app-settings/app-settings.module';
import { DatabaseModule } from '../database/database.module';
import { EmailTemplateModule } from '../email/email-template.module';
import { AdminController } from './admin.controller';
import { AdminEmailTemplatesController } from './admin-email-templates.controller';
import { AdminOverdueEmailSettingsController } from './admin-overdue-email-settings.controller';
import { AdminClearstoryGapAlertSettingsController } from './admin-clearstory-gap-alert-settings.controller';
import { AdminSitelineJobsController } from './admin-siteline-jobs.controller';
import { AdminSmtpTestController } from './admin-smtp-test.controller';
import { SitelineModule } from '../siteline/siteline.module';
import { AdminService } from './admin.service';

@Module({
  imports: [DatabaseModule, EmailTemplateModule, AppSettingsModule, SitelineModule],
  controllers: [
    AdminController,
    AdminEmailTemplatesController,
    AdminOverdueEmailSettingsController,
    AdminClearstoryGapAlertSettingsController,
    AdminSitelineJobsController,
    AdminSmtpTestController,
  ],
  providers: [AdminService],
})
export class AdminModule {}
