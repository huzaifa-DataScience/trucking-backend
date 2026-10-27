import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, MoreThan, Repository } from 'typeorm';
import { UserLocationPing } from '../database/entities';
import { buildTrackingDay, PING_EVERY_MIN, type TrackingDay } from './tracking-day';

export type TrackedPerson = TrackingDay & { userId: number; name: string; email: string };

@Injectable()
export class TrackingService {
  constructor(@InjectRepository(UserLocationPing) private readonly repo: Repository<UserLocationPing>) {}

  /** Saves a location. Pings sooner than ~2 minutes after the last one are skipped (several tabs, quick reloads). */
  async ping(userId: number, p: { latitude: number; longitude: number; accuracy: number }): Promise<{ saved: boolean }> {
    const recent = await this.repo.count({
      where: { userId, createdAt: MoreThan(new Date(Date.now() - (PING_EVERY_MIN * 60_000 - 15_000))) },
    });
    if (recent > 0) return { saved: false };
    await this.repo.insert({
      userId,
      latitude: p.latitude.toFixed(6),
      longitude: p.longitude.toFixed(6),
      accuracyM: Math.round(p.accuracy * 10) / 10,
    });
    return { saved: true };
  }

  /** Everyone with pings between from and to (the viewer's local day), most recently seen first. */
  async day(from: Date, to: Date): Promise<TrackedPerson[]> {
    const rows = await this.repo.find({
      where: { createdAt: Between(from, to) },
      relations: { user: true },
      order: { createdAt: 'ASC' },
      take: 50_000,
    });
    const byUser = new Map<number, UserLocationPing[]>();
    for (const r of rows) byUser.set(r.userId, [...(byUser.get(r.userId) ?? []), r]);
    const now = new Date();
    const people = [...byUser.entries()].map(([userId, list]) => {
      const u = list[0].user;
      return {
        userId,
        name: [u?.firstName, u?.lastName].filter(Boolean).join(' ').trim() || u?.email || `User #${userId}`,
        email: u?.email ?? '',
        ...buildTrackingDay(
          list.map((r) => ({
            latitude: Number(r.latitude),
            longitude: Number(r.longitude),
            accuracyM: r.accuracyM,
            at: r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt),
          })),
          now,
        ),
      };
    });
    return people.sort((a, b) => (b.lastPingAt ?? '').localeCompare(a.lastPingAt ?? ''));
  }
}
