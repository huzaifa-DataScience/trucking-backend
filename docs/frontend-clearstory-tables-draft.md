# Clearstory table modules — backend contract & frontend draft

This doc is the implementation brief for **COR**, **T&M tags** (`tags` in our API), **customers**, **contracts**, and **company** as **separate screens**, each backed by a **single list (or single-row) HTTP call** with **no N+1** `api-payload` traffic.

---

## Principles

1. **Authoritative “all Swagger fields”**: use each row’s **`swagger`** object — it is the parsed body Clearstory returned, merged list + detail where sync fetches both (same source as `GET /clearstory/api-payload`).
2. **Never blank a row**: if sync failed to store JSON, **`swagger`** is `null` and **`typedMirror`** still has every column we mirror in SQL (camelCase). The UI can treat `swagger: null` as “payload missing” without needing a dedicated backend flag.
3. **Pagination**: all list endpoints use **`page`** (1-based) and **`pageSize`** (default 50, max 200). UI must page server-side for large tenants.
4. **JWT**: same as the rest of `/clearstory/*` — `JwtAuthGuard`.

---

## Endpoints

| Module | Method & path | Query params | Response |
|--------|----------------|--------------|----------|
| COR | `GET /clearstory/tables/cors` | `page`, `pageSize`, optional `projectId` | `ClearstoryTablePage` |
| Tags (T&M) | `GET /clearstory/tables/tags` | `page`, `pageSize`, optional `projectId` | `ClearstoryTablePage` |
| Customers | `GET /clearstory/tables/customers` | `page`, `pageSize` | `ClearstoryTablePage` |
| Contracts | `GET /clearstory/tables/contracts` | `page`, `pageSize` | `ClearstoryTablePage` |
| Company | `GET /clearstory/tables/company` | — | `{ module, row }` — `row` may be `null` if nothing synced |

### Response body per endpoint

- **`/tables/cors`**, **`/tables/tags`**, **`/tables/customers`**, **`/tables/contracts`** — **the same JSON schema**. Only **`module`** differs (`"cors"` \| `"tags"` \| `"customers"` \| `"contracts"`). The frontend can use one `ClearstoryTablePageResponse` type for all four.
- **`/tables/company`** — **different** top-level shape: **`{ module: "company", row }`** with no `page` / `total` / `rows`.

### `ClearstoryTablePage` (lists)

```json
{
  "module": "cors",
  "page": 1,
  "pageSize": 50,
  "total": 1234,
  "rows": [
    {
      "resourceKey": "…",
      "swagger": { },
      "typedMirror": { },
      "typedMirror": { }
    }
  ]
}
```

### Company row

Same row shape as one element of `rows`, with **`resourceKey`** always **`current`** (matches `api-payload` `type=company&key=current`).

---

## Backend confirmation (Nest)

Aligned with `ClearstoryTableService` / `ClearstoryTablesController`. If the UI lives in another package, keep its API client comments (e.g. `getClearstoryTablePage` / table row types) in sync with this section.

- **Envelope**: JSON keys are **camelCase** (`module`, `page`, `pageSize`, `total`, `rows`, `resourceKey`, `swagger`, `typedMirror`, `row`). No snake_case transform on these routes.
- **Envelope**: JSON keys are **camelCase** (`module`, `page`, `pageSize`, `total`, `rows`, `resourceKey`, `swagger`, `typedMirror`, `row`). No snake_case transform on these routes.
- **`swagger`**: Always serialized as **`null`** or a **plain object** — the key is never omitted. If stored JSON is missing, invalid, or a non-object (e.g. array), the backend treats it as no swagger (`null`).
- **`typedMirror`**: Always a **plain object** (string keys, camelCase mirror fields). Never omitted.
- **`total`**: Page count field is **`total`**, not `totalCount`.
- **`module` (lists)**: One of **`cors` | `tags` | `customers` | `contracts`** (matches path segment after `/clearstory/tables/`).
- **`module` (company)**: Always **`company`**; body is **`{ module, row }`** where **`row`** is **`ClearstoryTableRow | null`** (not `rows`).
- **`projectId` (COR / tags)**: Query param name is **`projectId`**. If the value is missing or not a finite integer, the backend **does not filter** (no 400). Valid integer filters on the typed mirror **`ProjectId`** column.
- **Inside `swagger`**: Property names and nesting are **whatever Clearstory returned** — not normalized by our API. Only the **wrapper** row shape is ours.

