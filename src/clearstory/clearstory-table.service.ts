import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, In, Repository } from 'typeorm';
import {
  ClearstoryApiPayload,
  ClearstoryCompany,
  ClearstoryContract,
  ClearstoryCor,
  ClearstoryCustomer,
  ClearstoryTag,
} from '../database/entities';

/** Matches `persistClearstoryApiPayload` keys in clearstory-sync.service.ts */
export const CLEARSTORY_TABLE_RESOURCE_TYPES = {
  cor: 'cor',
  tag: 'tag',
  customer: 'customer',
  contract: 'contract',
  company: 'company',
} as const;

const MAX_PAGE_SIZE = 200;
const DEFAULT_PAGE_SIZE = 50;

export type ClearstoryTableRow = {
  resourceKey: string;
  /** Parsed `Clearstory_ApiPayloads.PayloadJson` — Swagger-shaped object when sync stored it. */
  swagger: Record<string, unknown> | null;
  /** All typed mirror columns (camelCase) when you need SQL-backed fields without walking `swagger`. */
  typedMirror: Record<string, unknown>;
};

export type ClearstoryTablePage<T extends ClearstoryTableRow = ClearstoryTableRow> = {
  module: string;
  page: number;
  pageSize: number;
  total: number;
  rows: T[];
};

function iso(d: Date | null | undefined): string | null {
  return d?.toISOString?.() ?? null;
}

function clampPagination(pageRaw?: string, pageSizeRaw?: string) {
  const page = Math.max(1, Math.floor(Number(pageRaw) || 1));
  let pageSize = Math.floor(Number(pageSizeRaw) || DEFAULT_PAGE_SIZE);
  if (!Number.isFinite(pageSize) || pageSize < 1) pageSize = DEFAULT_PAGE_SIZE;
  pageSize = Math.min(pageSize, MAX_PAGE_SIZE);
  return { page, pageSize, skip: (page - 1) * pageSize };
}

function corToMirror(c: ClearstoryCor): Record<string, unknown> {
  return {
    id: c.id,
    numericId: c.numericId,
    uuid: c.uuid,
    projectId: c.projectId,
    jobNumber: c.jobNumber,
    corNumber: c.corNumber,
    issueNumber: c.issueNumber,
    title: c.title,
    description: c.description,
    entryMethod: c.entryMethod,
    type: c.type,
    status: c.status,
    stage: c.stage,
    ballInCourt: c.ballInCourt,
    version: c.version,
    customerJobNumber: c.customerJobNumber,
    customerReferenceNumber: c.customerReferenceNumber,
    changeNotificationId: c.changeNotificationId,
    projectName: c.projectName,
    contractId: c.contractId,
    customerName: c.customerName,
    contractorName: c.contractorName,
    customerCoNumber: c.customerCoNumber,
    dateSubmitted: iso(c.dateSubmitted),
    requestedAmount: c.requestedAmount,
    inReviewAmount: c.inReviewAmount,
    approvedCoIssuedAmount: c.approvedCoIssuedAmount,
    approvedToProceedAmount: c.approvedToProceedAmount,
    totalAmount: c.totalAmount,
    voidAmount: c.voidAmount,
    voidDate: iso(c.voidDate),
    coIssueDate: iso(c.coIssueDate),
    approvedToProceedDate: iso(c.approvedToProceedDate),
    approvedOrVoidDate: iso(c.approvedOrVoidDate),
    updatedAt: iso(c.updatedAt),
    createdAt: iso(c.createdAt),
    lastSyncedAt: iso(c.lastSyncedAt),
  };
}

function tagToMirror(t: ClearstoryTag): Record<string, unknown> {
  return {
    id: t.id,
    uuid: t.uuid,
    projectId: t.projectId,
    jobNumber: t.jobNumber,
    number: t.number,
    paddedTagNumber: t.paddedTagNumber,
    title: t.title,
    status: t.status,
    customerReferenceNumber: t.customerReferenceNumber,
    dateOfWorkPerformed: iso(t.dateOfWorkPerformed),
    signedAt: iso(t.signedAt),
    updatedAt: iso(t.updatedAt),
    createdAt: iso(t.createdAt),
    lastSyncedAt: iso(t.lastSyncedAt),
  };
}

