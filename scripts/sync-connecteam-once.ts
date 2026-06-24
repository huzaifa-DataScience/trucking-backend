/**
 * One-shot Connecteam sync (same as POST /connecteam/sync).
 * Usage: npm run sync-connecteam-once
 */
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ConnecteamSyncService } from '../src/connecteam/connecteam-sync.service';

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    const sync = app.get(ConnecteamSyncService);
    const result = await sync.syncNow();
    console.log('Done.', result);
    if (!result.ok) process.exit(1);
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
