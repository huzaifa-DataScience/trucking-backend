/**
 * Backfill TmTagNumbers / ManualTmTag / TmTagCount / DaysInReview on Clearstory_Cors
 * from stored Clearstory_ApiPayloads (type=cor). Run after SQL column migration.
 *
 *   npx ts-node scripts/backfill-clearstory-cor-tm-tags.ts
 */
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';
import { extractCorTmFields } from '../src/clearstory/clearstory-cor-fields.util';

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });
  try {
    const ds = app.get(DataSource);
    await ds.query(`
      IF COL_LENGTH('dbo.Clearstory_Cors', 'TmTagNumbers') IS NULL
        ALTER TABLE dbo.Clearstory_Cors ADD TmTagNumbers nvarchar(500) NULL;
      IF COL_LENGTH('dbo.Clearstory_Cors', 'ManualTmTag') IS NULL
        ALTER TABLE dbo.Clearstory_Cors ADD ManualTmTag nvarchar(255) NULL;
      IF COL_LENGTH('dbo.Clearstory_Cors', 'TmTagCount') IS NULL
        ALTER TABLE dbo.Clearstory_Cors ADD TmTagCount int NULL;
      IF COL_LENGTH('dbo.Clearstory_Cors', 'DaysInReview') IS NULL
        ALTER TABLE dbo.Clearstory_Cors ADD DaysInReview decimal(18,4) NULL;
    `);

    const payloads: Array<{ ResourceKey: string; PayloadJson: string }> = await ds.query(`
      SELECT ResourceKey, PayloadJson
      FROM dbo.Clearstory_ApiPayloads
      WHERE ResourceType = 'cor' AND PayloadJson IS NOT NULL
    `);

    let updated = 0;
    for (const row of payloads) {
      let body: unknown;
      try {
        body = JSON.parse(row.PayloadJson);
      } catch {
        continue;
      }
      const tm = extractCorTmFields(body, null);
      const daysRaw = (body as Record<string, unknown>)?.daysInReview;
      const daysInReview =
        daysRaw != null && Number.isFinite(Number(daysRaw)) ? Number(daysRaw) : null;

      if (!tm.tmTagNumbers && !tm.manualTmTag && tm.tmTagCount == null && daysInReview == null) {
        continue;
      }

      await ds.query(
        `
        UPDATE dbo.Clearstory_Cors
        SET
          TmTagNumbers = COALESCE(@0, TmTagNumbers),
          ManualTmTag = COALESCE(@1, ManualTmTag),
          TmTagCount = COALESCE(@2, TmTagCount),
          DaysInReview = COALESCE(@3, DaysInReview)
        WHERE Id = @4
      `,
        [tm.tmTagNumbers, tm.manualTmTag, tm.tmTagCount, daysInReview, row.ResourceKey],
      );
      updated += 1;
    }

    console.log(`Backfill complete. COR payloads processed=${payloads.length}, rows updated=${updated}`);
  } finally {
    await app.close();
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
