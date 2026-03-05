import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  ExternalSite,
  Hauler,
  Job,
  Material,
  TruckType,
} from '../database/entities';
import { LookupsController } from './lookups.controller';
import { LookupsService } from './lookups.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Job,
      Material,
      Hauler,
      ExternalSite,
      TruckType,
    ]),
  ],
  controllers: [LookupsController],
  providers: [LookupsService],
  exports: [LookupsService],
})
export class LookupsModule {}