function customerToMirror(c: ClearstoryCustomer): Record<string, unknown> {
  return {
    id: c.id,
    name: c.name,
    internalId: c.internalId,
    creatorId: c.creatorId,
    address: c.address,
    city: c.city,
    state: c.state,
    zipCode: c.zipCode,
    country: c.country,
    phone: c.phone,
    fax: c.fax,
    lastSyncedAt: iso(c.lastSyncedAt),
  };
}

function contractToMirror(c: ClearstoryContract): Record<string, unknown> {
  return {
    id: c.id,
    name: c.name,
    contractValue: c.contractValue,
    customerProjectId: c.customerProjectId,
    contractorProjectId: c.contractorProjectId,
    lastSyncedAt: iso(c.lastSyncedAt),
  };
}

function companyToMirror(c: ClearstoryCompany): Record<string, unknown> {
  return {
    id: c.id,
    name: c.name,
    domain: c.domain,
    address: c.address,
    address2: c.address2,
    city: c.city,
    state: c.state,
    zipCode: c.zipCode,
    country: c.country,
    phone: c.phone,
    fax: c.fax,
    divisionsEnabled: c.divisionsEnabled,
    tzName: c.tzName,
    logoSignedUrl: c.logoSignedUrl,
    updatedAt: iso(c.updatedAt),
    createdAt: iso(c.createdAt),
    lastSyncedAt: iso(c.lastSyncedAt),
  };
}

@Injectable()
export class ClearstoryTableService {
  constructor(
    @InjectRepository(ClearstoryApiPayload) private readonly payloads: Repository<ClearstoryApiPayload>,
    @InjectRepository(ClearstoryCor) private readonly cors: Repository<ClearstoryCor>,
    @InjectRepository(ClearstoryTag) private readonly tags: Repository<ClearstoryTag>,
    @InjectRepository(ClearstoryCustomer) private readonly customers: Repository<ClearstoryCustomer>,
    @InjectRepository(ClearstoryContract) private readonly contracts: Repository<ClearstoryContract>,
    @InjectRepository(ClearstoryCompany) private readonly companies: Repository<ClearstoryCompany>,
  ) {}

  private async loadPayloadMap(
    resourceType: string,
    keys: string[],
  ): Promise<Map<string, { swagger: Record<string, unknown> | null; lastFetchedAt: Date | null }>> {
    const out = new Map<string, { swagger: Record<string, unknown> | null; lastFetchedAt: Date | null }>();
    if (!keys.length) return out;
    const rows = await this.payloads.find({
      where: { resourceType, resourceKey: In(keys) },
    });
    for (const r of rows) {
      let swagger: Record<string, unknown> | null = null;
      if (r.payloadJson) {
        try {
          const p = JSON.parse(r.payloadJson) as unknown;
          swagger =
            p !== null && typeof p === 'object' && !Array.isArray(p)
              ? (p as Record<string, unknown>)
              : null;
        } catch {
          swagger = null;
        }
      }
      out.set(r.resourceKey, { swagger, lastFetchedAt: r.lastFetchedAt ?? null });
    }
    return out;
  }

  async listCors(
    pageRaw?: string,
    pageSizeRaw?: string,
    projectIdRaw?: string,
  ): Promise<ClearstoryTablePage> {
    const { page, pageSize, skip } = clampPagination(pageRaw, pageSizeRaw);
    const where: FindOptionsWhere<ClearstoryCor> = {};
    if (projectIdRaw !== undefined && projectIdRaw !== '') {
      const pid = Number.parseInt(projectIdRaw, 10);
      if (Number.isFinite(pid)) where.projectId = pid;
    }
    const [entities, total] = await this.cors.findAndCount({
      where,
      order: { updatedAt: 'DESC', id: 'ASC' },
      skip,
      take: pageSize,
    });
    const keys = entities.map((e) => e.id);
    const payloadMap = await this.loadPayloadMap(CLEARSTORY_TABLE_RESOURCE_TYPES.cor, keys);
    const rows: ClearstoryTableRow[] = entities.map((e) => {
      const pk = e.id;
      const hit = payloadMap.get(pk);
      const swagger = hit?.swagger ?? null;
      return {
        resourceKey: pk,
        swagger,
        typedMirror: corToMirror(e),
      };
    });
    return { module: 'cors', page, pageSize, total, rows };
  }

