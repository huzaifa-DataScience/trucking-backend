# Trimble Materials / StructShare — frontend API guide

The Nest app syncs StructShare **project line-items** (Excel/XLSX) into SQL (`dbo.Trimble_ProjectLineItems`). The UI reads that data via **`/trimble/*`** routes using the **same JWT** as the rest of the dashboard (`Authorization: Bearer <token>`).

**Flow at a glance**

1. Backend cron or **`POST /trimble/sync`** downloads/parses XLSX per project.
2. **`GET /trimble/projects`** lists mirrored projects (pick a `projectId`).
3. **`GET /trimble/line-items/columns`** → dynamic grid headers (SQL column names match Excel headers).
4. **`GET /trimble/line-items`** or **`GET /trimble/projects/:projectId/line-items`** → paginated rows for that project.

Optional diagnostics: **`GET /trimble/status`**, **`GET /trimble/exports`**, **`GET /trimble/exports/:projectId/download`** (stream stored XLSX).

---

## Authentication

Every route below requires **`JwtAuthGuard`**.

```http
Authorization: Bearer <jwt>
```

Missing or invalid token → **401** (same behavior as `/clearstory/*` or other guarded routes).

---

## Base URL

Replace `<api-host>` with your deployed API origin (no extra global prefix in Nest unless your deployment adds one):

```
https://<api-host>/trimble/...
```

---

## Projects (picker / list)

### `GET /trimble/projects`

Mirrored Trimble projects (sorted by `lastSeenAt` desc, then `id` desc).

**Query**

| Param       | Required | Default | Notes                                      |
|------------|----------|---------|--------------------------------------------|
| `search`   | No       | —       | Case-insensitive substring on name, job number, address, sub-company |
| `page`     | No       | —       | If omitted with no `pageSize`, returns **all** rows (no `total`) |
| `pageSize` | No       | 50      | Only used when paginating; max **200**    |

**Response — unpaginated** (no `page` / `pageSize` in query)

```json
{
  "projects": [
    {
      "id": 24826,
      "jobNumber": "...",
      "name": "...",
      "address": "...",
      "companyId": 1,
      "subCompanyId": null,
      "subCompanyName": "...",
      "isActive": true,
      "isWarehouse": false,
      "lastSeenAt": "2026-04-28T12:00:00.000Z"
    }
  ]
}
```

**Response — paginated** (`page` and/or `pageSize` provided)

```json
{
  "page": 1,
  "pageSize": 50,
  "total": 123,
  "projects": [ /* same project objects */ ]
}
```

Use **`projects[].id`** as **`projectId`** for line-items endpoints.

---

## Line items — column definitions (grid headers)

### `GET /trimble/line-items/columns`

Returns **ordered** SQL column names for `dbo.Trimble_ProjectLineItems` (same order as `INFORMATION_SCHEMA` / physical table).

Always includes fixed columns such as **`Id`**, **`ProjectId`**, **`ExcelRowNumber`**, followed by columns derived from Excel headers (names may contain spaces and mixed casing).

**Response**

```json
{
  "columns": ["Id", "ProjectId", "ExcelRowNumber", "Item Name", "..."]
}
```

**UI guidance**

- Build table columns from **`columns`** (hide internal columns if you prefer).
- Row objects from the paginated endpoints use **these strings as keys** (SQL Server preserves identifier casing as stored).

---

## Line items — paginated rows

Two URLs return the **same** JSON shape; choose whichever fits your router.

### Option A — query parameter

### `GET /trimble/line-items`

**Query**

| Param       | Required | Default | Max |
|------------|----------|---------|-----|
| `projectId`| **Yes**  | —       | —   |
| `page`     | No       | 1       | —   |
| `pageSize` | No       | 50      | 500 |

Invalid or missing **`projectId`** (not a finite number) → **400** `BadRequestException`.

### Option B — REST-shaped path

### `GET /trimble/projects/:projectId/line-items`

**Path**

| Param        | Meaning        |
|-------------|----------------|
| `projectId` | Numeric project id |

**Query**

| Param       | Default | Max |
|------------|---------|-----|
| `page`     | 1       | —   |
| `pageSize` | 50      | 500 |

### Shared response shape

```json
{
  "page": 1,
  "pageSize": 50,
  "total": 1240,
  "projectId": 24826,
  "rows": [
    {
      "Id": "1",
      "ProjectId": "24826",
      "ExcelRowNumber": 2,
      "Item Name": "...",
      "...": "..."
    }
  ]
}
```

**Semantics**

| Field       | Meaning |
|------------|---------|
| `total`    | Row count for **`WHERE ProjectId = projectId`** |
| `rows`     | Page of arbitrary key/value pairs (**dynamic keys** from SQL). |
| Ordering   | Rows ordered by **`ExcelRowNumber`** ascending (matches spreadsheet order). |

**Types**

- Values are passed through from SQL; **`Date`** instances are serialized to **ISO strings**.
- **`bigint`/numeric** columns may appear as **strings** in JSON depending on the driver — coerce numbers in the UI when formatting.

---

## Ops & diagnostics

### `GET /trimble/status`

Health + last-run summary for the Trimble sync worker.

### `POST /trimble/sync`

Triggers a full sync if none is running. If sync already active → `{ "ok": false, "message": "Trimble sync is already running." }`.

---

## Raw exports metadata

### `GET /trimble/exports`

Latest downloaded exports (diagnostics). Optional **`projectId`** filter.

Optional pagination: **`page`**, **`pageSize`** (max **200**). Same pattern as projects: omit both for full list without `total`.

**Row fields include:** `id`, `projectId`, `projectName`, `reportType`, `fileName`, `contentType`, `byteLength`, `httpStatus`, `hasPayload`, `error`, `fetchedAt`.

---

## Download stored XLSX (optional)

### `GET /trimble/exports/:projectId/download`

Streams the **most recent successful** stored Line Items XLSX for that project.

**Query**

| Param | Meaning |
|-------|---------|
| `id`  | Optional — specific **`Trimble_LineItemRawExports`** row id; must belong to `:projectId` |

**Responses**

- **404** — no payload for project, or export id mismatch.
- Binary body with `Content-Type` / `Content-Disposition` / `Content-Length` set.

Useful if the UI needs “download original Excel” without calling StructShare from the browser.

---

## Error summary

| Situation                         | Typical HTTP |
|-----------------------------------|--------------|
| Not authenticated                 | 401          |
| `line-items` without valid `projectId` | 400    |
| Export download missing / wrong project | 404    |

---

## Suggested frontend integration

1. **Project picker**: `GET /trimble/projects` (with `search` + pagination if the list is large).
2. **Grid bootstrap**: `GET /trimble/line-items/columns` once (or cache until next deploy/sync if columns rarely change).
3. **Grid data**: `GET /trimble/projects/:projectId/line-items?page=&pageSize=` with virtual scrolling or page controls (`total` drives page count).

**Not implemented yet** (ask backend if product needs them): server-side **filter/search/sort** query params on line-items — today sorting is fixed (`ExcelRowNumber`), filtering must be client-side or added server-side later.
