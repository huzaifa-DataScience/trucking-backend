/**
 * One-off Trimble / StructShare sync.
 *
 *   npm run run-trimble-sync -- --company-items   # catalog only (empty search, all SKUs)
 *   npm run run-trimble-sync -- --project=49849   # one job (fast)
 *   npm run run-trimble-sync                       # full sync (all active projects)
 */
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppModule } from '../src/app.module';
import { TrimbleProject, TrimbleLineItemRawExport } from '../src/database/entities';
import { TrimbleApiClient } from '../src/trimble/trimble-api.client';
import { TrimbleLineItemIngestService } from '../src/trimble/trimble-line-item-ingest.service';
import { TrimbleSyncService } from '../src/trimble/trimble-sync.service';

function argValue(flag: string): string | null {
  const hit = process.argv.find((a) => a.startsWith(`${flag}=`));
  return hit ? hit.slice(flag.length + 1).trim() : null;
}

async function syncOneProject(
  projectId: number,
  api: TrimbleApiClient,
  projects: Repository<TrimbleProject>,
  rawExports: Repository<TrimbleLineItemRawExport>,
  ingest: TrimbleLineItemIngestService,
): Promise<{ ok: boolean; rows: number; bytes: number; error?: string }> {
  const proj = await projects.findOne({ where: { id: projectId as any } });
  if (!proj) {
    return { ok: false, rows: 0, bytes: 0, error: `Trimble_Projects id=${projectId} not found` };
  }

  console.log(`Login + download line-items for ${proj.jobNumber || proj.name} (id=${projectId})…`);
  await api.ensureSession();

  const dl = await api.downloadLineItemsExcel(Number(proj.id), proj.companyId);
  const hasWorkbook = dl.buffer.length > 0;
  const saved = await rawExports.save(
    rawExports.create({
      projectId: Number(proj.id),
      projectName: proj.name,
      reportType: 'line-items',
      fileName: hasWorkbook
        ? dl.fileName ?? `line_items_${proj.id}_${proj.jobNumber || 'project'}.xlsx`
        : null,
      contentType: dl.contentType,
      byteLength: dl.buffer.length,
      payload: hasWorkbook ? dl.buffer : null,
      httpStatus: dl.httpStatus,
      error: null,
      fetchedAt: new Date(),
    }),
  );

  let rows = 0;
  if (hasWorkbook && saved.payload) {
    const buf = Buffer.isBuffer(saved.payload)
      ? saved.payload
      : Buffer.from(saved.payload as Uint8Array);
    rows = await ingest.ingestFromXlsx(Number(proj.id), Number(saved.id), buf);
  } else {
    await ingest.clearForProject(Number(proj.id));
  }

  proj.lastSeenAt = new Date();
  await projects.save(proj);

  return { ok: true, rows, bytes: dl.buffer.length };
}

async function run() {
  const projectRaw = argValue('--project');
  const projectId = projectRaw ? Number(projectRaw) : null;

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'error', 'warn'],
  });

  try {
    if (process.argv.includes('--company-items')) {
      console.log('Trimble company catalog only (search empty — all items)…');
      const result = await app.get(TrimbleSyncService).syncCompanyCatalogNow();
      console.log('Done (company-items).', result);
      if (!result.ok) process.exitCode = 1;
      return;
    }

    if (projectId != null && Number.isFinite(projectId)) {
      const result = await syncOneProject(
        projectId,
        app.get(TrimbleApiClient),
        app.get(getRepositoryToken(TrimbleProject)),
        app.get(getRepositoryToken(TrimbleLineItemRawExport)),
        app.get(TrimbleLineItemIngestService),
      );
      console.log('Done (single project).', result);
      if (!result.ok) process.exitCode = 1;
      return;
    }

    console.log('Running full Trimble sync (all active projects)…');
    const result = await app.get(TrimbleSyncService).syncNow();
    console.log('Done (full).', result);
    if (!result.ok) process.exitCode = 1;
  } finally {
    await app.close();
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
