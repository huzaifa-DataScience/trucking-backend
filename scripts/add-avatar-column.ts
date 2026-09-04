/**
 * One-off migration: add AvatarPath to App_Users (profile photo support).
 * Run from host when sqlcmd is not available in the SQL Server container:
 *   npx ts-node scripts/add-avatar-column.ts
 * Or: npm run add-avatar-column
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
      WHERE object_id = OBJECT_ID('dbo.App_Users') AND name = 'AvatarPath'
    `);
    const count = Number(Object.values(rows[0] ?? {})[0] ?? 0);

    if (count === 0) {
      await dataSource.query(`
        ALTER TABLE dbo.App_Users ADD AvatarPath nvarchar(500) NULL
      `);
      console.log('Added AvatarPath column.');
    } else {
      console.log('AvatarPath column already exists.');
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
