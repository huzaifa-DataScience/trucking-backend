/**
 * One-off migration: create Bid_Offices lookup table (FollowupCRM-parity "Office" dropdown).
 * Mirrors the shape of Bid_Preferences (Id/Name/SortOrder) — no existing office/branch concept
 * elsewhere in the schema, so this is the one new table for the filter-parity project.
 * Usage: npx ts-node scripts/add-bid-offices-table.ts
 * Or: npm run add-bid-offices-table
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
    await dataSource.query(`
      IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Bid_Offices')
      BEGIN
        CREATE TABLE dbo.Bid_Offices (
          OfficeId int IDENTITY(1,1) NOT NULL PRIMARY KEY,
          Name nvarchar(200) NOT NULL,
          SortOrder int NOT NULL DEFAULT 0
        );
      END
    `);
    console.log('Bid_Offices table ready.');

    const countRows = await dataSource.query(`SELECT COUNT(*) as cnt FROM dbo.Bid_Offices`);
    const count = Number(Object.values(countRows[0] ?? {})[0] ?? 0);
    if (count === 0) {
      await dataSource.query(`
        INSERT INTO dbo.Bid_Offices (Name, SortOrder) VALUES
          ('Main Office', 0)
      `);
      console.log('Seeded a default "Main Office" row.');
    } else {
      console.log(`Bid_Offices already has ${count} row(s); skipped seeding.`);
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
