import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Driver,
  ExternalSite,
  Hauler,
  Job,
  Material,
  OurEntity,
  Photo,
  Ticket,
  TruckType,
} from '../entities';
import { SeedService } from './seed.service';
import { UsersModule } from '../../users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      OurEntity,
      Job,
      Material,
      Hauler,
      ExternalSite,
      TruckType,
      Driver,
      Ticket,
      Photo,
    ]),
    UsersModule,
  ],
  providers: [SeedService],
  exports: [SeedService],
})
export class SeedModule {}
