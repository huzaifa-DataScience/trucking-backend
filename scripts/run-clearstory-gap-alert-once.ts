/**
 * One-off: Send Clearstory gap alert to ops (default: JoAnnabelle).
 *
 *   npm run run-clearstory-gap-alert
 *
 * Recipient: SITELINE_CLEARSTORY_GAP_ALERT_TO (default joannabelle.salalila@Goelservices.com)
 * Requires: SITELINE_CLEARSTORY_GAP_ALERT_ENABLED=true and SMTP/Resend configured.
 */
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { SitelineClearstoryGapAlertService } from '../src/siteline/siteline-clearstory-gap-alert.service';

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'error', 'warn'],
  });
  try {
    const to =
      process.env.SITELINE_CLEARSTORY_GAP_ALERT_TO?.trim() ||
      'joannabelle.salalila@Goelservices.com';
    console.log(`Running Clearstory gap alert… TO=${to}`);
    const result = await app.get(SitelineClearstoryGapAlertService).runGapAlertJob();
    console.log('Done.', result);
    if (!result.ok) process.exit(1);
  } finally {
    await app.close();
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
