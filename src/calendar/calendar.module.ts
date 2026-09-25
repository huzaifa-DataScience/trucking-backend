import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Bid,
  BidTeam,
  CalendarEvent,
  ConnecteamScheduledShift,
  ConnecteamTask,
  ConnecteamTimeActivity,
  ConnecteamTimeOffRequest,
  ConnecteamUser,
  User,
} from '../database/entities';
import { CalendarController } from './calendar.controller';
import { CalendarService } from './calendar.service';

/**
 * Personal calendar — see docs/CALENDAR.md. Reads existing bid / Connecteam
 * mirrors; only custom events are stored here (`Calendar_Events`).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Bid,
      BidTeam,
      CalendarEvent,
      ConnecteamScheduledShift,
      ConnecteamTask,
      ConnecteamTimeActivity,
      ConnecteamTimeOffRequest,
      ConnecteamUser,
      User,
    ]),
  ],
  controllers: [CalendarController],
  providers: [CalendarService],
})
export class CalendarModule {}
