import { Module } from '@nestjs/common';
import { AppSettingsModule } from '../app-settings/app-settings.module';
import { DatabaseModule } from '../database/database.module';
import { EmailTemplateModule } from '../email/email-template.module';
import { AdminController } from './admin.controller';
import { AdminEmailTemplatesController } from './admin-email-templates.controller';
import { AdminOverdueEmailSettingsController } from './admin-overdue-email-settings.controller';
import { AdminSmtpTestController } from './admin-smtp-test.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [DatabaseModule, EmailTemplateModule, AppSettingsModule],
  controllers: [
    AdminController,
    AdminEmailTemplatesController,
    AdminOverdueEmailSettingsController,
    AdminSmtpTestController,
  ],
  providers: [AdminService],
})
export class AdminModule {}
