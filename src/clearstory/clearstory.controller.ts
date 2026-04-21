import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { JwtAuthGuard } from '../auth/guards';
import { ClearstoryApiPayload, ClearstoryCor, ClearstoryProject } from '../database/entities';
import { ClearstorySyncService } from './clearstory-sync.service';

type Bucket = 'APPROVED' | 'ATP' | 'IN_REVIEW' | 'PLACEHOLDER' | 'VOID';

function bucketFromStatus(status: string | null | undefined): Bucket {
  const s = String(status ?? '').toLowerCase();
  if (s === 'approved_co_issued') return 'APPROVED';
  if (s === 'approved_to_proceed') return 'ATP';
  if (s === 'in_review') return 'IN_REVIEW';
  if (s === 'placeholder') return 'PLACEHOLDER';
  if (s === 'rejected' || s === 'void') return 'VOID';
  // treat draft as in-review for now (frontend can filter if desired)
  if (s === 'draft') return 'IN_REVIEW';
  return 'IN_REVIEW';
}

function decToNumber(v: any): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function strOrNull(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function boolOrNull(v: unknown): boolean | null {
  return typeof v === 'boolean' ? v : null;
}

function numOrNull(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function isoOrNull(v: unknown): string | null {
  if (!v) return null;
  const d = new Date(String(v));
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

/**
 * Fill missing typed-mirror columns from stored Clearstory payload (Swagger-shaped).
 * We only populate fields that are currently null/undefined in the typed row, so DB-mirrored values stay authoritative.
 */
function hydrateProjectTypedFromSwagger(
  typed: Record<string, any>,
  swagger: Record<string, any> | null,
): Record<string, any> {
  if (!swagger) return typed;
  const out = { ...typed };
  const address = swagger.address ?? null;

  out.jobNumber = out.jobNumber ?? strOrNull(swagger.jobNumber ?? swagger.companyJobNumber);
  out.customerJobNumber = out.customerJobNumber ?? strOrNull(swagger.customerJobNumber);
  out.name =
    out.name ??
    strOrNull(swagger.projectTitle ?? swagger.title ?? swagger.name ?? swagger.projectName ?? null);
  out.customerName = out.customerName ?? strOrNull(swagger.customer ?? swagger.customerName ?? null);
  out.customerId =
    out.customerId ?? numOrNull(swagger.customerId ?? swagger.customerInfo?.id ?? swagger.customer?.id);
  out.officeId = out.officeId ?? numOrNull(swagger.officeId ?? swagger.office?.id);
  out.officeName = out.officeName ?? strOrNull(swagger.officeName ?? swagger.office?.name ?? null);
  out.companyId = out.companyId ?? numOrNull(swagger.companyId);
  out.originType = out.originType ?? strOrNull(swagger.originType);
  out.archived = out.archived ?? boolOrNull(swagger.archived);

  // Address fields (Clearstory projects use `address{...}`; older shapes may have `site{...}`).
  const street = address?.streetAddress ?? swagger.site?.streetAddress ?? null;
  const city = address?.city ?? swagger.site?.city ?? null;
  const state = address?.state ?? swagger.site?.state ?? null;
  const country = address?.country ?? swagger.site?.country ?? null;
  const zip = address?.zipCode ?? address?.postalCode ?? swagger.site?.zipCode ?? null;
  const projectAddress = address?.projectAddress ?? swagger.site?.projectAddress ?? null;

  out.siteStreetAddress = out.siteStreetAddress ?? strOrNull(street);
  out.siteCity = out.siteCity ?? strOrNull(city);
  out.siteState = out.siteState ?? strOrNull(state);
  out.siteCountry = out.siteCountry ?? strOrNull(country);
  out.siteZipCode = out.siteZipCode ?? strOrNull(zip);
  out.siteProjectAddress = out.siteProjectAddress ?? strOrNull(projectAddress);

  out.startDate = out.startDate ?? strOrNull(swagger.startDate ?? swagger.projectStartDate ?? null);
  out.endDate = out.endDate ?? strOrNull(swagger.endDate ?? swagger.projectEndDate ?? null);
  out.baseContractValue =
    out.baseContractValue ??
    (swagger.contractValue !== undefined && swagger.contractValue !== null
      ? Number(swagger.contractValue)
      : swagger.baseContractValue !== undefined && swagger.baseContractValue !== null
        ? Number(swagger.baseContractValue)
        : null);

  // Timestamps from Clearstory payload if typed row is missing
  out.updatedAt = out.updatedAt ?? isoOrNull(swagger.updatedAt);
  out.createdAt = out.createdAt ?? isoOrNull(swagger.createdAt);

  return out;
}

@UseGuards(JwtAuthGuard)
@Controller('clearstory')
export class ClearstoryController {
  constructor(
    @InjectRepository(ClearstoryProject) private readonly projects: Repository<ClearstoryProject>,
    @InjectRepository(ClearstoryCor) private readonly cors: Repository<ClearstoryCor>,
    @InjectRepository(ClearstoryApiPayload) private readonly apiPayloads: Repository<ClearstoryApiPayload>,
    private readonly clearstorySync: ClearstorySyncService,
  ) {}

  /** Run a full Clearstory pull now (same as cron). Check server logs for phase lines and errors. */
  @Post('sync')
  async runSyncNow() {
    if (this.clearstorySync.isSyncRunning()) {
      return { ok: false, message: 'Clearstory sync is already running.' };
    }
    await this.clearstorySync.syncNow();
    const h = await this.clearstorySync.getHealthInfo();
    return {
      ok: true,
      message:
        'Sync run completed or logged errors; see server logs for per-phase counts. Use tags.* for tag inbox diagnostics.',
      syncRunning: h.syncRunning,
      lastSuccessfulRunAt: h.lastSuccessfulRunAt,
      tags: h.tags,
    };
  }

  /**
   * Repair / backfill dbo.Clearstory_Projects from stored Clearstory payload JSON.
   * Use when you see projects in Clearstory_ApiPayloads but typed columns are NULL.
   */
  @Post('projects/backfill')
  async backfillProjects(@Query('mode') mode?: 'ALL' | 'ONLY_MISSING') {
    return this.clearstorySync.backfillProjectsFromStoredPayloads(mode ?? 'ONLY_MISSING');
  }

  @Get('projects')
  async listProjects(
    @Query('search') search?: string,
    @Query('allColumns') allColumns?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const q = (search ?? '').trim().toLowerCase();
    const wantAllColumns = ['1', 'true', 'yes', 'on'].includes(
      String(allColumns ?? '').trim().toLowerCase(),
    );
    const wantPaginated = page !== undefined || pageSize !== undefined;
    const pageNum = Math.max(1, Math.floor(Number(page) || 1));
    const sizeRaw = Math.floor(Number(pageSize) || 50);
    const pageSizeNum = Math.max(1, Math.min(200, Number.isFinite(sizeRaw) ? sizeRaw : 50));

    // Default response stays lean for performance.
    if (!wantAllColumns) {
      // Keep existing response shape unless pagination is requested.
      const qb = this.projects.createQueryBuilder('p');
      if (q) {
        qb.where(
          '(LOWER(p.Name) LIKE :q OR LOWER(p.JobNumber) LIKE :q OR LOWER(p.CustomerName) LIKE :q)',
          { q: `%${q}%` },
        );
      }
      qb.orderBy('p.UpdatedAt', 'DESC').addOrderBy('p.Id', 'DESC');
      if (wantPaginated) qb.skip((pageNum - 1) * pageSizeNum).take(pageSizeNum);
      const [rows, total] = wantPaginated ? await qb.getManyAndCount() : [await qb.getMany(), 0];

      const projects = rows.map((p) => ({
          id: p.id,
          jobNumber: p.jobNumber,
          name: p.name,
          office: p.officeName,
          region: p.region,
          division: p.division,
          customerName: p.customerName,
          startDate: p.startDate,
          endDate: p.endDate,
          baseContractValue: decToNumber(p.baseContractValue),
          lastSyncedAt: p.lastSyncedAt?.toISOString?.() ?? null,
        }));

      return wantPaginated
        ? { page: pageNum, pageSize: pageSizeNum, total, projects }
        : { projects };
    }

    // allColumns variant. Apply DB-side search + optional pagination.
    const qb = this.projects.createQueryBuilder('p');
    if (q) {
      qb.where('(LOWER(p.Name) LIKE :q OR LOWER(p.JobNumber) LIKE :q OR LOWER(p.CustomerName) LIKE :q)', {
        q: `%${q}%`,
      });
    }
    qb.orderBy('p.UpdatedAt', 'DESC').addOrderBy('p.Id', 'DESC');
    if (wantPaginated) qb.skip((pageNum - 1) * pageSizeNum).take(pageSizeNum);
    const [filtered, total] = wantPaginated ? await qb.getManyAndCount() : [await qb.getMany(), 0];

    const keys = filtered.map((p) => String(p.id));
    const payloadRows = keys.length
      ? await this.apiPayloads.find({
          where: { resourceType: 'project', resourceKey: In(keys) },
        })
      : [];
    const payloadByKey = new Map(payloadRows.map((r) => [r.resourceKey, r.payloadJson]));

    const projects = filtered.map((p) => {
      const base = {
        // All columns from dbo.Clearstory_Projects (typed mirror). These are Clearstory-derived fields.
        id: p.id,
        jobNumber: p.jobNumber,
        customerJobNumber: p.customerJobNumber,
        name: p.name,
        officeId: p.officeId,
        officeName: p.officeName,
        region: p.region,
        division: p.division,
        customerName: p.customerName,
        customerId: p.customerId,
        companyId: p.companyId,
        archived: p.archived,
        originType: p.originType,
        siteProjectAddress: p.siteProjectAddress,
        siteStreetAddress: p.siteStreetAddress,
        siteCity: p.siteCity,
        siteState: p.siteState,
        siteZipCode: p.siteZipCode,
        siteCountry: p.siteCountry,
        startDate: p.startDate,
        endDate: p.endDate,
        baseContractValue: decToNumber(p.baseContractValue),
        updatedAt: p.updatedAt ? p.updatedAt.toISOString() : null,
        createdAt: p.createdAt ? p.createdAt.toISOString() : null,
      };

      // If a typed row is incomplete, hydrate missing fields from the stored Clearstory payload,
      // but do not return the payload itself to the frontend.
      const raw = payloadByKey.get(String(p.id)) ?? null;
      if (!raw) return base;
      try {
        const parsed = JSON.parse(raw) as unknown;
        const swagger =
          parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
            ? (parsed as Record<string, unknown>)
            : null;
        return hydrateProjectTypedFromSwagger(base as any, swagger as any);
      } catch {
        return base;
      }
    });

    return wantPaginated
      ? { page: pageNum, pageSize: pageSizeNum, total, projects }
      : { projects };
  }

  @Get('projects/:id/summary')
  async getProjectSummary(@Param('id') id: string) {
    const pid = Number.parseInt(id, 10);
    if (!Number.isFinite(pid)) throw new NotFoundException('Invalid project id');
    const project = await this.projects.findOne({ where: { id: pid } });
    if (!project) throw new NotFoundException('Project not found');

    const items = await this.cors.find({ where: { projectId: pid } });
    const totals = { approved: 0, atp: 0, inReview: 0, placeholder: 0, void: 0 };
    for (const co of items) {
      const amt = decToNumber(co.totalAmount ?? co.requestedAmount ?? 0);
      switch (bucketFromStatus(co.status)) {
        case 'APPROVED':
          totals.approved += amt;
          break;
        case 'ATP':
          totals.atp += amt;
          break;
        case 'IN_REVIEW':
          totals.inReview += amt;
          break;
        case 'PLACEHOLDER':
          totals.placeholder += amt;
          break;
        case 'VOID':
          totals.void += amt;
          break;
      }
    }

    const revisedContractValue =
      decToNumber(project.baseContractValue) +
      totals.approved +
      totals.atp +
      totals.inReview +
      totals.placeholder;

    return {
      project: {
        id: project.id,
        jobNumber: project.jobNumber,
        name: project.name,
        office: project.officeName,
        region: project.region,
        division: project.division,
        customerName: project.customerName,
        startDate: project.startDate,
        endDate: project.endDate,
        baseContractValue: decToNumber(project.baseContractValue),
      },
      totals,
      revisedContractValue,
      reconciliation: {
        redFlag: false,
        clearstory: revisedContractValue,
        siteline: null,
        foundation: null,
        lastCheckedAt: new Date().toISOString(),
        notes: [],
      },
    };
  }

  @Get('projects/:id/cors')
  async listProjectCors(
    @Param('id') id: string,
    @Query('bucket') bucket?: Bucket,
    @Query('status') status?: string,
    @Query('stage') stage?: string,
  ) {
    const pid = Number.parseInt(id, 10);
    if (!Number.isFinite(pid)) throw new NotFoundException('Invalid project id');
    const project = await this.projects.findOne({ where: { id: pid } });
    if (!project) throw new NotFoundException('Project not found');

    let items = await this.cors.find({ where: { projectId: pid } });
    if (status) items = items.filter((c) => String(c.status ?? '') === status);
    if (stage) items = items.filter((c) => String(c.stage ?? '') === stage);
    if (bucket) items = items.filter((c) => bucketFromStatus(c.status) === bucket);

    return {
      projectId: pid,
      items: items.map((c) => ({
        id: c.id,
        numericId: c.numericId,
        uuid: c.uuid,
        projectId: c.projectId,
        jobNumber: c.jobNumber,
        corNumber: c.corNumber,
        issueNumber: c.issueNumber,
        type: c.type,
        status: c.status,
        stage: c.stage,
        statusBucket: bucketFromStatus(c.status),
        ballInCourt: c.ballInCourt,
        version: c.version,
        requestedAmount: decToNumber(c.requestedAmount),
        totalAmount: decToNumber(c.totalAmount),
        voidAmount: decToNumber(c.voidAmount),
        voidDate: c.voidDate ? c.voidDate.toISOString() : null,
        approvedOrVoidDate: c.approvedOrVoidDate ? c.approvedOrVoidDate.toISOString() : null,
        updatedAt: c.updatedAt ? c.updatedAt.toISOString() : null,
        createdAt: c.createdAt ? c.createdAt.toISOString() : null,
      })),
    };
  }

  /**
   * Full Clearstory JSON for one resource (list + detail merged on sync), matching what the Web API returned.
   * Query: `type` = resource kind, `key` = lookup key (see docs/frontend-clearstory-api.md).
   */
  @Get('api-payload')
  async getApiPayload(
    @Query('type') type?: string,
    @Query('key') key?: string,
    /** Prefer these for composite keys instead of parsing `key` (avoids `:` ambiguity). */
    @Query('cnId') cnId?: string,
    @Query('contractId') contractId?: string,
    @Query('projectId') projectId?: string,
    @Query('rateType') rateType?: string,
    @Query('recordId') recordId?: string,
  ) {
    const t = (type ?? '').trim();
    let k = (key ?? '').trim();
    if (t === 'cn_contract') {
      const cni = (cnId ?? '').trim();
      const cid = (contractId ?? '').trim();
      if (cni && cid) k = `${cni}:${cid}`;
    } else if (t === 'project_rate') {
      const pid = (projectId ?? '').trim();
      const rt = (rateType ?? '').trim();
      const rid = (recordId ?? '').trim();
      if (pid && rt && rid) k = `${pid}:${rt}:${rid}`;
    } else if (t === 'rate') {
      const rt = (rateType ?? '').trim();
      const rid = (recordId ?? '').trim();
      if (rt && rid && !k) k = `${rt}:${rid}`;
    }
    if (!t || !k) {
      throw new BadRequestException(
        'Query param "type" is required. Provide "key", or for composite types use: cn_contract → cnId+contractId; project_rate → projectId+rateType+recordId; rate → rateType+recordId (or key).',
      );
    }
    const row = await this.apiPayloads.findOne({ where: { resourceType: t, resourceKey: k } });
    if (!row?.payloadJson) {
      throw new NotFoundException('No stored payload for this type/key. Run POST /clearstory/sync first.');
    }
    let payload: unknown;
    try {
      payload = JSON.parse(row.payloadJson);
    } catch {
      throw new NotFoundException('Stored payload is not valid JSON.');
    }
    return {
      resourceType: row.resourceType,
      resourceKey: row.resourceKey,
      lastFetchedAt: row.lastFetchedAt?.toISOString?.() ?? null,
      payload,
    };
  }

  @Get('status')
  async getStatus() {
    const h = await this.clearstorySync.getHealthInfo();
    return {
      module: 'clearstory',
      ready: true,
      syncRunning: h.syncRunning,
      lastSuccessfulRunAt: h.lastSuccessfulRunAt,
      tags: h.tags,
      message:
        'Clearstory mirror (DB-backed sync). tags.lastPhase is the latest tags sync attempt (per inbox list lengths, API errors). tags.payloadRowCount / typedRowCount are live SQL counts.',
    };
  }
}

