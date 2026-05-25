import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppEmailTemplate } from '../database/entities';
import { EmailTemplateService } from './email-template.service';
import { HtmlToPdfService } from './html-to-pdf.service';
import { OutboundEmailService } from './outbound-email.service';
import { SmtpOutboundService } from './smtp-outbound.service';

@Module({
  imports: [TypeOrmModule.forFeature([AppEmailTemplate])],
  providers: [EmailTemplateService, HtmlToPdfService, OutboundEmailService, SmtpOutboundService],
  exports: [EmailTemplateService, HtmlToPdfService, OutboundEmailService, SmtpOutboundService],
})
export class EmailTemplateModule {}
