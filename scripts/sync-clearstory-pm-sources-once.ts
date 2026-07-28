/**
 * Sync Clearstory data needed for PM weekly report (projects + CORs + contracts + snapshots).
 * Faster than full sync; use when website data changed and reports need a refresh.
 *
 *   npm run sync-clearstory-pm-sources-once
 */
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ClearstorySyncService } from '../src/clearstory/clearstory-sync.service';

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    const sync = app.get(ClearstorySyncService);
    const counts = await sync.syncPmReportSourcesNow();
    console.log('Clearstory PM-report sources synced:', counts);
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
