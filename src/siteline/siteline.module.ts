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
import { SitelinePmWeeklyReportService } from './siteline-pm-weekly-report.service';
import { ClearstoryModule } from '../clearstory/clearstory.module';
import {
  SitelineContract,
  SitelinePayApp,
  SitelineAgingSummary,
  SitelineAgingContract,
} from '../database/entities';

/**
 * Separate module for Siteline billing integration.
 * Uses Siteline's GraphQL API (see docs/SITELINE_SCHEMA_REFERENCE.md) to fetch
 * real billing data (contracts, pay apps, company, SOV). Cron sync uses
 * `paginatedPayApps` + optional `paginatedContracts` (ACTIVE) discovery, then `contract(id)` hydrate into `Siteline_Contracts` and `Siteline_PayApps`.
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
    ClearstoryModule,
  ],
  controllers: [SitelineController],
  providers: [
    SitelineService,
    SitelineSyncService,
    SitelineReportService,
    SitelineOverdueEmailService,
    SitelinePmWeeklyReportService,
  ],
  exports: [SitelineService, SitelineReportService],
})
export class SitelineModule {}
