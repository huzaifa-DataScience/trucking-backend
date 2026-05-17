import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Response } from 'express';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../auth/guards';
import { TrimbleLineItemRawExport, TrimbleProject } from '../database/entities';
import { TrimbleLineItemsApiService } from './trimble-line-items-api.service';
import { TrimbleSyncService } from './trimble-sync.service';

@UseGuards(JwtAuthGuard)
@Controller('trimble')
export class TrimbleController {
  constructor(
    @InjectRepository(TrimbleProject) private readonly projects: Repository<TrimbleProject>,
    @InjectRepository(TrimbleLineItemRawExport)
    private readonly rawExports: Repository<TrimbleLineItemRawExport>,
    private readonly sync: TrimbleSyncService,
    private readonly lineItemsApi: TrimbleLineItemsApiService,
  ) {}

  /** Liveness + last-run summary for the Trimble Materials sync. */
  @Get('status')
  async getStatus() {
    const h = await this.sync.getHealthInfo();
    return {
      module: 'trimble',
      ready: true,
      ...h,
      message:
        'Trimble Materials sync (Playwright login + StructShare API). Use POST /trimble/sync to run on demand.',
    };
  }

  /** Trigger a full sync immediately (same logic as the cron). */
  @Post('sync')
  async runSyncNow() {
    if (this.sync.isSyncRunning()) {
      return { ok: false, message: 'Trimble sync is already running.' };
    }
    return this.sync.syncNow();
  }

  /** Column names on `Trimble_ProjectLineItems` (for grid headers). Same auth as other `/trimble/*` routes. */
  @Get('line-items/columns')
  async lineItemColumns() {
    const columns = await this.lineItemsApi.listColumnNames();
    return { columns };
  }

  /**
   * Parsed Excel line-item rows for one project (paginated). Requires JWT.
   * Query: `projectId` (required), `page` (default 1), `pageSize` (default 50, max 500).
   */
  @Get('line-items')
  async lineItemsForProject(
    @Query('projectId') projectIdRaw: string | undefined,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const pid = Number(projectIdRaw);
    if (!Number.isFinite(pid)) {
      throw new BadRequestException('Query parameter projectId is required and must be a number.');
    }
    const pageNum = Math.max(1, Math.floor(Number(page) || 1));
    const pageSizeNum = Math.max(1, Math.min(500, Math.floor(Number(pageSize) || 50)));
    return this.lineItemsApi.listForProject(pid, pageNum, pageSizeNum);
  }

  /** Same data as GET `/trimble/line-items?projectId=` — REST-shaped URL for routers. */
  @Get('projects/:projectId/line-items')
  async lineItemsForProjectNested(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const pageNum = Math.max(1, Math.floor(Number(page) || 1));
    const pageSizeNum = Math.max(1, Math.min(500, Math.floor(Number(pageSize) || 50)));
    return this.lineItemsApi.listForProject(projectId, pageNum, pageSizeNum);
  }

  /** Paginated list of mirrored Trimble projects (mirrors `/clearstory/projects`). */
  @Get('projects')
  async listProjects(
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const q = (search ?? '').trim().toLowerCase();
    const wantPaginated = page !== undefined || pageSize !== undefined;
    const pageNum = Math.max(1, Math.floor(Number(page) || 1));
    const sizeRaw = Math.floor(Number(pageSize) || 50);
    const pageSizeNum = Math.max(1, Math.min(200, Number.isFinite(sizeRaw) ? sizeRaw : 50));

    const qb = this.projects.createQueryBuilder('p');
    if (q) {
      qb.where(
        '(LOWER(p.Name) LIKE :q OR LOWER(p.JobNumber) LIKE :q OR LOWER(p.Address) LIKE :q OR LOWER(p.SubCompanyName) LIKE :q)',
        { q: `%${q}%` },
      );
    }
    qb.orderBy('p.LastSeenAt', 'DESC').addOrderBy('p.Id', 'DESC');
    if (wantPaginated) qb.skip((pageNum - 1) * pageSizeNum).take(pageSizeNum);
    const [rows, total] = wantPaginated ? await qb.getManyAndCount() : [await qb.getMany(), 0];

    const projects = rows.map((p) => ({
      id: Number(p.id),
      jobNumber: p.jobNumber,
      name: p.name,
      address: p.address,
      companyId: p.companyId != null ? Number(p.companyId) : null,
      subCompanyId: p.subCompanyId != null ? Number(p.subCompanyId) : null,
      subCompanyName: p.subCompanyName,
      isActive: p.isActive,
      isWarehouse: p.isWarehouse,
      lastSeenAt: p.lastSeenAt?.toISOString?.() ?? null,
    }));

    return wantPaginated
      ? { page: pageNum, pageSize: pageSizeNum, total, projects }
      : { projects };
  }

