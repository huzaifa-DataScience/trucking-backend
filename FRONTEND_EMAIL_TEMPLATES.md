# Frontend Email Templates Contract

## How emails are sent
The backend is responsible for sending emails. The frontend does **not** select templates or compose email bodies.

Admins edit email templates in the backend DB. Email jobs/controllers pick the **active** template by `purpose` at send-time.

## Template selector: `purpose`
Purpose is a technical string (recommended format: `domain.action`) used to select the active template.

Examples:
- `signup.pending`
- `signup.welcome`
- `password.reset`
- `siteline.overdue_leadpm` (current implemented email job)

## Placeholder syntax
Templates use `{{placeholderName}}` variables.

At runtime the backend replaces placeholders with values from the email job/service.
If a placeholder is missing in the provided context, it becomes an empty string.

## Current implemented purpose + placeholders
### `siteline.overdue_leadpm`
Backend sends to the lead PM email for overdue pay apps (> 50 days, configurable).

Available placeholders:
- `{{leadPmName}}`
- `{{daysThreshold}}`
- `{{itemCount}}`
- `{{itemsTableHtml}}` (backend-provided HTML table of overdue items)

## Admin API (backend routes) — what the frontend should call
Base route: `admin/email-templates`

1. List templates (optionally filter by purpose)
`GET /admin/email-templates?purpose=<purpose>`
Response: array of templates with fields:
- `templateKey`, `purpose`, `name`, `subjectTemplate`, `bodyHtmlTemplate`, `isActive`, `activatedAt`, `updatedAt`
Behavior when `purpose` is omitted: returns all templates across all purposes.

2. (Required for editing) Update a specific template by `templateKey` (can be inactive)
`PUT /admin/email-templates/:templateKey`
Request body (any subset):
```json
{ "purpose": "siteline.overdue_leadpm", "name": "New name", "subjectTemplate": "...", "bodyHtmlTemplate": "<p>...</p>", "isActive": false }
```
Response:
```json
{ "message": "Template updated" }
```
Purpose immutability: `purpose` is editable on this endpoint. If you set `isActive=true`, the template will become the active one for its (possibly updated) `purpose` (single-active-per-purpose enforced). If `isActive=false`, it stays inactive.

3. List known purposes wired to backend email jobs
`GET /admin/email-templates/purposes`
Response:
```json
{ "purposes": ["siteline.overdue_leadpm"] }
```

4. Get the active template for a purpose (single-active-per-purpose model)
`GET /admin/email-templates/active?purpose=<purpose>`
Response:
```json
{
  "templateKey": "siteline.overdue_leadpm.v1",
  "purpose": "siteline.overdue_leadpm",
  "name": "Siteline overdue (lead PM)",
  "subjectTemplate": "...",
  "bodyHtmlTemplate": "<p>...</p>",
  "isActive": true,
  "activatedAt": "2026-03-20T01:25:50.000Z",
  "updatedAt": "2026-03-20T01:25:55.000Z",
  "placeholders": ["{{leadPmName}}", "{{daysThreshold}}", "{{itemCount}}", "{{itemsTableHtml}}"]
}
```

5. Update the active template for a purpose
`PUT /admin/email-templates/active?purpose=<purpose>`
Request body:
```json
{ "subjectTemplate": "...", "bodyHtmlTemplate": "<p>...</p>", "name": "..." }
```
Response:
```json
{ "message": "Active template updated", "template": { ...same fields as GET active... } }
```

6. Activate another template row (optional; used when editing a non-active template)
`POST /admin/email-templates/:templateKey/activate`
Response:
```json
{ "message": "Template activated" }
```

7. Create a new template
`POST /admin/email-templates`
Request body:
```json
{
  "templateKey": "siteline.overdue_leadpm.v1",
  "purpose": "siteline.overdue_leadpm",
  "name": "Siteline overdue (lead PM)",
  "subjectTemplate": "Overdue pay apps (> {{daysThreshold}} days): {{itemCount}} item(s)",
  "bodyHtmlTemplate": "<p>Hi {{leadPmName}},</p>{{itemsTableHtml}}",
  "isActive": false
}
```
Response:
```json
{ "message": "Template created", "template": { ...created fields... } }
```

8. Delete a template
`DELETE /admin/email-templates/:templateKey`
Response:
```json
{ "message": "Template deleted" }
```

UX expectation:
- You can select an inactive template and edit it via `PUT /admin/email-templates/:templateKey` (no need to activate first).
- When ready, call `POST /admin/email-templates/:templateKey/activate` to make it the active template for that purpose.

Placeholders for inactive templates:
- There is no separate “placeholders by templateKey” endpoint.
- Placeholders are tied to `purpose`, so if you are editing an inactive template, call `GET /admin/email-templates/active?purpose=<thatTemplate.purpose>` and use the returned `placeholders` for UI help/chips.
Note: this endpoint requires that there is at least one active template for the given `purpose`. If none exists, the call will fail until an admin activates one.

## Recommended future purposes (not yet implemented in code)
Admins can create templates for these purposes now, but the backend email sending must be implemented for each event:
- `invoice.issue_notification` (example: invoice has an issue)
- `invoice.reminder` (example: invoice reminder)
- `support.escalation`
- `auth.login_alert`

When you implement a new email event, ensure the backend provides a context that matches the placeholders used by the template.

