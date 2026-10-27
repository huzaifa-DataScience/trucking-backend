import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Office } from '../database/entities';
import { rankOffices } from './office-distance';
import { cachedReverseGeocode } from './reverse-geocode';

export type OfficeRow = { id: number; name: string; latitude: number; longitude: number };

const toRow = (o: Office): OfficeRow => ({
  id: o.id,
  name: o.name,
  latitude: Number(o.latitude),
  longitude: Number(o.longitude),
});

@Injectable()
export class OfficeService {
  constructor(@InjectRepository(Office) private readonly repo: Repository<Office>) {}

  async list(): Promise<OfficeRow[]> {
    const rows = await this.repo.find({ order: { name: 'ASC' } });
    return rows.map(toRow);
  }

  async create(input: { name: string; latitude: number; longitude: number }): Promise<OfficeRow> {
    const name = input.name.trim();
    if (!name) throw new BadRequestException('Give the office a name');
    const saved = await this.repo.save(
      this.repo.create({ name, latitude: input.latitude.toFixed(6), longitude: input.longitude.toFixed(6) }),
    );
    return toRow(saved);
  }

  async remove(id: number): Promise<void> {
    const res = await this.repo.delete({ id });
    if (!res.affected) throw new NotFoundException('Office not found');
  }

  /** For the sign-in page: offices nearest first, the one we're at (if any), and the address there. */
  async nearby(at: { latitude: number; longitude: number; accuracy: number }) {
    const [offices, address] = await Promise.all([this.list(), cachedReverseGeocode(at.latitude, at.longitude)]);
    return { ...rankOffices(offices, at), address };
  }

  async exists(id: number): Promise<boolean> {
    return (await this.repo.count({ where: { id } })) > 0;
  }
}
