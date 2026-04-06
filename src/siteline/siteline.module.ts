import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppSettingsModule } from '../app-settings/app-settings.module';
import { EmailTemplateModule } from '../email/email-template.module';
import { SitelineController } from './siteline.controller';
import { SitelineService } from './siteline.service';
import { SitelineSyncService } from './siteline-sync.service';
import { SitelineReportService } from './siteline-report.service';
import { SitelineOverdueEmailService } from './siteline-overdue-email.service';
import {
  SitelineContract,
  SitelinePayApp,
  SitelineAgingSummary,
  SitelineAgingContract,
} from '../database/entities';

/**
 * Separate module for Siteline billing integration.
 * Uses Siteline's GraphQL API (see docs/SITELINE_SCHEMA_REFERENCE.md) to fetch
 * real billing data (contracts, pay apps, company, SOV). Synced data is stored
 * in Siteline_Contracts and Siteline_PayApps for reporting (e.g. aging report).
 */
@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([
      SitelineContract,
      SitelinePayApp,
      SitelineAgingSummary,
      SitelineAgingContract,
    ]),
    EmailTemplateModule,
    AppSettingsModule,
  ],
  controllers: [SitelineController],
  providers: [SitelineService, SitelineSyncService, SitelineReportService, SitelineOverdueEmailService],
  exports: [SitelineService, SitelineReportService],
})
export class SitelineModule {}
