import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Ticket } from '../database/entities';
import { MaterialDashboardController } from './material-dashboard.controller';
import { MaterialDashboardService } from './material-dashboard.service';

@Module({
  imports: [TypeOrmModule.forFeature([Ticket])],
  controllers: [MaterialDashboardController],
  providers: [MaterialDashboardService],
  exports: [MaterialDashboardService],
})
export class MaterialDashboardModule {}
