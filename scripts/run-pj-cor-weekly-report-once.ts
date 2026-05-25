/**
 * One-off: PJ weekly PM report pack — one PDF per PM attached (same report as Monday PM email).
 *
 *   PJ_COR_WEEKLY_REPORT_ENABLED=true npm run run-pj-cor-weekly-report
 *   npm run run-pj-cor-weekly-report -- --force
 *
 * Cron default: Tuesday 6:00 AM America/New_York (see PJ_COR_WEEKLY_REPORT_CRON).
 */
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { SitelinePjWeeklyReportService } from '../src/siteline/siteline-pj-weekly-report.service';
import { DataSource } from 'typeorm';

function weekStartIsoDate(): string {
  const d = new Date();
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

async function run() {
  const force = process.argv.includes('--force');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'error', 'warn'],
  });
  try {
    if (force) {
      const weekStart = weekStartIsoDate();
      const ds = app.get(DataSource);
      await ds.query(
        `
        IF OBJECT_ID('dbo.Clearstory_PjCorWeeklyReportLog', 'U') IS NOT NULL
          DELETE FROM dbo.Clearstory_PjCorWeeklyReportLog WHERE WeekStartDate = @0
        `,
        [weekStart],
      );
      console.log(`Cleared PJ weekly report log for week ${weekStart} (force).`);
    }
    const testTo = process.env.PJ_COR_WEEKLY_REPORT_TEST_TO?.trim();
    console.log(`Running PJ weekly report pack… TEST_TO=${testTo || '(PJ_COR_WEEKLY_REPORT_TO)'}`);
    const result = await app.get(SitelinePjWeeklyReportService).runPjWeeklyReportPack();
    console.log('Done.', result);
  } finally {
    await app.close();
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
