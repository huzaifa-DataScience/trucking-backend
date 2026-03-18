import { Controller, Get, UseGuards } from '@nestjs/common';
import { LookupsService } from './lookups.service';
import { JwtAuthGuard } from '../auth/guards';

@Controller('lookups')
@UseGuards(JwtAuthGuard)
export class LookupsController {
  constructor(private readonly lookups: LookupsService) {}

  @Get('jobs')
  async getJobs() {
    return this.lookups.getJobs();
  }

  @Get('materials')
  async getMaterials() {
    return this.lookups.getMaterials();
  }

  @Get('haulers')
  async getHaulers() {
    return this.lookups.getHaulers();
  }

  @Get('external-sites')
  async getExternalSites() {
    return this.lookups.getExternalSites();
  }

  @Get('our-entities')
  async getOurEntities() {
    return this.lookups.getOurEntities();
  }

  @Get('truck-types')
  async getTruckTypes() {
    return this.lookups.getTruckTypes();
  }
}
