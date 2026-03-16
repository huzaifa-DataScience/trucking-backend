import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ExternalSite,
  Hauler,
  Job,
  Material,
  OurEntity,
  TruckType,
} from '../database/entities';

export interface LookupItemDto {
  id: number;
  name: string;
}

@Injectable()
export class LookupsService {
  constructor(
    @InjectRepository(Job)
    private readonly jobRepo: Repository<Job>,
    @InjectRepository(Material)
    private readonly materialRepo: Repository<Material>,
    @InjectRepository(Hauler)
    private readonly haulerRepo: Repository<Hauler>,
    @InjectRepository(ExternalSite)
    private readonly siteRepo: Repository<ExternalSite>,
    @InjectRepository(OurEntity)
    private readonly ourEntityRepo: Repository<OurEntity>,
    @InjectRepository(TruckType)
    private readonly truckTypeRepo: Repository<TruckType>,
  ) {}

  async getJobs(): Promise<LookupItemDto[]> {
    const rows = await this.jobRepo.find({
      order: { name: 'ASC' },
      select: ['id', 'name'],
    });
    return rows.map((r: Job) => ({ id: r.id, name: r.name }));
  }

  async getMaterials(): Promise<LookupItemDto[]> {
    const rows = await this.materialRepo.find({
      order: { name: 'ASC' },
      select: ['id', 'name'],
    });
    return rows.map((r: Material) => ({ id: r.id, name: r.name }));
  }

  async getHaulers(): Promise<LookupItemDto[]> {
    const rows = await this.haulerRepo.find({
      order: { companyName: 'ASC' },
      select: ['id', 'companyName'],
    });
    return rows.map((r: Hauler) => ({ id: r.id, name: r.companyName }));
  }

  async getExternalSites(): Promise<LookupItemDto[]> {
    const rows = await this.siteRepo.find({
      order: { name: 'ASC' },
      select: ['id', 'name'],
    });
    return rows.map((r: ExternalSite) => ({ id: r.id, name: r.name }));
  }

  async getOurEntities(): Promise<LookupItemDto[]> {
    const rows = await this.ourEntityRepo.find({
      order: { name: 'ASC' },
      select: ['id', 'name'],
    });
    return rows.map((r: OurEntity) => ({ id: r.id, name: r.name }));
  }

  async getTruckTypes(): Promise<LookupItemDto[]> {
    const rows = await this.truckTypeRepo.find({
      order: { name: 'ASC' },
      select: ['id', 'name'],
    });
    return rows.map((r: TruckType) => ({ id: r.id, name: r.name }));
  }
}
