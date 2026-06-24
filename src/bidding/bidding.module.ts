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

/**
 * Bidding estimator module (Base Bid tab → API).
 * CRUD on `/bids`, dropdown data on `/lookups/bidding/*`, server-side calc engine.
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
      AppFile,
      BidAttachment,
      BidActivityLog,
      Job,
    ]),
  ],
  controllers: [BiddingController, BiddingLookupsController],
  providers: [
    BiddingService,
    BiddingLookupsService,
    BiddingAttachmentsService,
    BiddingActivityService,
    FileStorageService,
  ],
  exports: [BiddingService],
})
export class BiddingModule {}
