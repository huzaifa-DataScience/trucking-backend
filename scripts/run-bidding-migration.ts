/**
 * Create bidding tables + seed lookups from scripts/sql/add-bidding-tables.sql.
 * Usage: npm run bidding-migrate
 */
import 'dotenv/config';
import { readFileSync } from 'fs';
import { join } from 'path';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    const ds = app.get(DataSource);
    const sql = readFileSync(join(__dirname, 'sql', 'add-bidding-tables.sql'), 'utf8');
    const batches = sql
      .split(/\r?\n\s*GO\s*\r?\n/i)
      .map((b) => b.trim())
      .filter((b) => b.replace(/--[^\n]*/g, '').trim().length > 0);
    for (let i = 0; i < batches.length; i++) {
      await ds.query(batches[i]);
    }
    console.log('✓ Bidding tables created/seeded.');
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
