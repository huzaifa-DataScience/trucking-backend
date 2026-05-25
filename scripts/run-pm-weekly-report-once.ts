/**
 * One-off: send PM weekly report emails (AR aging + Clearstory vs Siteline).
 *
 *   PM_WEEKLY_REPORT_ENABLED=true npm run run-pm-weekly-report
 * Cron default: Monday 6:00 AM America/New_York (see PM_WEEKLY_REPORT_CRON).
 *   npm run run-pm-weekly-report -- --force
 *
 * --force  clears this week's Siteline_WeeklyPmReportLog so emails can send again.
 */
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { SitelinePmWeeklyReportService } from '../src/siteline/siteline-pm-weekly-report.service';
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
        IF OBJECT_ID('dbo.Siteline_WeeklyPmReportLog', 'U') IS NOT NULL
          DELETE FROM dbo.Siteline_WeeklyPmReportLog WHERE WeekStartDate = @0
        `,
        [weekStart],
      );
      console.log(`Cleared weekly PM report log for week ${weekStart} (force).`);
    }
    const testTo = process.env.PM_WEEKLY_REPORT_TEST_TO?.trim();
    console.log(
      `Running PM weekly report… TEST_TO=${testTo || '(none — real PM inboxes)'}`,
    );
    const result = await app.get(SitelinePmWeeklyReportService).runWeeklyReports();
    console.log('Done.', result);
  } finally {
    await app.close();
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
