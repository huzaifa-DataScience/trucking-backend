import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Bid,
  BidContent,
  BidCalcSnapshot,
  BidTeam,
  BidWageRate,
  BidState,
  BidProjectType,
  BidBuildingType,
  BidPreference,
  BidPayrollBurden,
  BidSpecSystem,
  BidSpecMaterial,
  BidSpecArea,
  BidHelperMap,
  BidMikeCsvRow,
  BidSpecLine,
  BidItemCatalog,
  AppFile,
  BidAttachment,
  BidActivityLog,
  Job,
} from '../database/entities';
import { FileStorageService } from '../files/file-storage.service';
import { BiddingController } from './bidding.controller';
import { BiddingService } from './bidding.service';
import { BiddingAttachmentsService } from './bidding-attachments.service';
import { BiddingActivityService } from './bidding-activity.service';
import { BiddingLookupsController } from './bidding-lookups.controller';
import { BiddingLookupsService } from './bidding-lookups.service';
import { SpecsController } from './specs/specs.controller';
import { SpecsService } from './specs/specs.service';

/**
 * Bidding estimator module (Base Bid tab → API).
 * CRUD on `/bids`, dropdown data on `/lookups/bidding/*`, server-side calc engine.
 * Specs Plumb phase 1: Mike CSV rows + Spec lines rollup.
 * See docs/BIDDING_DATABASE_DESIGN.md and BIDDING_BACKEND_STRUCTURE.md.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Bid,
      BidContent,
      BidCalcSnapshot,
      BidTeam,
      BidWageRate,
      BidState,
      BidProjectType,
      BidBuildingType,
      BidPreference,
      BidPayrollBurden,
      BidSpecSystem,
      BidSpecMaterial,
      BidSpecArea,
      BidHelperMap,
      BidMikeCsvRow,
      BidSpecLine,
      BidItemCatalog,
      AppFile,
      BidAttachment,
      BidActivityLog,
      Job,
    ]),
  ],
  controllers: [BiddingController, BiddingLookupsController, SpecsController],
  providers: [
    BiddingService,
    BiddingLookupsService,
    BiddingAttachmentsService,
    BiddingActivityService,
    SpecsService,
    FileStorageService,
  ],
  exports: [BiddingService, SpecsService],
})
export class BiddingModule {}
