import type { CronOptions } from '@nestjs/schedule';

/** US Eastern — Goel / Landover ops default. Handles EST/EDT automatically. */
export const DEFAULT_SITELINE_PM_EMAIL_TIMEZONE = 'America/New_York';

/** Monday 06:00 — PM weekly report (AR aging + Clearstory + T&M). */
export const DEFAULT_PM_WEEKLY_REPORT_CRON = '0 0 6 * * 1';

export function sitelinePmEmailTimeZone(): string {
  return (
    process.env.SITELINE_PM_EMAIL_TIMEZONE?.trim() ||
    process.env.OVERDUE_EMAIL_TIMEZONE?.trim() ||
    DEFAULT_SITELINE_PM_EMAIL_TIMEZONE
  );
}

export function sitelinePmEmailCronOptions(): CronOptions {
  return { timeZone: sitelinePmEmailTimeZone() };
}

export function pmWeeklyReportCronExpression(): string {
  return process.env.PM_WEEKLY_REPORT_CRON?.trim() || DEFAULT_PM_WEEKLY_REPORT_CRON;
}

/** Tuesday 06:00 — PJ consolidated PM report pack (PDF per PM). */
export const DEFAULT_PJ_WEEKLY_REPORT_CRON = '0 0 6 * * 2';

export function pjWeeklyReportCronExpression(): string {
  return process.env.PJ_COR_WEEKLY_REPORT_CRON?.trim() || DEFAULT_PJ_WEEKLY_REPORT_CRON;
}
