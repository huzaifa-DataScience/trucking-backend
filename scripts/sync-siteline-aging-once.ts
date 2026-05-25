/**
 * Run one Siteline aging snapshot sync (all entities per SITELINE_AGING_COMPANY_ID_MODE).
 * Usage: npm run sync-siteline-aging-once
 */
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { SitelineSyncService } from '../src/siteline/siteline-sync.service';

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    const sync = app.get(SitelineSyncService);
    await sync.syncAgingSnapshot();
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
