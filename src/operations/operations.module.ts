import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExternalSite, Hauler, Job, OpsDisposalRate, OpsHaulTicket, OpsHaulerRate } from '../database/entities';
import { OperationsController } from './operations.controller';
import { OperationsService } from './operations.service';

@Module({
  imports: [TypeOrmModule.forFeature([OpsHaulerRate, OpsDisposalRate, OpsHaulTicket, Job, Hauler, ExternalSite])],
  controllers: [OperationsController],
  providers: [OperationsService],
})
export class OperationsModule {}
