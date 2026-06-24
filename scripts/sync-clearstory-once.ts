/**
 * Run one full Clearstory sync (all phases).
 * Usage: npm run sync-clearstory-once
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
    await sync.syncNow();
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
