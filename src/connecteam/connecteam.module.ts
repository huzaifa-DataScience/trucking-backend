import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  ConnecteamAccount,
  ConnecteamForm,
  ConnecteamFormSubmission,
  ConnecteamJob,
  ConnecteamScheduledShift,
  ConnecteamScheduler,
  ConnecteamSyncState,
  ConnecteamTimeActivity,
  ConnecteamTimeClock,
  ConnecteamTimeOffRequest,
  ConnecteamUser,
  ConnecteamTaskBoard,
  ConnecteamTask,
  ConnecteamConversation,
  ConnecteamWebhookEvent,
  Job,
} from '../database/entities';
import { ConnecteamApiClient } from './connecteam-api.client';
import { ConnecteamController } from './connecteam.controller';
import { ConnecteamReportService } from './connecteam-report.service';
import { ConnecteamSyncService } from './connecteam-sync.service';
import { ConnecteamWebhookController } from './connecteam-webhook.controller';
import { ConnecteamWebhookService } from './connecteam-webhook.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ConnecteamSyncState,
      ConnecteamAccount,
      ConnecteamUser,
      ConnecteamJob,
      ConnecteamTimeClock,
      ConnecteamTimeActivity,
      ConnecteamScheduler,
      ConnecteamScheduledShift,
      ConnecteamForm,
      ConnecteamFormSubmission,
      ConnecteamTimeOffRequest,
      ConnecteamTaskBoard,
      ConnecteamTask,
      ConnecteamConversation,
      ConnecteamWebhookEvent,
      Job,
    ]),
  ],
  controllers: [ConnecteamController, ConnecteamWebhookController],
  providers: [ConnecteamApiClient, ConnecteamSyncService, ConnecteamReportService, ConnecteamWebhookService],
  exports: [ConnecteamApiClient, ConnecteamSyncService, ConnecteamReportService, ConnecteamWebhookService],
})
export class ConnecteamModule {}
