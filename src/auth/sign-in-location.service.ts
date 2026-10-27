import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserSignInLocation } from '../database/entities';
import type { SignInLocationDto } from './dto/login.dto';
import { OfficeService } from './office.service';
import { cachedReverseGeocode } from './reverse-geocode';

export type SignInLocationRow = {
  id: number;
  userId: number;
  name: string;
  email: string;
  officeName: string | null;
  /** The office's exact spot, when the person confirmed an office. */
  officeLatitude: number | null;
  officeLongitude: number | null;
  address: string | null;
  latitude: number;
  longitude: number;
  accuracyM: number;
  floor: string;
  signedInAt: string;
};

@Injectable()
export class SignInLocationService {
  private readonly log = new Logger(SignInLocationService.name);

  constructor(
    @InjectRepository(UserSignInLocation)
    private readonly repo: Repository<UserSignInLocation>,
    private readonly offices: OfficeService,
  ) {}

  /** Saves where someone signed in. A save failure is logged, not thrown, so nobody is locked out by it. */
  async record(userId: number, loc: SignInLocationDto): Promise<void> {
    try {
      // An office removed meanwhile (or a made-up id) is saved as "not at an office".
      const officeId = loc.officeId != null && (await this.offices.exists(loc.officeId)) ? loc.officeId : null;
      const res = await this.repo.insert({
        userId,
        officeId,
        latitude: loc.latitude.toFixed(6),
        longitude: loc.longitude.toFixed(6),
        accuracyM: Math.round(loc.accuracy * 10) / 10,
        floor: loc.floor.trim(),
      });
      // Look the address up after sign-in so a slow lookup never holds the login up.
      const id = res.identifiers[0]?.id as number | undefined;
      if (id != null) void this.fillAddress(id, loc.latitude, loc.longitude);
    } catch (e) {
      this.log.error(`Could not save sign-in location for user ${userId}: ${(e as Error).message}`);
    }
  }

  private async fillAddress(id: number, latitude: number, longitude: number): Promise<void> {
    try {
      const address = await cachedReverseGeocode(latitude, longitude);
      if (address) await this.repo.update({ id }, { address });
    } catch (e) {
      this.log.warn(`Address lookup failed for sign-in ${id}: ${(e as Error).message}`);
    }
  }

  /** Newest first. */
  async list(limit = 500): Promise<SignInLocationRow[]> {
    const rows = await this.repo.find({
      relations: { user: true, office: true },
      order: { createdAt: 'DESC', id: 'DESC' },
      take: Math.min(Math.max(limit, 1), 2000),
    });
    return rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      name: [r.user?.firstName, r.user?.lastName].filter(Boolean).join(' ').trim() || r.user?.email || `User #${r.userId}`,
      email: r.user?.email ?? '',
      officeName: r.office?.name ?? null,
      officeLatitude: r.office ? Number(r.office.latitude) : null,
      officeLongitude: r.office ? Number(r.office.longitude) : null,
      address: r.address ?? null,
      latitude: Number(r.latitude),
      longitude: Number(r.longitude),
      accuracyM: r.accuracyM,
      floor: r.floor,
      signedInAt: (r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt)).toISOString(),
    }));
  }
}
