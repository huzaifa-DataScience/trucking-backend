import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { EmailTemplateModule } from '../email/email-template.module';
import { AdminController } from './admin.controller';
import { AdminEmailTemplatesController } from './admin-email-templates.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [DatabaseModule, EmailTemplateModule],
  controllers: [AdminController, AdminEmailTemplatesController],
  providers: [AdminService],
})
export class AdminModule {}
