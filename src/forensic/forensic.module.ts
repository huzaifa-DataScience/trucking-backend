import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Ticket } from '../database/entities';
import { ForensicController } from './forensic.controller';
import { ForensicService } from './forensic.service';

@Module({
  imports: [TypeOrmModule.forFeature([Ticket])],
  controllers: [ForensicController],
  providers: [ForensicService],
  exports: [ForensicService],
})
export class ForensicModule {}
