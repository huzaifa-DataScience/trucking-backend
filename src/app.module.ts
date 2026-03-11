import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { CommonModule } from './common/common.module';
import { DatabaseModule } from './database/database.module';
import { SeedModule } from './database/seed/seed.module';
import { ForensicModule } from './forensic/forensic.module';
import { HaulerDashboardModule } from './hauler-dashboard/hauler-dashboard.module';
import { JobDashboardModule } from './job-dashboard/job-dashboard.module';
import { LookupsModule } from './lookups/lookups.module';
import { MaterialDashboardModule } from './material-dashboard/material-dashboard.module';
import { SitelineModule } from './siteline/siteline.module';
import { TicketsModule } from './tickets/tickets.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    AuthModule,
    AdminModule,
    CommonModule,
    SeedModule,
    LookupsModule,
    JobDashboardModule,
    MaterialDashboardModule,
    HaulerDashboardModule,
    ForensicModule,
    SitelineModule,
    TicketsModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
