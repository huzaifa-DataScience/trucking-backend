# Siteline aging & overdue — frontend instructions

Use this document when updating the dashboard for **aging report**, **overdue list**, and related types. All listed routes require a **JWT** (same as other `/siteline/*` routes).

---

## 1. `invoiceDate` on aging responses

**Backward compatible:** existing fields are unchanged; add support for the new field where needed.

### Meaning

| UI label (suggested) | JSON field | Source |
|---------------------|------------|--------|
| **Invoice date** | `invoiceDate` | Billing period **start** from Siteline, stored as **`StartDate`** on pay apps |

- Type: **`string | null`** — ISO 8601 (e.g. `2025-03-01T00:00:00.000Z`).
- **`null`** or missing: no start date on the relevant pay app; show “—” or hide the cell.

### `GET /siteline/aging-report`

- Each **`rows[]`** object may include **`invoiceDate`** (optional key).
- It matches the same pay app used for **`invoiceNumber`** (latest qualifying pay app for that row’s contract or project group).

### `GET /siteline/aging-overdue`

- Each **`items[]`** object includes **`invoiceDate`** for **that** pay-app line.

### Checklist

1. Extend TypeScript types for report rows and overdue items with **`invoiceDate?: string | null`** (report) and **`invoiceDate: string | null`** (overdue).
2. Render **Invoice date** using the same date formatting approach as **`dueDate`** (locale/timezone as per product).
3. Handle **`null`** / absent.

---

## 2. Configurable overdue threshold — `minDaysPastDue`

**`GET /siteline/aging-overdue`** no longer assumes a fixed “> 50 days” rule in the UI layer: the backend accepts a **minimum days past due** (inclusive).

### Query parameter

| Name | Type | Default | Behavior |
|------|------|---------|----------|
| **`minDaysPastDue`** | integer (optional) | **51** | Return only pay apps where **`daysPastDue >= minDaysPastDue`** |

- **Omit the parameter** → default **51**, which matches the previous behavior of “more than 50 days” (integer day counts: **≥ 51** full days past due).
- **Examples:** `?minDaysPastDue=10` → at least 10 days past due; `?minDaysPastDue=23` → at least 23 days.
- Backend clamps invalid values with **`Math.max(0, floor(...))`**.

### Suggested UI

1. **Preset control** (dropdown or chips): e.g. 10, 23, 30, 50, 60 days — map each choice to `minDaysPastDue` (remember default **51** if you want to keep the old “> 50” tab exactly: send **51** or send nothing).
2. **Custom input** (optional): numeric field bound to `minDaysPastDue`.
3. **Loading / refetch:** when the user changes the threshold, call the API again with the new query string; do not filter only on the client unless you also want to narrow further (server is source of truth for inclusion).

### Example requests

```http
GET /siteline/aging-overdue
GET /siteline/aging-overdue?minDaysPastDue=10
GET /siteline/aging-overdue?minDaysPastDue=23&search=acme
```

### Checklist

1. Add **`minDaysPastDue`** to your API client for **`/siteline/aging-overdue`** (optional query param).
2. Decide default UX: **no param** (backend 51) vs explicitly sending **`51`** — behavior is the same.
3. Update copy: e.g. “At least {N} days past due” so it matches inclusive semantics.
4. **`daysPastDue`** on each item is still returned; use it for columns and sorting as today.

---

## 3. `GET /siteline/aging-report` and `minDaysPastDue`

On the **aging report** endpoint, **`minDaysPastDue`** is still an **optional** filter (no default): when sent, it restricts which pay-app rows contribute to buckets in the **local pay-apps** path. It does **not** use the overdue default of 51.

If the frontend only uses **`minDaysPastDue`** on the overdue screen, no change is required for aging-report unless you already pass it there.

---

## Questions

Contact the backend team if you need additional fields, different default semantics, or OpenAPI/Swagger export for these routes.
