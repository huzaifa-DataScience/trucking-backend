import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClearstoryModule } from '../clearstory/clearstory.module';
import {
  ClearstoryCor,
  ClearstoryProject,
  Job,
  SitelineAgingContract,
  SitelineAgingSummary,
  SitelineContract,
  SitelinePayApp,
} from '../database/entities';
import { ProjectFinancialsController } from './project-financials.controller';
import { ProjectFinancialsService } from './project-financials.service';

/** Awarded-job financials. Joins Siteline + Clearstory; no new vendor tables. */
@Module({
  imports: [
    ClearstoryModule,
    TypeOrmModule.forFeature([
      SitelineContract,
      SitelinePayApp,
      SitelineAgingSummary,
      SitelineAgingContract,
      ClearstoryProject,
      ClearstoryCor,
      Job,
    ]),
  ],
  controllers: [ProjectFinancialsController],
  providers: [ProjectFinancialsService],
  exports: [ProjectFinancialsService],
})
export class ProjectFinancialsModule {}
