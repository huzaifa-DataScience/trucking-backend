/**
 * Delete Siteline mirror data for one Ref_OurEntities company, then re-sync from API.
 *
 *   npm run reset-siteline-entity -- 2        # GOEL DC
 *   npm run reset-siteline-entity -- 2 --no-sync
 */
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { SitelineSyncService } from '../src/siteline/siteline-sync.service';
import { DataSource } from 'typeorm';

const entityId = Math.trunc(Number(process.argv[2] || '2'));
const runSync = !process.argv.includes('--no-sync');

async function purgeEntity(ds: DataSource, id: number): Promise<void> {
  const names: Record<number, string> = { 1: 'GOEL', 2: 'GOEL DC', 3: 'DCB' };
  console.log(`Purging Siteline data for entityId=${id} (${names[id] ?? '?'})…`);

  const payApps = await ds.query(
    `
    DELETE pa
    FROM dbo.Siteline_PayApps pa
    INNER JOIN dbo.Siteline_Contracts c ON c.id = pa.contractId
    WHERE c.EntityId = @0
    `,
    [id],
  );
  console.log(`  PayApps deleted: ${payApps?.[1] ?? '?'}`);

  const contracts = await ds.query(
    `DELETE FROM dbo.Siteline_Contracts WHERE EntityId = @0`,
    [id],
  );
  console.log(`  Contracts deleted: ${contracts?.[1] ?? '?'}`);

  const agingRows = await ds.query(
    `
    DELETE ac
    FROM dbo.Siteline_AgingContracts ac
    INNER JOIN dbo.Siteline_AgingSummary s ON s.Id = ac.SnapshotId
    WHERE s.EntityId = @0
    `,
    [id],
  );
  console.log(`  Aging contract rows deleted: ${agingRows?.[1] ?? '?'}`);

  const summaries = await ds.query(
    `DELETE FROM dbo.Siteline_AgingSummary WHERE EntityId = @0`,
    [id],
  );
  console.log(`  Aging summaries deleted: ${summaries?.[1] ?? '?'}`);
}

async function main(): Promise<void> {
  if (![1, 2, 3].includes(entityId)) {
    console.error('entityId must be 1, 2, or 3');
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    const ds = app.get(DataSource);
    await purgeEntity(ds, entityId);

    if (!runSync) {
      console.log('Purge done (--no-sync).');
      return;
    }

    console.log('Running contract + pay-app sync (all entities)…');
    await app.get(SitelineSyncService).syncContractsAndPayApps();

    console.log('Running aging snapshot sync (all entities)…');
    await app.get(SitelineSyncService).syncAgingSnapshot();

    const counts = await ds.query(
      `
      SELECT
        (SELECT COUNT(*) FROM dbo.Siteline_Contracts WHERE EntityId = @0) AS contracts,
        (SELECT COUNT(*) FROM dbo.Siteline_Contracts WHERE EntityId = @0 AND status = 'ACTIVE') AS activeContracts,
        (SELECT COUNT(*) FROM dbo.Siteline_AgingContracts ac
           INNER JOIN dbo.Siteline_AgingSummary s ON s.Id = ac.SnapshotId
           WHERE s.EntityId = @0
             AND s.Id = (SELECT TOP 1 Id FROM dbo.Siteline_AgingSummary WHERE EntityId = @0 ORDER BY CreatedAt DESC)
        ) AS latestAgingRows
      `,
      [entityId],
    );
    console.log('After sync:', counts[0]);
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
