import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WfsSnapshot } from '../database/entities/wfs-snapshot.entity';
import { WfsStaticItem } from '../database/entities/wfs-static-item.entity';
import { WfsController } from './wfs.controller';
import { WfsService } from './wfs.service';

/** Company financial health (WFS). Reads FoundationData AR/AP + PlaidDB; knobs in Wfs_StaticItems. */
@Module({
  imports: [TypeOrmModule.forFeature([WfsStaticItem, WfsSnapshot])],
  controllers: [WfsController],
  providers: [WfsService],
  exports: [WfsService],
})
export class WfsModule {}
