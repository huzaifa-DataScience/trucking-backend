import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Ticket } from '../database/entities';
import { JobDashboardController } from './job-dashboard.controller';
import { JobDashboardService } from './job-dashboard.service';

@Module({
  imports: [TypeOrmModule.forFeature([Ticket])],
  controllers: [JobDashboardController],
  providers: [JobDashboardService],
  exports: [JobDashboardService],
})
export class JobDashboardModule {}
