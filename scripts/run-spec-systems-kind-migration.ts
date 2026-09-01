/**
 * Add Bid_SpecSystems.Kind + HVAC/Plumbing/Duct rows from EstimationFile List.
 * Usage: npm run bidding-migrate-spec-systems
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
    const sql = readFileSync(join(__dirname, 'sql', 'add-bid-spec-systems-kind.sql'), 'utf8');
    const batches = sql
      .split(/\r?\n\s*GO\s*\r?\n/i)
      .map((b) => b.trim())
      .filter((b) => b.replace(/--[^\n]*/g, '').trim().length > 0);
    for (const batch of batches) {
      await ds.query(batch);
    }
    const counts = await ds.query(`
      SELECT Kind, COUNT(*) AS n FROM dbo.Bid_SpecSystems GROUP BY Kind ORDER BY Kind
    `);
    console.log('✓ Bid_SpecSystems kind + List abbreviations ready.', counts);
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
