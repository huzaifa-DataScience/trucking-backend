# Admin: Siteline overdue email template

Lead PM overdue alerts use **HTML templates** stored in SQL (`App_EmailTemplates`).
The runtime template is selected by purpose: `siteline.overdue_leadpm` (only the active template for that purpose is used).

## API (admin JWT required)

Use the generic template management API:

- **List**: `GET /admin/email-templates?purpose=siteline.overdue_leadpm`
- **Get active**: `GET /admin/email-templates/active?purpose=siteline.overdue_leadpm`
- **Update active**: `PUT /admin/email-templates/active?purpose=siteline.overdue_leadpm`
- **Create**: `POST /admin/email-templates` (set `purpose` and `isActive`)
- **Activate**: `POST /admin/email-templates/:templateKey/activate` (enforces single active template per purpose)
- **Update/Delete**: `PUT /admin/email-templates/:templateKey` / `DELETE /admin/email-templates/:templateKey`

## Placeholders

| Placeholder | Meaning |
|-------------|---------|
| `{{leadPmName}}` | Lead PM display name |
| `{{daysThreshold}}` | Days threshold from `OVERDUE_EMAIL_DAYS` (e.g. 50) |
| `{{itemCount}}` | Number of overdue pay apps in this email |
| `{{itemsTableHtml}}` | Pre-built HTML table of rows (do not edit row data here) |

The cron job still uses SMTP settings from `.env` (`SMTP_*`, `OVERDUE_EMAIL_FROM`, `OVERDUE_EMAIL_ENABLED`).
