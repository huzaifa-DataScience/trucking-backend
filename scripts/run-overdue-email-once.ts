/**
 * One-off: run Siteline overdue PM email job (uses Siteline_AgingContracts + OVERDUE_EMAIL_TEST_TO).
 *
 *   npx ts-node scripts/run-overdue-email-once.ts
 *   npx ts-node scripts/run-overdue-email-once.ts --force
 *
 * --force  clears today's Siteline_OverdueEmailLog rows so the job can send again.
 */
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { SitelineOverdueEmailService } from '../src/siteline/siteline-overdue-email.service';
import { DataSource } from 'typeorm';

async function run() {
  const force = process.argv.includes('--force');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'error', 'warn'],
  });
  try {
    if (force) {
      const ds = app.get(DataSource);
      const r = await ds.query(`
        DELETE FROM dbo.Siteline_OverdueEmailLog
        WHERE NotificationDate = CONVERT(date, SYSUTCDATETIME())
      `);
      console.log('Cleared today overdue notification log (force).', r);
    }
    const testTo = process.env.OVERDUE_EMAIL_TEST_TO?.trim();
    console.log(
      `Running overdue email job… OVERDUE_EMAIL_ENABLED=${process.env.OVERDUE_EMAIL_ENABLED} TEST_TO=${testTo || '(none — real PM inboxes)'}`,
    );
    await app.get(SitelineOverdueEmailService).sendOverdueEmails();
    console.log('Done.');
  } finally {
    await app.close();
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
