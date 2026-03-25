import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppEmailTemplate } from '../database/entities';
import { EmailTemplateService } from './email-template.service';
import { SmtpOutboundService } from './smtp-outbound.service';

@Module({
  imports: [TypeOrmModule.forFeature([AppEmailTemplate])],
  providers: [EmailTemplateService, SmtpOutboundService],
  exports: [EmailTemplateService, SmtpOutboundService],
})
export class EmailTemplateModule {}
