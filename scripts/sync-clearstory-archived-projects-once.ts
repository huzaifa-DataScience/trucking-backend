/**
 * Refresh archived Clearstory projects only (sets Archived=true in DB).
 * Much faster than a full sync — no CORs, contracts, or rates.
 *
 * Usage: npm run sync-clearstory-archived-projects-once
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
    const saved = await sync.syncArchivedProjectsNow();
    console.log(`Done. ${saved} archived project(s) refreshed.`);
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
