import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Ticket } from '../database/entities';
import { HaulerDashboardController } from './hauler-dashboard.controller';
import { HaulerDashboardService } from './hauler-dashboard.service';

@Module({
  imports: [TypeOrmModule.forFeature([Ticket])],
  controllers: [HaulerDashboardController],
  providers: [HaulerDashboardService],
  exports: [HaulerDashboardService],
})
export class HaulerDashboardModule {}
