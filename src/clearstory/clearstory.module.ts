import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  ClearstoryApiPayload,
  ClearstoryChangeNotification,
  ClearstoryChangeNotificationContract,
  ClearstoryCompany,
  ClearstoryContract,
  ClearstoryCor,
  ClearstoryCustomer,
  ClearstoryCustomerOffice,
  ClearstoryDivision,
  ClearstoryLabel,
  ClearstoryOffice,
  ClearstoryProject,
  ClearstoryProjectRate,
  ClearstoryRate,
  ClearstorySyncSnapshot,
  ClearstorySyncState,
  ClearstoryTag,
  ClearstoryUser,
  SitelineContract,
  SitelineAgingSummary,
  SitelineAgingContract,
} from '../database/entities';
import { ClearstoryContractComparisonService } from './clearstory-contract-comparison.service';
import { ClearstoryController } from './clearstory.controller';
import { ClearstoryTablesController } from './clearstory-tables.controller';
import { ClearstoryService } from './clearstory.service';
import { ClearstorySyncService } from './clearstory-sync.service';
import { ClearstoryTableService } from './clearstory-table.service';
import { ClearstoryCorDataQualityService } from './clearstory-cor-data-quality.service';
import { ClearstoryOfficeScopeService } from './clearstory-office-scope.service';
import { EmailTemplateModule } from '../email/email-template.module';
@Module({
  imports: [
    EmailTemplateModule,
    TypeOrmModule.forFeature([
      ClearstoryProject,
      ClearstoryCor,
      ClearstoryTag,
      ClearstorySyncState,
      ClearstoryCompany,
      ClearstoryUser,
      ClearstoryOffice,
      ClearstoryDivision,
      ClearstoryContract,
      ClearstoryCustomer,
      ClearstoryCustomerOffice,
      ClearstoryLabel,
      ClearstoryApiPayload,
      ClearstoryChangeNotification,
      ClearstoryChangeNotificationContract,
      ClearstoryRate,
      ClearstoryProjectRate,
      ClearstorySyncSnapshot,
      SitelineContract,
      SitelineAgingSummary,
      SitelineAgingContract,
    ]),
  ],
  controllers: [ClearstoryController, ClearstoryTablesController],
  providers: [
    ClearstoryService,
    ClearstorySyncService,
    ClearstoryTableService,
    ClearstoryContractComparisonService,
    ClearstoryCorDataQualityService,
    ClearstoryOfficeScopeService,
  ],
  exports: [ClearstoryContractComparisonService, ClearstoryCorDataQualityService],
})
export class ClearstoryModule {}