### Minimal samples (copy-paste checks)

`GET /clearstory/tables/cors?page=1&pageSize=2` (shape only):

```json
{
  "module": "cors",
  "page": 1,
  "pageSize": 2,
  "total": 42,
  "rows": [
    {
      "resourceKey": "12345",
      "swagger": { "id": 12345, "status": "in_review" },
      "typedMirror": {
        "id": "12345",
        "projectId": 7,
        "status": "in_review"
      }
    }
  ]
}
```

`GET /clearstory/tables/company` when nothing synced:

```json
{
  "module": "company",
  "row": null
}
```

---

## Building the table columns (Swagger-complete)

**Recommended approach**

1. On first successful load, take **`rows[0].swagger`** (or merge keys across the first N rows) and **`Object.keys(...)`** (recursively flatten nested objects if you need flat columns — product decision).
2. **Stable column order**: sort keys alphabetically at the leaf level, or maintain a **hand-curated order** copied from `swagger.json` `components.schemas` for readability.
3. **Cell renderer**: for path `a.b.c`, read `row.swagger?.a?.b?.c`; if `swagger` is null, fall back to **`typedMirror`** only for top-level mirror fields (nested Swagger-only fields stay empty until payload exists).
4. **Always show** meta columns: `resourceKey` (and for COR/tag optionally join `typedMirror.projectId` / `jobNumber` for filters). Any other UI-only columns (like “payload missing”) should be derived from `swagger === null`.

**Swagger reference** (this repo): `swagger.json` — schemas such as **`Customer`**, **`Contract`**, **`Company`**, **`CompanyDetail`**, and COR/tag list/detail models under the COR and Tags paths. Our **`swagger`** field is the runtime object; treat the OpenAPI file as the **documentation** of names and nesting, not as generated TS (unless you add codegen later).

---

## Frontend module layout (draft)

| Feature folder | Route example | Data hook |
|----------------|---------------|-----------|
| `clearstory/cor-table/` | `/clearstory/cor` | `useClearstoryTable('cors', { projectId })` |
| `clearstory/tags-table/` | `/clearstory/tags` | `useClearstoryTable('tags', { projectId })` |
| `clearstory/customers-table/` | `/clearstory/directory/customers` | `useClearstoryTable('customers')` |
| `clearstory/contracts-table/` | `/clearstory/directory/contracts` | `useClearstoryTable('contracts')` |
| `clearstory/company/` | `/clearstory/company` | `useQuery(['clearstory','tables','company'], fetchCompany)` |

**`useClearstoryTable` sketch**

- Build URL: `/clearstory/tables/${module}?page=${page}&pageSize=${pageSize}` + optional `projectId`.
- Return `{ rows, total, page, setPage, isLoading, error }`.
- Table component: generic `<DataGrid rows={rows} getCell={(r, path) => …} />` with column defs derived from `swagger` keys as above.

**Ops**

- After **POST /clearstory/sync**, refetch active table queries; **`GET /clearstory/status`** `lastSuccessfulRunAt` is your freshness hint for a banner.

---

## Backend ↔ sync alignment (for reviewers)

| `module` / path | `resourceType` in `Clearstory_ApiPayloads` | `resourceKey` |
|-----------------|--------------------------------------------|---------------|
| `cors` | `cor` | COR string `id` |
| `tags` | `tag` | numeric id as string |
| `customers` | `customer` | customer id as string |
| `contracts` | `contract` | contract id as string |
| `company` | `company` | always `current` |

If any of these drift in sync code, update this table and the service constants in `clearstory-table.service.ts` (`CLEARSTORY_TABLE_RESOURCE_TYPES`).

---

## Future hardening (not blocking v1)

- **Search / sort** query params backed by SQL indexes and documented sort whitelist.
- **CSV export** stream from the same service with cursor pagination.
- **OpenAPI** for Nest (`@nestjs/swagger`) generated from shared DTOs if product wants first-class API docs beside `swagger.json`.
