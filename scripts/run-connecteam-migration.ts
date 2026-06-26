/**
 * Create Connecteam mirror tables from scripts/sql/add-connecteam-tables.sql.
 * Usage: npm run connecteam-migrate
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
    const sqlFiles = ['add-connecteam-tables.sql', 'add-connecteam-write-support.sql'];
    for (const file of sqlFiles) {
      const sql = readFileSync(join(__dirname, 'sql', file), 'utf8');
      const batches = sql
        .split(/\r?\n\s*GO\s*\r?\n/i)
        .map((b) => b.trim())
        .filter((b) => b.replace(/--[^\n]*/g, '').trim().length > 0);
      for (const batch of batches) {
        await ds.query(batch);
      }
      console.log(`✓ ${file}`);
    }
    console.log('✓ Connecteam tables ready.');
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
