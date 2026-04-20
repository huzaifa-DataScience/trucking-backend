# Clearstory — frontend guide & API contract (DB mirror)

The dashboard **does not call Clearstory’s API**. The Nest app syncs Clearstory into **SQL Server**; the UI calls **`/clearstory/*`** with JWT.

**Backend in four lines (so nothing is “hidden”):**  
(1) Cron / `POST /clearstory/sync` pulls Clearstory and writes **typed tables** + **`Clearstory_ApiPayloads`** (full JSON per resource).  
(2) **Lean reads**: project list, project summary, per-project COR list.  
(3) **Paginated table grids** (full-row `swagger` + `typedMirror` per row): **`GET /clearstory/tables/cors|tags|customers|contracts`** and **`GET /clearstory/tables/company`** — see [Table grid API](#table-grid-api) and **`docs/frontend-clearstory-tables-draft.md`**.  
(4) **Single-resource full JSON** (by id / composite key): **`GET /clearstory/api-payload`** — CNs, rates, offices, per-id drill-in, etc.

---

## Read this first: modules are **not** all “under Projects”

**What went wrong in the mental model:** the **first** backend routes we shipped were project-centric (`/clearstory/projects`, `.../summary`, `.../cors`). That does **not** mean the frontend must keep COR log, tags, directory, change notifications, rates, and sync **inside the Projects app shell or folder**.

**What you should do instead:**

1. **Treat each area as its own frontend module** — separate route segments, separate feature folders, separate data hooks/stores. Example layout (names are yours; the idea is **isolation**):

   | Module | Own your… | Example app routes (frontend only) |
   |--------|-----------|-------------------------------------|
   | **Projects** | Project list + picker + summary card | `/clearstory/projects`, `/clearstory/projects/[id]` |
   | **COR log** | COR table + filters + COR detail drawer | `/clearstory/cor` (with `?projectId=` if needed) **or** `/clearstory/projects/[id]/cor` — but **code** lives in `cor-log/`, not mixed into `projects/` screens |
   | **Tags** | Tag screens | `/clearstory/tags` (and later list API) |
   | **Change notifications** | CN inbox + detail | `/clearstory/change-notifications` |
   | **Directory** | Customers, offices, users, labels, contracts, divisions | `/clearstory/directory/...` sub-routes |
   | **Rates** | Company + project LMEO | `/clearstory/rates` |
   | **Ops / sync** | Sync button, health, “last synced” | `/clearstory` layout header, or `/clearstory/settings` |

2. **Only two lean endpoints today require a `projectId` in the URL path:**  
   `GET /clearstory/projects/:id/summary` and `GET /clearstory/projects/:id/cors`.  
   Everything else you need is either **global** (`/sync`, `/status`, `/projects` list) or **`api-payload`** with its **own** `type` + `key` (no requirement to nest those calls under a React “Projects” page).

3. **Backend is already flat:** all REST paths are ` /clearstory/<thing> ` — there is **no** Nest route like `/clearstory/projects/:id/tags` forcing a project tree. So **your** separation is a **frontend discipline**: don’t put Directory API calls only inside `projects/[id]/page.tsx`; give Directory its own module and routes.

4. **Anti-pattern to avoid:** one mega `projects/` feature that also fetches tags, CNs, customers, and rates “because the user opened a project”. Split **navigation** and **code ownership** so each module imports only the HTTP helpers it needs.

---

## Clearstory as multiple sub-modules

**Workspace** = what the user sees. **Frontend sub-module** = your code split (lazy routes, feature folders, state). **They should be separate modules in code** even when the nav nests a COR screen under a project in the UI.

**Backend path prefix is always** `https://<api-host>/clearstory/...`. Browser-visible paths like `/clearstory/directory` are **your choice**; they are not required to mirror old “everything under projects” structure.

| Sub-module | Purpose | Lean API (typed DTOs) | Full JSON (Swagger-shaped) | When to ask backend for new routes |
|------------|---------|------------------------|-----------------------------|-------------------------------------|
| **Projects** | Lists, pickers, project shell, summary $ | `GET /projects`, `GET /projects/:id/summary` | `api-payload` `type=project` | Paginated org-wide project search, extra summary fields on lean DTO |
| **COR log** | Per-project register, buckets/filters | `GET /projects/:id/cors`; org-wide grid **`GET /tables/cors`** | `api-payload` `type=cor`; grid rows carry **`swagger`** | Search/sort on grid, exports |
| **Tags** | Tags by job/project | **`GET /tables/tags`** | `api-payload` `type=tag`; grid **`swagger`** | Search/sort on grid |
| **Change notifications** | CN inbox, CN + per-contract | *(none yet)* | `api-payload` `change_notification`, `cn_contract` | **`GET /change-notifications`** list + filters |
| **Directory** | Customers, contracts (grids); offices, users, … | **`GET /tables/customers`**, **`GET /tables/contracts`** | `api-payload` per entity; grids **`swagger`** | Other entities + **search** on grids |
| **Company** | Current org (single row) | **`GET /tables/company`** | `api-payload` `type=company&key=current`; same **`swagger`** on `row` | Extra company fields only if Clearstory adds them |
| **Rates** | Company / project LMEO | *(none yet)* | `api-payload` `rate`, `project_rate` | **Grid APIs** with filters |
| **Ops / sync** | Manual refresh, health | `POST /sync`, `GET /status` | — | More ops fields (e.g. per-phase errors) if product needs them |

---

## Table grid API

Paths below are under **`/clearstory/tables/...`**. All use **JWT** (same as the rest of Clearstory).

### List endpoints (same response body, different `module` and path)

`GET /clearstory/tables/cors`  
`GET /clearstory/tables/tags`  
`GET /clearstory/tables/customers`  
`GET /clearstory/tables/contracts`  

**Query:** `page` (1-based), `pageSize` (default 50, max 200). Optional **`projectId`** on **cors** and **tags** only (filters typed mirror `ProjectId`; invalid value → no filter).

**Response body** (identical shape for all four; only **`module`** string changes to match the path):

| Field | Type | Meaning |
|-------|------|---------|
| `module` | `"cors"` \| `"tags"` \| `"customers"` \| `"contracts"` | Echo of which grid |
| `page` | number | Page requested |
| `pageSize` | number | Page size used |
| `total` | number | Total rows matching filter (all pages) |
| `rows` | array | Page of **`ClearstoryTableRow`** (see below) |

**`ClearstoryTableRow`** (each element of `rows`):

| Field | Type | Meaning |
|-------|------|---------|
| `resourceKey` | string | Key for `GET /clearstory/api-payload` (`cor` id string, or numeric id as string for tag/customer/contract) |
| `swagger` | object \| `null` | Full Clearstory JSON for that resource (list + detail merged on sync). Key always present; use `null` when missing. |
| `typedMirror` | object | All columns we mirror in SQL (camelCase). Always present. |

Nested keys **inside** `swagger` follow **Clearstory’s** naming — not renamed by our API.

### Company (single row)

`GET /clearstory/tables/company` → **`{ "module": "company", "row": ClearstoryTableRow | null }`**. When nothing is synced, **`row`** is **`null`**. When present, **`row.resourceKey`** is always **`current`**.

### Canonical detail

Samples, `projectId` semantics, and UI column strategy: **`docs/frontend-clearstory-tables-draft.md`**.

---

## Sub-module specs

### Projects

- **Purpose**: Choose a project; show header + contract math.  
- **Lean**: `GET /clearstory/projects?search=` (optionally paginated with `page` + `pageSize`), `GET /clearstory/projects/:id/summary`.  
- **List (all typed columns)**: `GET /clearstory/projects?search=&allColumns=true` — returns **all columns from** `dbo.Clearstory_Projects` (Clearstory-derived typed mirror fields).  
- **Full JSON**: `GET /clearstory/api-payload?type=project&key=<projectId>` — nested `address`, `contractWithCustomer`, etc., as returned by Clearstory (merged list + `GET /projects/:id` on sync).  
- **Gaps**: No dedicated “project detail” lean route; use `api-payload` or extend `summary` if you want specific fields without loading full JSON.

### COR log

- **Purpose**: Change order table for one project; bucket tabs; or org-wide grid.  
- **Lean**: `GET /clearstory/projects/:id/cors` + `bucket` / `status` / `stage`.  
- **Grid (paginated, full `swagger` per row)**: `GET /clearstory/tables/cors` — optional `projectId`; response shape in [Table grid API](#table-grid-api).  
- **Full JSON (single id)**: `GET /clearstory/api-payload?type=cor&key=<corId>` (`corId` = string id from list or `resourceKey`).  
- **Gaps**: Search/sort query params on the grid not implemented yet.

### Tags

- **Purpose**: Tag list/detail for reporting.  
- **Grid**: `GET /clearstory/tables/tags` — optional `projectId`; same list response shape as other table endpoints.  
- **Full JSON (single id)**: `GET /clearstory/api-payload?type=tag&key=<tagId>`.  
- **Gaps**: Search/sort on grid; no dedicated “explorer” beyond `api-payload` for other types.

### Change notifications

- **Purpose**: CN header + contract-level rows.  
- **Lean**: *none*.  
- **Full JSON**:  
  - CN: `?type=change_notification&key=<cnId>`  
  - CN↔contract: **prefer** `?type=cn_contract&cnId=<cnId>&contractId=<contractId>` (avoids `:` parsing), or `key=<cnId>:<contractId>` (both numeric today).  
- **Gaps**: No CN inbox list API.

### Directory

- **Purpose**: Reference grids (customers, contracts, offices, users, …).  
- **Grids**: `GET /clearstory/tables/customers`, `GET /clearstory/tables/contracts` — same paginated list body as COR/tags; see [Table grid API](#table-grid-api).  
- **Full JSON**: `api-payload` with `type` = `customer` | `user` | `office` | `division` | `contract` | `label` | `company` and documented `key`.  
- **Gaps**: Paginated grids for user/office/label/division; **search** on existing grids.

### Company (current org)

- **Purpose**: Single current-company profile row.  
- **Grid**: `GET /clearstory/tables/company` → `{ module, row }` with same **`ClearstoryTableRow`** fields on **`row`** when synced.  
- **Full JSON**: `GET /clearstory/api-payload?type=company&key=current`.

### Rates

- **Purpose**: LMEO rate books.  
- **Lean**: *none*.  
- **Full JSON**:  
  - Company: `?type=rate&rateType=<labor|material|equipment|other>&recordId=<id>` or `key=<rateType>:<recordId>`.  
  - Project: `?type=project_rate&projectId=<id>&rateType=<...>&recordId=<id>` or `key=<projectId>:<rateType>:<recordId>`.  
- **Gaps**: No rate grid API.

### Ops / sync

- **Purpose**: Trigger sync; show health / freshness.  
- **Lean**: `POST /clearstory/sync`, `GET /clearstory/status` (stable DTO below).  
- **Full JSON**: *n/a*.  
- **Gaps**: `lastSuccessfulRunAt` is only set after a **full** sync completes all phases without throwing; partial failures may leave it stale — confirm UX with product.

---

## Every resource in `swagger.json` ↔ our mirror (not just Projects / COR / Tags)

**Swagger** lists **all** Clearstory Web API paths (this repo’s `swagger.json` is titled **Clearstory Web API** ~v1.9). Your **dashboard modules** are how **you** group screens; the table below maps **each Swagger area** to **whether we sync it**, **`api-payload`** (if any), and a **suggested** module — so nothing is implied to be “only three” resources.

| Swagger path (group) | We sync it today? | Read full JSON via `GET /clearstory/api-payload` (`type` → `key`) | Typed SQL table(s) | Suggested UI module |
|----------------------|-------------------|-------------------------------------------------------------------|----------------------|---------------------|
| **`/companies/current`** | Yes | `company` → `current` | `Clearstory_Company` | Directory / company |
| **`/companies/current/users`** (paged) | Yes | `user` → `{id}` | `Clearstory_Users` | Directory |
| **`/companies/current/offices`** (paged) | Yes | `office` → `{id}` | `Clearstory_Offices` | Directory |
| **`/companies/current/divisions`** (paged) | Yes | `division` → `{division}` | `Clearstory_Divisions` | Directory |
| **`/contracts`** (paged) | Yes | `contract` → `{id}` | `Clearstory_Contracts` | Directory |
| **`/customers`**, **`/customers/{id}`** | Yes (detail optional) | `customer` → `{id}` | `Clearstory_Customers` + `Clearstory_CustomerOffices` | Directory |
| **`/labels`**, **`/labels/{id}`** | Yes | `label` → `{id}` | `Clearstory_Labels` | Directory |
| **`/projects`**, **`/projects/{id}`** | Yes | `project` → `{id}` | `Clearstory_Projects` | **Projects** |
| **`/change-notifications`** (paged), **`/{id}`**, **`/{id}/{contractId}`** | Yes | `change_notification` → `{cnId}`; `cn_contract` → `cnId`+`contractId` | `Clearstory_ChangeNotifications`, `Clearstory_ChangeNotificationContracts` | **Change notifications** |
| **`/cors`** (paged), **`/cors/{id}`** | Yes | `cor` → `{corId}` | `Clearstory_Cors` | **COR log** (+ lean `GET .../projects/:id/cors`) |
| **`/cors/overview`** | Yes | `cors_overview` → `inbox=sent` \| `inbox=received` | also `Clearstory_SyncSnapshots` (history) | COR / analytics |
| **`/cors/contract-summary`** | Yes | `cors_contract_summary` → `inbox=sent` \| `inbox=received` | also snapshots | COR / analytics |
| **`/cors/{id}/labels`** | **No** — not called in our `ClearstoryService` | — | — | If product needs it: **request backend** to add sync + payload type |
| **`/tags`** (paged), **`/tags/{id}`** | Yes | `tag` → `{id}` | `Clearstory_Tags` | **Tags** |
| **`/rates/{rateType}`** (paged) | Yes | `rate` → `rateType:recordId` | `Clearstory_Rates` | **Rates** |
| **`/rates/project/{projectId}/{rateType}`** (paged) | Yes | `project_rate` → `projectId:rateType:recordId` | `Clearstory_ProjectRates` | **Rates** |
| **`/attachments`** | **No** — not in sync | — | — | Swagger describes it; **we do not mirror** until implemented |
| **Our sync / health** | N/A | — | `Clearstory_SyncState`, `Clearstory_ApiPayloads`, … | **Ops / sync** — **`POST /clearstory/sync`**, **`GET /clearstory/status`** are **not** in Swagger |

**How to use this with Swagger**

1. Find the **path** you care about in **`swagger.json`** (e.g. `/customers/{id}`).
2. Check **“We sync it?”** — if **No**, there is **no** row in `Clearstory_ApiPayloads` and no mirror; only live Clearstory would have it.
3. If **Yes**, the **`payload`** from **`api-payload`** is meant to match **that** operation’s response body shape (list row + detail merged where we fetch both). Use Swagger as the **field dictionary** for that JSON.
4. **Dashboard routing** (Projects vs Directory vs Tags, etc.) is **yours** — this table only suggests where each **Swagger area** usually belongs in the product.

**Is Swagger “enough” for all of these?**

- **Enough** to learn **request/response shapes** Clearstory defines for **each** path above.
- **Not enough** for: our **Nest** URLs, **JWT**, **sync**, **`api-payload` `type`/`key`**, **lean** DTOs (`/projects/:id/cors`, `summary`), or paths we **don’t** sync yet (`/attachments`, `/cors/{id}/labels`). For that, use **this doc** + code.

---

## Swagger vs dashboard (short)

Root **`swagger.json`** = **Clearstory Web API** reference for **all** paths it defines (see **“Every resource in swagger.json”** above for a complete checklist against our sync). **`/clearstory/*`** = **our** contract. Use Swagger as a **field dictionary** for **`api-payload.payload`**; use **this doc** for Nest routes, sync, and anything not in Swagger.

---

## UX routing (frontend only)

- **Prefer top-level sibling routes per module** (see table in “Read this first”) so code stays split. Nesting `/projects/[id]/cor` in the **URL** is optional UX; if you do it, still keep **COR log** logic in a **dedicated module** that receives `projectId` as a param — don’t implement COR inside the Projects feature file.
- HTTP stays flat: `GET /clearstory/projects/:id/cors` is the same whether your Next route is `/clearstory/cor?projectId=` or `/clearstory/projects/[id]/cor`.
- Document your chosen URL pattern in the repo README or app router; backend does not care.

---

## `GET /clearstory/api-payload` — contract (confirmed)

### Query parameters

| Param | Required | Notes |
|-------|----------|--------|
| `type` | **Yes** | Exact string, **case-sensitive**, **snake_case** as in the table below. |
| `key` | Usually | Opaque lookup key (**case-sensitive**). Must **exactly** match what sync stored (trimmed on server). |
| `cnId` + `contractId` | For `cn_contract` | **Recommended** instead of `key` — builds `key` internally. |
| `projectId` + `rateType` + `recordId` | For `project_rate` | **Recommended** instead of `key`. |
| `rateType` + `recordId` | For `rate` | **Recommended** if you omit `key`. |

### Responses

- **200**: `{ resourceType, resourceKey, lastFetchedAt, payload }` — `payload` is parsed JSON (object or array).  
- **400**: Missing `type`, or missing `key` / composite pieces for that `type`.  
- **404**: No row in `Clearstory_ApiPayloads`, **or** `PayloadJson` null/empty, **or** stored string is not valid JSON. **We do not return 200 with an empty payload.**

### `type` → `key` (stored form)

| `type` | `key` format | Notes |
|--------|----------------|--------|
| `company` | `current` | |
| `user` | `<userId>` | Decimal string, e.g. `42` |
| `office` | `<officeId>` | |
| `division` | `<division>` | Full division string (same as DB PK); **case-sensitive** |
| `contract` | `<contractId>` | |
| `customer` | `<customerId>` | Detail merge only if `CLEARSTORY_CUSTOMER_DETAIL` enabled |
| `label` | `<labelId>` | |
| `project` | `<projectId>` | |
| `cor` | `<corId>` | COR id as returned by API (string) |
| `tag` | `<tagId>` | |
| `change_notification` | `<cnId>` | String id |
| `cn_contract` | `<cnId>:<contractId>` | **Both segments numeric today**; use `cnId` + `contractId` query params to avoid manual join |
| `rate` | `<rateType>:<recordId>` | `rateType` ∈ `labor` \| `material` \| `equipment` \| `other` |
| `project_rate` | `<projectId>:<rateType>:<recordId>` | Use structured query params when possible |
| `cors_overview` | `inbox=sent` **or** `inbox=received` | **Only these two** keys are written by current sync |
| `cors_contract_summary` | `inbox=sent` **or** `inbox=received` | Same |

### Composite keys and `:`

If a future Clearstory id could contain `:`, **do not** pack it into a single `key` string — use the **structured** query parameters (`cnId`/`contractId`, `projectId`/`rateType`/`recordId`) so the server builds the key. Until then, documented formats assume **numeric** ids for the segments around `:`.

---

## Database map (mirror ↔ sub-modules)

| Tables | Sub-module(s) | Read path today |
|--------|----------------|-----------------|
| `Clearstory_Projects` | Projects | Lean list + summary |
| `Clearstory_Cors` | COR log | Lean per-project list |
| `Clearstory_Tags` | Tags | Typed DB only; UI via `api-payload` or future API |
| `Clearstory_ChangeNotifications`, `Clearstory_ChangeNotificationContracts` | CNs | `api-payload` |
| `Clearstory_Customers`, `Clearstory_CustomerOffices`, `Clearstory_Offices`, … | Directory | `api-payload` (+ typed tables when list APIs exist) |
| `Clearstory_Rates`, `Clearstory_ProjectRates` | Rates | `api-payload` |
| `Clearstory_ApiPayloads` | **All** (full JSON) | `GET /api-payload` |
| `Clearstory_SyncState` | Ops | `lastSuccessfulRunAt` exposed via `GET /status` |
| `Clearstory_SyncSnapshots` | Internal | Append-only; not primary UI |

---

## Implemented HTTP API

Base: **`/clearstory`**. JWT on all routes below unless noted.

| Route | Owner sub-module(s) | Description |
|-------|---------------------|-------------|
| `GET /projects?search=` | **Projects** | Lean project list |
| `GET /projects/:id/summary` | **Projects** | Totals + revised contract value |
| `GET /projects/:id/cors` | **COR log** | Lean COR list + filters |
| `GET /api-payload` | **All** (as needed) | Full Clearstory JSON for one stored resource |
| `POST /sync` | **Ops** | Full sync (same as cron) |
| `GET /status` | **Ops** | Health / freshness (see DTO below) |

### `GET /clearstory/status` (stable DTO)

```json
{
  "module": "clearstory",
  "ready": true,
  "syncRunning": false,
  "lastSuccessfulRunAt": "2026-04-10T21:05:00.000Z",
  "message": "Clearstory mirror (DB-backed sync). ..."
}
```

- **`syncRunning`**: `true` while a `syncNow` (cron or `POST /sync`) is in progress.  
- **`lastSuccessfulRunAt`**: ISO string from `Clearstory_SyncState` key `lastSuccessfulRunAt`, or `null` if never completed successfully.  
- Use for headers: “Last full sync …” / disable sync button when `syncRunning`.

### `POST /clearstory/sync`

- **Ops**. Returns `{ ok, message }`; `ok: false` if sync already running.

### Lean route details (Projects + COR)

**`GET /clearstory/projects?search=`** — default (no pagination params): `{ projects: [...] }`.  
If `page` or `pageSize` is provided, response becomes: `{ page, pageSize, total, projects: [...] }`.  
Search is case-insensitive substring on name, jobNumber, customerName.

**`GET /clearstory/projects/:id/summary`** — `project`, `totals` (bucket $), `revisedContractValue`, `reconciliation` (placeholder for Siteline/Foundation).

**`GET /clearstory/projects/:id/cors`** — query `bucket` | `status` | `stage`; `items` include `statusBucket` (VOID includes rejected/void; draft → IN_REVIEW for buckets).

---

## Display conventions

| Topic | Guidance |
|-------|----------|
| Staleness | `lastSyncedAt` on lean rows; `lastFetchedAt` on `api-payload`; `lastSuccessfulRunAt` on `/status`. |
| Empty lists | Distinguish empty data vs sync failure. |
| Money | Normalize number/string from JSON in one util. |
| COR labels | Friendly labels in UI; raw `status` in tooltips. |

---

## Open points — product / future backend

Resolved in this doc: **`type`/`key` case rules**, **404 vs empty payload**, **composite key** helpers (`cnId`+`contractId`, etc.), **`cors_*` keys** (only `inbox=sent` / `inbox=received`), **`/status` DTO**.

Still open (coordinate as you ship):

| Topic | Notes |
|-------|--------|
| **Next.js URL convention** | If the repo standardizes on e.g. `/clearstory/projects/[id]` vs `[projectId]`, add one line to **UX routing** above — purely documentation. |
| **Module ship order** | If CNs or Rates ship before Directory, adjust sprint planning; APIs above already support `api-payload` for those. |
| **Partial sync failure** | Today `lastSuccessfulRunAt` updates only if the whole `syncNow` try-block completes — clarify whether ops UI should show per-phase status (would need new backend fields or logs). |
| **Seventh sub-module** | e.g. “Attachments” — not in mirror yet; add row to planning table when scoped. |

---

## Backend coordination

- New **list/grid** endpoints: request when `api-payload` per id is too slow or awkward.  
- New fields on **existing lean** responses: small change; or use `api-payload` for that resource.

This file is the living contract for Clearstory frontend modules and `/clearstory` HTTP behavior.
