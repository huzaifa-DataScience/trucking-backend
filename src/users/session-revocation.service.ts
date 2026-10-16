import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

/** How long a node trusts its cached "valid after" time before re-reading it. */
const CACHE_TTL_MS = 30_000;

/**
 * "Sign out of other devices": a per-user cut-off time. Sign-in tokens issued before it are
 * rejected. Stored as a row in the existing App_Settings table (key auth.sessionsValidAfter.<userId>,
 * value = unix seconds), so no schema change is needed. Cached per node for 30 seconds.
 */
@Injectable()
export class SessionRevocationService {
  private readonly cache = new Map<number, { validAfterSec: number | null; at: number }>();

  constructor(private readonly dataSource: DataSource) {}

  private key(userId: number): string {
    return `auth.sessionsValidAfter.${userId}`;
  }

  private async validAfterSec(userId: number): Promise<number | null> {
    const hit = this.cache.get(userId);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.validAfterSec;
    const rows: { SettingValue: string }[] = await this.dataSource.query(
      `SELECT SettingValue FROM dbo.App_Settings WHERE SettingKey = @0`,
      [this.key(userId)],
    );
    const n = rows[0] ? Number(rows[0].SettingValue) : NaN;
    const validAfterSec = Number.isFinite(n) ? n : null;
    this.cache.set(userId, { validAfterSec, at: Date.now() });
    return validAfterSec;
  }

  /** True if a token issued at `iat` (unix seconds) was signed out. Tokens without `iat` count as old. */
  async isRevoked(userId: number, iat: number | undefined): Promise<boolean> {
    const cutoff = await this.validAfterSec(userId);
    if (cutoff == null) return false;
    return typeof iat !== 'number' || iat < cutoff;
  }

  /**
   * Ends every session issued before now. A token signed right after (same second) stays valid,
   * which is how the current device is kept signed in.
   */
  async revokeAll(userId: number): Promise<void> {
    const nowSec = Math.floor(Date.now() / 1000);
    await this.dataSource.query(
      `UPDATE dbo.App_Settings SET SettingValue = @1, UpdatedAt = SYSUTCDATETIME() WHERE SettingKey = @0;
       IF @@ROWCOUNT = 0 INSERT INTO dbo.App_Settings (SettingKey, SettingValue) VALUES (@0, @1);`,
      [this.key(userId), String(nowSec)],
    );
    this.cache.set(userId, { validAfterSec: nowSec, at: Date.now() });
  }
}
