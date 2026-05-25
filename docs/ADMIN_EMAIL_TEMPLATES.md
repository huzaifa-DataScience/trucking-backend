# Admin Email Templates (Backend)

Admins can manage multiple email templates stored in SQL and assign them to different **purposes**.
At send-time the backend selects the **active** template for the chosen purpose.

## Best-practice model
1. `TemplateKey`: unique technical key (string, primary key)
2. `Purpose`: runtime selector (string like `signup.pending`)
3. Only one template is **active** per purpose (`IsActive=true`)
4. Templates use `{{placeholderName}}` variables

## API (Admin JWT required)
All routes are under `admin/email-templates`.

Base: `admin/email-templates`

### List templates
`GET /admin/email-templates?purpose=<purpose>`

### List known purposes
`GET /admin/email-templates/purposes`
Response:
```json
{ "purposes": ["siteline.overdue_leadpm"] }
```

### Get active template by purpose
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

### Update active template by purpose
`PUT /admin/email-templates/active?purpose=<purpose>`
Request:
```json
{ "subjectTemplate": "...", "bodyHtmlTemplate": "<p>...</p>", "name": "..." }
```
Response:
```json
{ "message": "Active template updated", "template": { "..." } }
```

### Update a specific template by templateKey (can be inactive)
`PUT /admin/email-templates/:templateKey`
Body (any subset):
```json
{
  "purpose": "siteline.overdue_leadpm",
  "name": "New name",
  "subjectTemplate": "New subject",
  "bodyHtmlTemplate": "<p>New body</p>",
  "isActive": false
}
```
Response:
```json
{ "message": "Template updated" }
```

### Create template
`POST /admin/email-templates`

Body:
```json
{
  "templateKey": "siteline.overdue_leadpm.v1",
  "purpose": "siteline.overdue_leadpm",
  "name": "Siteline overdue (lead PM)",
  "subjectTemplate": "Overdue pay apps (> {{daysThreshold}} days): {{itemCount}} item(s)",
  "bodyHtmlTemplate": "<p>Hi {{leadPmName}},</p>{{itemsTableHtml}}",
  "isActive": true
}
```

### Update template
`PUT /admin/email-templates/:templateKey`

Body (any subset):
```json
{
  "purpose": "siteline.overdue_leadpm",
  "name": "New name",
  "subjectTemplate": "New subject",
  "bodyHtmlTemplate": "<p>New body</p>",
  "isActive": false
}
```

### Activate template (enforces single active per purpose)
`POST /admin/email-templates/:templateKey/activate`

### Delete template
`DELETE /admin/email-templates/:templateKey`

## Placeholders
Templates are rendered by replacing any `{{placeholderName}}` with the backend-provided value.
Unknown placeholders become empty strings.