  async listTags(
    pageRaw?: string,
    pageSizeRaw?: string,
    projectIdRaw?: string,
  ): Promise<ClearstoryTablePage> {
    const { page, pageSize, skip } = clampPagination(pageRaw, pageSizeRaw);
    const where: FindOptionsWhere<ClearstoryTag> = {};
    if (projectIdRaw !== undefined && projectIdRaw !== '') {
      const pid = Number.parseInt(projectIdRaw, 10);
      if (Number.isFinite(pid)) where.projectId = pid;
    }
    const [entities, total] = await this.tags.findAndCount({
      where,
      order: { updatedAt: 'DESC', id: 'ASC' },
      skip,
      take: pageSize,
    });
    const keys = entities.map((e) => String(e.id));
    const payloadMap = await this.loadPayloadMap(CLEARSTORY_TABLE_RESOURCE_TYPES.tag, keys);
    const rows: ClearstoryTableRow[] = entities.map((e) => {
      const pk = String(e.id);
      const hit = payloadMap.get(pk);
      const swagger = hit?.swagger ?? null;
      return {
        resourceKey: pk,
        swagger,
        typedMirror: tagToMirror(e),
      };
    });
    return { module: 'tags', page, pageSize, total, rows };
  }

  async listCustomers(pageRaw?: string, pageSizeRaw?: string): Promise<ClearstoryTablePage> {
    const { page, pageSize, skip } = clampPagination(pageRaw, pageSizeRaw);
    const [entities, total] = await this.customers.findAndCount({
      order: { id: 'ASC' },
      skip,
      take: pageSize,
    });
    const keys = entities.map((e) => String(e.id));
    const payloadMap = await this.loadPayloadMap(CLEARSTORY_TABLE_RESOURCE_TYPES.customer, keys);
    const rows: ClearstoryTableRow[] = entities.map((e) => {
      const pk = String(e.id);
      const hit = payloadMap.get(pk);
      const swagger = hit?.swagger ?? null;
      return {
        resourceKey: pk,
        swagger,
        typedMirror: customerToMirror(e),
      };
    });
    return { module: 'customers', page, pageSize, total, rows };
  }

  async listContracts(pageRaw?: string, pageSizeRaw?: string): Promise<ClearstoryTablePage> {
    const { page, pageSize, skip } = clampPagination(pageRaw, pageSizeRaw);
    const [entities, total] = await this.contracts.findAndCount({
      order: { id: 'ASC' },
      skip,
      take: pageSize,
    });
    const keys = entities.map((e) => String(e.id));
    const payloadMap = await this.loadPayloadMap(CLEARSTORY_TABLE_RESOURCE_TYPES.contract, keys);
    const rows: ClearstoryTableRow[] = entities.map((e) => {
      const pk = String(e.id);
      const hit = payloadMap.get(pk);
      const swagger = hit?.swagger ?? null;
      return {
        resourceKey: pk,
        swagger,
        typedMirror: contractToMirror(e),
      };
    });
    return { module: 'contracts', page, pageSize, total, rows };
  }

  /** Single current-company row; `resourceKey` is always `current` in payloads. */
  async getCompanyRow(): Promise<{ module: 'company'; row: ClearstoryTableRow | null }> {
    const entities = await this.companies.find({ take: 1, order: { id: 'ASC' } });
    const entity = entities[0] ?? null;
    const payloadMap = await this.loadPayloadMap(CLEARSTORY_TABLE_RESOURCE_TYPES.company, ['current']);
    const hit = payloadMap.get('current');
    const swagger = hit?.swagger ?? null;
    if (!entity && !swagger) {
      return { module: 'company', row: null };
    }
    const row: ClearstoryTableRow = {
      resourceKey: 'current',
      swagger,
      typedMirror: entity ? companyToMirror(entity) : {},
    };
    return { module: 'company', row };
  }
}
