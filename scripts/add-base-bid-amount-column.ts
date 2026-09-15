/**
 * One-off migration: add Bids.BaseBidAmount, backfilled from each bid's latest
 * client calc snapshot (baseBid.pjEstimate) so the Estimates list can sort/filter/export
 * on it without re-running the calc engine.
 * Usage: npx ts-node scripts/add-base-bid-amount-column.ts
 * Or: npm run add-base-bid-amount-column
 */
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  const dataSource = app.get(DataSource);

  try {
    const columnRows = await dataSource.query(`
      SELECT COUNT(*) as cnt
      FROM sys.columns
      WHERE object_id = OBJECT_ID('dbo.Bids') AND name = 'BaseBidAmount'
    `);
    const columnCount = Number(Object.values(columnRows[0] ?? {})[0] ?? 0);

    if (columnCount === 0) {
      await dataSource.query(`
        ALTER TABLE dbo.Bids ADD BaseBidAmount decimal(14, 2) NULL
      `);
      console.log('Added BaseBidAmount column.');
    } else {
      console.log('BaseBidAmount column already exists.');
    }

    const result = await dataSource.query(`
      ;WITH Latest AS (
        SELECT
          s.BidId,
          s.ComputedJson,
          ROW_NUMBER() OVER (PARTITION BY s.BidId ORDER BY s.SnapshotId DESC) AS rn
        FROM dbo.Bid_CalcSnapshots s
        WHERE s.Source = 'client'
      )
      UPDATE b
      SET b.BaseBidAmount = TRY_CAST(JSON_VALUE(l.ComputedJson, '$."baseBid.pjEstimate"') AS decimal(14, 2))
      FROM dbo.Bids b
      JOIN Latest l ON l.BidId = b.BidId AND l.rn = 1
      WHERE b.BaseBidAmount IS NULL
        AND JSON_VALUE(l.ComputedJson, '$."baseBid.pjEstimate"') IS NOT NULL
    `);
    console.log('Backfilled BaseBidAmount from latest client snapshots.', result);
    console.log('Migration done.');
  } finally {
    await app.close();
  }
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
