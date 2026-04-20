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
} from '../database/entities';
import { ClearstoryController } from './clearstory.controller';
import { ClearstoryTablesController } from './clearstory-tables.controller';
import { ClearstoryService } from './clearstory.service';
import { ClearstorySyncService } from './clearstory-sync.service';
import { ClearstoryTableService } from './clearstory-table.service';

@Module({
  imports: [
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
    ]),
  ],
  controllers: [ClearstoryController, ClearstoryTablesController],
  providers: [ClearstoryService, ClearstorySyncService, ClearstoryTableService],
})
export class ClearstoryModule {}

