import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  TrimbleLineItemRawExport,
  TrimbleProject,
  TrimbleProjectLineItem,
  TrimbleSyncState,
} from '../database/entities';
import { TrimbleApiClient } from './trimble-api.client';
import { TrimbleController } from './trimble.controller';
import { TrimbleLineItemsApiService } from './trimble-line-items-api.service';
import { TrimbleLineItemIngestService } from './trimble-line-item-ingest.service';
import { TrimbleSyncService } from './trimble-sync.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TrimbleProject,
      TrimbleLineItemRawExport,
      TrimbleProjectLineItem,
      TrimbleSyncState,
    ]),
  ],
  controllers: [TrimbleController],
  providers: [
    TrimbleApiClient,
    TrimbleLineItemsApiService,
    TrimbleLineItemIngestService,
    TrimbleSyncService,
  ],
  exports: [TrimbleApiClient, TrimbleSyncService],
})
export class TrimbleModule {}
