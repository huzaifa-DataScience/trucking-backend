# Clearstory — Projects module (frontend implementation contract)

This doc is **only** for the **Projects** module (project listing + project summary). It reflects the current backend behavior in this repo.

---

## Goals (what the Projects module must do)

- Provide a **single Projects listing view** that can show **all Clearstory-derived columns** from our typed mirror table (`dbo.Clearstory_Projects`).
- Support **server-side pagination** (no “view more” page needed).
- Support **search** (job number / name / customer name).
- Provide a **Project summary view** (contract math + COR buckets) for a selected project.

---

## APIs to use

All routes are under the `/clearstory` prefix and require JWT (same auth as the rest of the app).

## Request semantics (important details)

- **Default sort order**: `updatedAt DESC`, then `id DESC`. (This is fixed right now; no `sort`/`order` params yet.)
- **Truthy flags**: `allColumns` / `full` treat any of these as true: `1`, `true`, `yes`, `on` (case-insensitive). Anything else is false/ignored.
- **Search semantics**: `search` is a case-insensitive **substring** match with **OR** logic across:
  - `name`
  - `jobNumber`
  - `customerName`
- **Search UX**: recommend **debounce 250–400ms** and only send `search` when length is **≥ 2** (frontend choice; backend does not enforce).
- **Project id type**:
  - In JSON responses, `id` is a **number**.
  - In route params, `:id` is a **string path segment** but must parse to an integer (e.g. `/clearstory/projects/99496/summary`).
- **Nullability**: unless otherwise stated, any of these may be `null` when Clearstory did not provide a value or sync is incomplete:
  - `jobNumber`, `customerJobNumber`, `name`, `customerName`, `customerId`, `officeId`, `officeName`, `companyId`, `originType`, `archived`,
    `siteProjectAddress`, `siteStreetAddress`, `siteCity`, `siteState`, `siteZipCode`, `siteCountry`, `startDate`, `endDate`,
    `baseContractValue`, `updatedAt`, `createdAt`.
  The UI should render `null` as “—” (or empty) consistently.

### 1) Projects list (typed mirror columns)

**Endpoint**

- `GET /clearstory/projects`

**Query params**

- `search` (optional): case-insensitive substring match across project **name**, **jobNumber**, **customerName**
- `page` (optional): 1-based page index
- `pageSize` (optional): clamped to 1–200 (default 50 when paginating)
- `allColumns` (optional): when truthy, returns **all typed mirror columns** (see “Fields”)

**Recommended request for the UI**

- `GET /clearstory/projects?allColumns=true&page=1&pageSize=50&search=...`

**Response shape**

- If you **do not** pass `page`/`pageSize`:

```json
{ "projects": [ ... ] }
```

- If you pass **either** `page` or `pageSize`:

```json
{
  "page": 1,
  "pageSize": 50,
  "total": 1234,
  "projects": [ ... ]
}
```

**Fields returned when `allColumns=true`**

These match **all Clearstory-derived columns** from `dbo.Clearstory_Projects` (camelCase in JSON). **Meta** like `LastSyncedAt` is intentionally **not included**.

Recommended **column order** for the Projects table UI (left → right):

- `id`
- `jobNumber`
- `name`
- `customerName`
- `customerId`
- `customerJobNumber`
- `officeId`
- `officeName`
- `companyId`
- `originType`
- `archived`
- `siteProjectAddress`
- `siteStreetAddress`
- `siteCity`
- `siteState`
- `siteZipCode`
- `siteCountry`
- `baseContractValue` (number)
- `updatedAt` (ISO string or null)
- `createdAt` (ISO string or null)

### 2) Payload hydration (no payload returned)

The backend **does not return** the stored Clearstory payload object in the Projects list response.

Instead, when you request `allColumns=true`, the backend may **hydrate missing typed columns** from the stored payload JSON (from `dbo.Clearstory_ApiPayloads`) to prevent partially-synced rows from rendering blank fields.

### 3) Project summary

**Endpoint**

- `GET /clearstory/projects/:id/summary`

**Purpose**

- Returns:
  - `project` (lean header fields)
  - `totals` (COR totals by status buckets)
  - `revisedContractValue`
  - `reconciliation` placeholder

Use this for the project “summary card” view, not for the project listing grid.

### 4) Projects backfill (repair typed columns)

If you ever see projects where `dbo.Clearstory_ApiPayloads` has the right JSON but `dbo.Clearstory_Projects` columns are still null, run:

- `POST /clearstory/projects/backfill` (default `mode=ONLY_MISSING`)

Optional query:

- `mode=ALL` to rewrite all rows from stored payloads
- `mode=ONLY_MISSING` to only fill rows missing key fields (default)

This does **not** call Clearstory — it strictly re-maps from the stored payload JSON already in SQL.

---

## Frontend behavior (recommended)

- **Listing view**
  - Use **server-side pagination** (page + pageSize).
  - Use `allColumns=true` to render the table columns shown in the DB mirror.
  - Search input should call the same endpoint with `search=...` and reset to `page=1`.

- **No “view more” page**
  - Pagination replaces the need for a separate “view more” route. Keep a single listing route and a single summary route.

- **Detail / summary**
  - Clicking a row navigates to a summary page (or opens a panel) driven by `GET /clearstory/projects/:id/summary`.

---

## Example URLs (copy/paste)

- First page:
  - `GET /clearstory/projects?allColumns=true&page=1&pageSize=50`
- Search by job number:
  - `GET /clearstory/projects?allColumns=true&page=1&pageSize=50&search=21272`
- Include full Clearstory payload as well:
  - Not applicable (payload is not returned on this endpoint)

