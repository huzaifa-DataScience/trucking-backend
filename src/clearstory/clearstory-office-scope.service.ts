import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClearstoryService } from './clearstory.service';

function envFlag(raw: string | undefined, defaultValue: boolean): boolean {
  if (raw === undefined || raw === null || String(raw).trim() === '') return defaultValue;
  const v = String(raw).trim().toLowerCase();
  return !['false', '0', 'no', 'off'].includes(v);
}

export function parseCommaSeparatedInts(raw: string | undefined): number[] {
  if (!raw?.trim()) return [];
  return [
    ...new Set(
      raw
        .split(/[,;\s]+/)
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n))
        .map((n) => Math.trunc(n)),
    ),
  ];
}

export function parseCommaSeparatedStrings(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return [...new Set(raw.split(/[,;]+/).map((s) => s.trim()).filter(Boolean))];
}

/** Office name must start with one of the configured prefixes (case-insensitive). */
export function officeNameMatchesPrefixes(
  name: string | null | undefined,
  prefixes: string[],
): boolean {
  const n = String(name ?? '').trim();
  if (!n || !prefixes.length) return false;
  const lower = n.toLowerCase();
  return prefixes.some((p) => {
    const pref = p.trim().toLowerCase();
    return pref.length > 0 && lower.startsWith(pref);
  });
}

/**
 * Limits Clearstory sync to specific offices (divisions) under the API-key company.
 * Default: offices whose name starts with "Goel Services, Inc." (excludes DCB, Goel DC, etc.).
 */
@Injectable()
export class ClearstoryOfficeScopeService {
  private readonly logger = new Logger(ClearstoryOfficeScopeService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly api: ClearstoryService,
  ) {}

  isEnabled(): boolean {
    return envFlag(this.config.get<string>('CLEARSTORY_OFFICE_SCOPE_ENABLED'), true);
  }

  pruneAfterSync(): boolean {
    return envFlag(this.config.get<string>('CLEARSTORY_OFFICE_SCOPE_PRUNE'), true);
  }

  /** Explicit office IDs from env; empty when using name-prefix resolution instead. */
  explicitOfficeIds(): number[] {
    return parseCommaSeparatedInts(this.config.get<string>('CLEARSTORY_OFFICE_IDS'));
  }

  officeNamePrefixes(): string[] {
    const fromEnv = parseCommaSeparatedStrings(
      this.config.get<string>('CLEARSTORY_OFFICE_NAME_PREFIXES'),
    );
    if (fromEnv.length) return fromEnv;
    return ['Goel Services, Inc.'];
  }

  /**
   * Allowed Clearstory office IDs for this sync run, or null when scope is disabled (sync all).
   */
  async resolveAllowedOfficeIds(): Promise<number[] | null> {
    if (!this.isEnabled()) return null;

    const explicit = this.explicitOfficeIds();
    if (explicit.length) {
      this.logger.log(`Clearstory office scope: explicit office IDs ${explicit.join(', ')}`);
      return explicit;
    }

    const prefixes = this.officeNamePrefixes();
    const ids: number[] = [];
    let offset = 0;
    const limit = 100;
    while (true) {
      const { records, count } = await this.api.listOffices({ offset, limit });
      const list = Array.isArray(records) ? records : [];
      for (const o of list) {
        const id = Number(o?.id);
        const name = String(o?.name ?? o?.businessName ?? '').trim();
        if (Number.isFinite(id) && officeNameMatchesPrefixes(name, prefixes)) {
          ids.push(Math.trunc(id));
        }
      }
      offset += limit;
      if (!list.length || offset >= Number(count ?? 0)) break;
    }

    const unique = [...new Set(ids)];
    if (!unique.length) {
      this.logger.warn(
        `Clearstory office scope enabled but no offices matched prefixes: ${prefixes.join('; ')}`,
      );
    } else {
      this.logger.log(
        `Clearstory office scope: prefixes=[${prefixes.join('; ')}] → office IDs ${unique.join(', ')}`,
      );
    }
    return unique;
  }

  isOfficeInScope(officeId: number | null | undefined, allowed: number[] | null): boolean {
    if (!allowed?.length) return true;
    const oid = Number(officeId);
    if (!Number.isFinite(oid)) return false;
    return allowed.includes(Math.trunc(oid));
  }

  officeIdsApiFilter(allowed: number[] | null): Record<string, number[]> {
    if (!allowed?.length) return {};
    return { officeIds: allowed };
  }
}
