import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { DataSource, Repository } from 'typeorm';
import { SitelineEntityConfig } from '../database/entities';
import { normalizeSitelineApiToken } from './siteline-env.util';
import { SitelineService } from './siteline.service';
import { sleep } from './siteline-http.util';

/** Ref_OurEntities.EntityID values used for Siteline multi-company. */
export const SITELINE_ENTITY_IDS = [1, 2, 3] as const;

export type SitelineEntityId = (typeof SITELINE_ENTITY_IDS)[number];

@Injectable()
export class SitelineEntityConfigService implements OnModuleInit {
  private readonly logger = new Logger(SitelineEntityConfigService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly dataSource: DataSource,
    private readonly siteline: SitelineService,
    @InjectRepository(SitelineEntityConfig)
    private readonly configRepo: Repository<SitelineEntityConfig>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureTable();
    await this.seedRowsIfMissing();
    await this.refreshAllCompanies();
  }

  private async ensureTable(): Promise<void> {
    const full = join(process.cwd(), 'scripts/sql/add-siteline-entity-config.sql');
    if (!existsSync(full)) return;
    try {
      const raw = readFileSync(full, 'utf8');
      const batches = raw.split(/\bGO\b/i).map((s) => s.trim()).filter(Boolean);
      for (const batch of batches) {
        await this.dataSource.query(batch);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`Siteline entity config DDL skipped: ${msg}`);
    }
  }

  private async seedRowsIfMissing(): Promise<void> {
    const seeds: Array<{ entityId: number; entityName: string }> = [
      { entityId: 1, entityName: 'GOEL' },
      { entityId: 2, entityName: 'GOEL DC' },
      { entityId: 3, entityName: 'DCB' },
    ];
    for (const s of seeds) {
      const existing = await this.configRepo.findOne({ where: { entityId: s.entityId } });
      if (!existing) {
        await this.configRepo.save(
          this.configRepo.create({
            entityId: s.entityId,
            entityName: s.entityName,
            updatedAt: new Date(),
          }),
        );
      }
    }
  }

  /** API token for Ref_OurEntities.EntityID (from env; never stored in SQL). */
  getTokenForEntity(entityId: number): string {
    const id = Math.trunc(entityId);
    const perEntity = normalizeSitelineApiToken(
      this.config.get<string>(`SITELINE_API_TOKEN_ENTITY_${id}`, '') ?? '',
    );
    if (perEntity) return perEntity;

    if (id === 2) {
      return normalizeSitelineApiToken(this.config.get<string>('SITELINE_API_TOKEN', '') ?? '');
    }
    return '';
  }

  isEntityConfigured(entityId: number): boolean {
    return Boolean(this.getTokenForEntity(entityId) && this.siteline.getBaseGraphqlUrl());
  }

  anyEntityConfigured(): boolean {
    return SITELINE_ENTITY_IDS.some((id) => this.isEntityConfigured(id));
  }

  async listConfigs(): Promise<SitelineEntityConfig[]> {
    return this.configRepo.find({ order: { entityId: 'ASC' } });
  }

  async getConfig(entityId: number): Promise<SitelineEntityConfig | null> {
    return this.configRepo.findOne({ where: { entityId: Math.trunc(entityId) } });
  }

  /** Resolve Siteline company UUID via currentCompany for one entity. */
  async refreshCompanyForEntity(entityId: number): Promise<SitelineEntityConfig | null> {
    const row = await this.getConfig(entityId);
    if (!row) return null;
    if (!this.isEntityConfigured(entityId)) {
      this.logger.warn(`Siteline entity ${entityId}: no API token configured`);
      return row;
    }

    const token = this.getTokenForEntity(entityId);
    const cur = (await this.siteline.getCurrentCompany(token)) as Record<string, unknown> | null;
    if (cur && typeof cur === 'object' && 'error' in cur) {
      this.logger.warn(
        `Siteline currentCompany failed for entity ${entityId}: ${String(cur.error)}`,
      );
      return row;
    }
    if (!cur || typeof cur !== 'object') {
      this.logger.warn(
        `Siteline currentCompany returned empty for entity ${entityId} — check token and SITELINE_API_URL.`,
      );
      return row;
    }

    const id = cur.id != null ? String(cur.id) : null;
    const name =
      cur && typeof cur === 'object' && cur.name != null ? String(cur.name).trim() : null;
    row.sitelineCompanyId = id;
    row.sitelineCompanyName = name;
    row.lastResolvedAt = new Date();
    row.updatedAt = new Date();
    await this.configRepo.save(row);
    this.logger.log(
      `Siteline entity ${entityId} (${row.entityName}): companyId=${id ?? 'n/a'} name=${name ?? 'n/a'}`,
    );
    return row;
  }

  async refreshAllCompanies(): Promise<SitelineEntityConfig[]> {
    const out: SitelineEntityConfig[] = [];
    for (const entityId of SITELINE_ENTITY_IDS) {
      const row = await this.refreshCompanyForEntity(entityId);
      if (row) out.push(row);
      const delayMs = Math.max(
        0,
        Number(this.config.get<string>('SITELINE_ENTITY_API_DELAY_MS', '500')) || 500,
      );
      if (delayMs > 0) await sleep(delayMs);
    }
    return out;
  }

  /** Map Siteline company UUID → website EntityID (after refresh). */
  async companyIdToEntityIdMap(): Promise<Map<string, number>> {
    const rows = await this.listConfigs();
    const map = new Map<string, number>();
    for (const r of rows) {
      const cid = r.sitelineCompanyId?.trim().toLowerCase();
      if (cid) map.set(cid, r.entityId);
    }
    return map;
  }

  resolveEntityIdForSitelineCompanyId(
    companyId: string | null | undefined,
    companyMap: Map<string, number>,
  ): number | null {
    const key = companyId?.trim().toLowerCase();
    if (!key) return null;
    return companyMap.get(key) ?? null;
  }

  /** Entity used for single-call aging with companyId null (optional). */
  primaryEntityIdForMergedAging(): number {
    const raw = this.config.get<string>('SITELINE_AGING_PRIMARY_ENTITY_ID', '2');
    const n = Number.parseInt(String(raw), 10);
    return SITELINE_ENTITY_IDS.includes(n as SitelineEntityId) ? n : 2;
  }

  useMergedAgingNullCompanyId(): boolean {
    const raw = (
      this.config.get<string>('SITELINE_AGING_COMPANY_ID_MODE', 'per_entity') ?? 'per_entity'
    )
      .trim()
      .toLowerCase();
    return raw === 'null' || raw === 'merged_null' || raw === 'all';
  }
}
