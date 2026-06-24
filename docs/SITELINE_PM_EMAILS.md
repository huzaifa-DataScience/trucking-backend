# Siteline PM email (backend)

**Repo:** `trucking` (NestJS API).

| Topic | Backend doc | Frontend doc |
|--------|-------------|--------------|
| Company filter (`entityId`) | **[SITELINE_COMPANY_FILTER.md](./SITELINE_COMPANY_FILTER.md)** | `trucking-frontend/FRONTEND_SITELINE_COMPANY_FILTER.md` |
| PM Monday report (this file) | this file | `trucking-frontend/FRONTEND_SITELINE_PM_EMAILS.md` |

## What PMs get

**One email per PM, every Monday 6:00 AM US Eastern** (`America/New_York`):

1. **AR aging** — all projects with open AR across **GOEL, GOEL DC, DCB** (entities 1–3)
2. **Clearstory vs Siteline** — bill comparison columns per project
3. **T&amp;M / COR alerts** — Clearstory COR rows in review with T&amp;M tag numbers (same rules as before)

Template: `siteline.pm_weekly_report`  
Service: `src/siteline/siteline-pm-weekly-report.service.ts`

**There is no separate weekday overdue email cron.** Legacy overdue-only send: `npm run run-overdue-email` (optional, `OVERDUE_EMAIL_ENABLED=true`).

## Ops email (not PMs)

**Clearstory gap alert** — weekdays 08:15 UTC, **one email** to ops (`SITELINE_CLEARSTORY_GAP_ALERT_TO`) with all companies (GOEL, GOEL DC, DCB). Sends **every weekday** — gap table when issues exist, or an **all-clear** message when everything matches. See `siteline-clearstory-gap-alert.service.ts`.

**PJ weekly PM report pack** — **Tuesday 6:00 AM US Eastern** to PJ (`PJ_COR_WEEKLY_REPORT_TO`): one email with **a PDF per PM** (same report PMs receive Monday, refreshed after sync). See `siteline-pj-weekly-report.service.ts`.

## Env

```env
PM_WEEKLY_REPORT_ENABLED=true
PM_WEEKLY_REPORT_CRON=0 0 6 * * 1
SITELINE_PM_EMAIL_TIMEZONE=America/New_York
PM_WEEKLY_REPORT_DAYS=50
PM_WEEKLY_REPORT_TEST_TO=
# Falls back to OVERDUE_EMAIL_TEST_TO when PM_WEEKLY_REPORT_TEST_TO is empty

SMTP_HOST=...
OVERDUE_EMAIL_FROM=...

**Resend (recommended):** set `RESEND_API_KEY` and `RESEND_FROM` (verified domain). All PM/PJ/ops emails use `OutboundEmailService` — Resend when the key is set, otherwise SMTP. `EMAIL_PROVIDER=resend|smtp|auto` (default `auto`).

# Legacy weekday overdue cron — disabled; do not enable unless testing old job
OVERDUE_EMAIL_ENABLED=false
```

**Aging sync** must be running (`SITELINE_API_URL_SECONDARY` + Firebase). Data comes from `Siteline_AgingContracts` per entity 1/2/3.

**Manual test:** `npm run run-pm-weekly-report`

Restart API after env changes.

## Related

- **[SITELINE_COMPANY_FILTER.md](./SITELINE_COMPANY_FILTER.md)** — Billings UI `entityId` on aging APIs.
