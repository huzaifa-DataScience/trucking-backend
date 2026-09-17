/**
 * One-off migration: add AssistantManager to Bid_Teams.
 * Run: npx ts-node scripts/add-assistant-manager-column.ts
 *
 * Uses the same DB config as the app (.env / ConfigModule).
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
    const rows = await dataSource.query(`
      SELECT COUNT(*) as cnt
      FROM sys.columns
      WHERE object_id = OBJECT_ID('dbo.Bid_Teams') AND name = 'AssistantManager'
    `);
    const count = Number(Object.values(rows[0] ?? {})[0] ?? 0);

    if (count === 0) {
      await dataSource.query(`
        ALTER TABLE dbo.Bid_Teams ADD AssistantManager nvarchar(100) NULL
      `);
      console.log('Added AssistantManager column.');
    } else {
      console.log('AssistantManager column already exists.');
    }
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
