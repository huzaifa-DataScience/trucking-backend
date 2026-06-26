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
  ConnecteamMessage,
  Job,
} from '../database/entities';
import { ConnecteamApiClient } from './connecteam-api.client';
import { ConnecteamController } from './connecteam.controller';
import { ConnecteamReportService } from './connecteam-report.service';
import { ConnecteamSyncService } from './connecteam-sync.service';
import { ConnecteamWriteController } from './connecteam-write.controller';
import { ConnecteamWriteService } from './connecteam-write.service';
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
      ConnecteamMessage,
      Job,
    ]),
  ],
  controllers: [ConnecteamController, ConnecteamWebhookController, ConnecteamWriteController],
  providers: [
    ConnecteamApiClient,
    ConnecteamSyncService,
    ConnecteamReportService,
    ConnecteamWebhookService,
    ConnecteamWriteService,
  ],
  exports: [
    ConnecteamApiClient,
    ConnecteamSyncService,
    ConnecteamReportService,
    ConnecteamWebhookService,
    ConnecteamWriteService,
  ],
})
export class ConnecteamModule {}