  /** Latest line-items exports per project (for diagnostics; payload bytes not returned). */
  @Get('exports')
  async listExports(
    @Query('projectId') projectIdRaw?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const wantPaginated = page !== undefined || pageSize !== undefined;
    const pageNum = Math.max(1, Math.floor(Number(page) || 1));
    const sizeRaw = Math.floor(Number(pageSize) || 50);
    const pageSizeNum = Math.max(1, Math.min(200, Number.isFinite(sizeRaw) ? sizeRaw : 50));

    const qb = this.rawExports.createQueryBuilder('e');
    if (projectIdRaw) {
      const pid = Number(projectIdRaw);
      if (Number.isFinite(pid)) qb.where('e.ProjectId = :pid', { pid });
    }
    qb.orderBy('e.FetchedAt', 'DESC').addOrderBy('e.Id', 'DESC');
    if (wantPaginated) qb.skip((pageNum - 1) * pageSizeNum).take(pageSizeNum);
    const [rows, total] = wantPaginated ? await qb.getManyAndCount() : [await qb.getMany(), 0];

    const exports = rows.map((e) => ({
      id: Number(e.id),
      projectId: Number(e.projectId),
      projectName: e.projectName,
      reportType: e.reportType,
      fileName: e.fileName,
      contentType: e.contentType,
      byteLength: e.byteLength,
      httpStatus: e.httpStatus,
      hasPayload: e.payload !== null && (e.byteLength ?? 0) > 0,
      error: e.error,
      fetchedAt: e.fetchedAt?.toISOString?.() ?? null,
    }));

    return wantPaginated
      ? { page: pageNum, pageSize: pageSizeNum, total, exports }
      : { exports };
  }

  /**
   * Stream the most recent successful Line Items XLSX for a given project so
   * the frontend can re-download it without hitting StructShare.  Pass `?id=…`
   * to fetch a specific export id instead of the latest.
   */
  @Get('exports/:projectId/download')
  async downloadLatestForProject(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Query('id') idRaw: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    let row: TrimbleLineItemRawExport | null;
    if (idRaw) {
      row = await this.rawExports.findOne({ where: { id: Number(idRaw) } });
      if (row && Number(row.projectId) !== projectId) {
        throw new NotFoundException('Export does not belong to that project.');
      }
    } else {
      row = await this.rawExports
        .createQueryBuilder('e')
        .where('e.ProjectId = :pid AND e.Payload IS NOT NULL', { pid: projectId })
        .orderBy('e.FetchedAt', 'DESC')
        .getOne();
    }
    if (!row || !row.payload) {
      throw new NotFoundException(`No stored XLSX export found for project ${projectId}.`);
    }
    const filename = row.fileName ?? `trimble_line_items_${projectId}.xlsx`;
    res.setHeader(
      'Content-Type',
      row.contentType ?? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename.replace(/"/g, '')}"`);
    res.setHeader('Content-Length', String(row.payload.length));
    res.end(row.payload);
  }
}
