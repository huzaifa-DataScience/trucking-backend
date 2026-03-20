# Aging Report (Frontend)

This document describes how to integrate the **Siteline aging report** in the frontend:

- The main **aging report** tab (bucketed by days‑past‑due).
- The **Over 50 Days** tab (individual items where daysPastDue > 50 and amount > 0, with project manager info).

---

## What the report is

The aging report answers: **“For each project, how much money (net dollars) is in each ‘days past due’ bucket?”**

- **Net dollars** = amount due to the contractor for that pay app = (Billed − Retention) ÷ 100 (values are stored in cents).
- **Buckets** = how many days past the pay app due date:
  - **Current** — not overdue (due date today or in the future)
  - **1-30 Days** — 1–30 days overdue
  - **31-60 Days** — 31–60 days overdue
  - **61-90 Days** — 61–90 days overdue
  - **91-120 Days** — 91–120 days overdue
  - **>120 Days** — more than 120 days overdue

Only pay apps that are **not** `PAID` or `DRAFT` are included (i.e. open/in-progress items).

Data comes from the **synced** Siteline tables (cron runs every 10 minutes). No query params; the backend returns the full pivot.

---

## Endpoint – Main Aging Report

```
GET /siteline/aging-report
```

- **Base URL:** Same as the rest of the API (e.g. `http://localhost:3000` in development).
- **Auth:** When auth is enabled, send the JWT:
  ```
  Authorization: Bearer <access_token>
  ```
- **Query params:** None.
- **Method:** GET.

### Optional filters (query params)

All filters are **optional**. If omitted, the backend returns the full dataset.

- **`search`**: case-insensitive substring match across `projectName`, `projectNumber`, `internalProjectNumber`, `leadPmName`, `leadPmEmail`.
- **`overdueOnly`**: `true|false` — when `true`, excludes non-overdue items (`daysPastDue <= 0`).
- **`minDaysPastDue` / `maxDaysPastDue`**: numbers (inclusive).
- **`minNetDollars` / `maxNetDollars`**: numbers in **dollars** (inclusive).
- **`includeStatuses` / `excludeStatuses`**: comma-separated statuses (exact match). Example: `includeStatuses=PROPOSED,SIGNED`.

---

## Response shape – Main Aging Report

### Success (200)

```json
{
  "buckets": ["Current", "1-30 Days", "31-60 Days", "61-90 Days", "91-120 Days", ">120 Days"],
  "rows": [
    {
      "projectName": "Project Alpha",
      "invoiceNumber": 12,
      "buckets": {
        "Current": 15000.50,
        "1-30 Days": 0,
        "31-60 Days": 2200.00,
        "61-90 Days": 0,
        "91-120 Days": 0,
        ">120 Days": 0
      },
      "projectTotal": 17200.50
    },
    {
      "projectName": "Project Beta",
      "buckets": {
        "Current": 0,
        "1-30 Days": 8500.00,
        "31-60 Days": 0,
        "61-90 Days": 0,
        "91-120 Days": 0,
        ">120 Days": 0
      },
      "projectTotal": 8500.00
    }
  ],
  "totals": {
    "Current": 15000.50,
    "1-30 Days": 8500.00,
    "31-60 Days": 2200.00,
    "61-90 Days": 0,
    "91-120 Days": 0,
    ">120 Days": 0,
    "projectTotal": 25700.50
  }
}
```

- **`buckets`** — Ordered list of column keys; use as table column headers.
- **`rows`** — One object per project. Each has `projectName`, `buckets` (dollar amount per bucket), and `projectTotal`. Rows are **sorted by `projectTotal` descending** (largest first).
- **`totals`** — One “TOTALS” row: sum per bucket and `projectTotal` (grand total).

### Errors

- **401** — Invalid or expired token; re-auth or redirect to login.
- **500** — Server/DB error; show a generic error message and optional retry.
- If Siteline isn’t configured, the backend may still return 200 with empty `rows` and zero `totals`; treat empty data as “no data” in the UI.

---

## TypeScript types – Main Aging Report

```ts
const AGING_BUCKETS = [
  'Current',
  '1-30 Days',
  '31-60 Days',
  '61-90 Days',
  '91-120 Days',
  '>120 Days',
] as const;

type AgingBucket = (typeof AGING_BUCKETS)[number];

interface AgingReportRow {
  projectName: string;
  /** Optional: primary PM name for this project (from contributing contracts). */
  leadPmName?: string | null;
  /** Optional: primary PM email for this project. */
  leadPmEmail?: string | null;
  /** Invoice/Pay App number (max/latest seen for this project), when available. */
  invoiceNumber?: number | null;
  buckets: Record<AgingBucket, number>;
  projectTotal: number;
}

interface AgingReportTotals extends Record<AgingBucket, number> {
  projectTotal: number;
}

interface AgingReportResponse {
  buckets: readonly string[];
  rows: AgingReportRow[];
  totals: AgingReportTotals;
}
```

---

## Building the main aging table

### Columns

1. **First column:** Project name (`rows[].projectName`). Last row can be **TOTALS** using `totals` (see below).
2. **Next 6 columns:** The six buckets, in order of `response.buckets` (Current, 1-30 Days, …, >120 Days). Cell value = `row.buckets[bucket]` for project rows.
3. **Last column (optional):** Project total (`row.projectTotal`). For the TOTALS row use `totals.projectTotal`.

### Rows

- **Data rows:** Map `response.rows` to one table row each; cells = `row.buckets[bucket]` and `row.projectTotal`.
- **Totals row:** Add one row at the bottom with label `"TOTALS"` and values from `response.totals`: `totals['Current']`, `totals['1-30 Days']`, …, `totals.projectTotal`.

### Formatting

- Format all dollar values as currency (e.g. `$15,000.50` or `$15,000.00`). Use `Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })` or similar.
- Show zeros as `$0.00` or `—` as per your design.
- No need to sort rows; backend already returns them sorted by `projectTotal` descending.

### Minimal structure (pseudo-markup)

```
| Project      | Current   | 1-30 Days | 31-60 Days | ... | Project Total |
|--------------|-----------|-----------|------------|-----|---------------|
| Project Alpha| $15,000.50| $0.00     | $2,200.00  | ... | $17,200.50    |
| Project Beta | $0.00     | $8,500.00 | $0.00      | ... | $8,500.00     |
| TOTALS       | $15,000.50| $8,500.00 | $2,200.00  | ... | $25,700.50    |
```

---

## Example: fetch and render (conceptual)

```ts
async function loadAgingReport(): Promise<AgingReportResponse | null> {
  const res = await fetch('/siteline/aging-report', {
    headers: {
      Authorization: `Bearer ${getAccessToken()}`,
    },
  });
  if (!res.ok) {
    if (res.status === 401) clearAuthAndRedirectToLogin();
    return null;
  }
  return res.json();
}

// In your component:
const data = await loadAgingReport();
if (!data) return <ErrorMessage />;
if (data.rows.length === 0) return <EmptyState message="No aging data yet. Data syncs every 10 minutes." />;

// Table: header = ['Project', ...data.buckets, 'Project Total']
// Body: data.rows then one row for totals from data.totals
// Format numbers: new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
```

---

## Data freshness

- The report is built from **synced** Siteline data (tables `Siteline_Contracts` and `Siteline_PayApps`).
- Sync runs **every 10 minutes** on the backend. The frontend always gets the latest snapshot at the time of the request; there is no “live” streaming.
- Optional: show a “Last synced” or “Data as of” note in the UI if the backend adds a timestamp in a future version.

---

## Related docs

- **Siteline API (overview):** [FRONTEND_SITELINE.md](./FRONTEND_SITELINE.md) — status, company, contracts, pay apps, and aging report summary.
- **Auth:** [FRONTEND_AUTH.md](./FRONTEND_AUTH.md) — login, token, 401 handling.

---

## Over 50 Days Tab (Aging Overdue)

This is a **second tab** next to the main aging report. It shows **individual pay apps** where:

- `daysPastDue > 50`, and
- `netDollars > 0`

and includes the **assigned project manager** for the contract.

Data comes from the **synced** Siteline tables (`Siteline_PayApps` and `Siteline_Contracts`) and cached PM info from Siteline (`leadPMs`). The backend calculates:

- `daysPastDue` from the pay app due date.
- `netDollars = (Billed − Retention) ÷ 100` (values stored in cents).

### Endpoint – Over 50 Days

```http
GET /siteline/aging-overdue
```

- **Base URL:** Same as the rest of the API.
- **Auth:** Requires JWT:
  ```http
  Authorization: Bearer <access_token>
  ```
- **Query params:** Optional (same filters as main report).
- **Method:** GET.

### Optional filters (query params)

Same as `GET /siteline/aging-report`:

- `search`
- `overdueOnly`
- `minDaysPastDue` / `maxDaysPastDue`
- `minNetDollars` / `maxNetDollars`
- `includeStatuses` / `excludeStatuses`

### Response shape – Over 50 Days

#### Success (200)

```json
{
  "items": [
    {
      "contractId": "5cacb676-19a5-4010-b748-167de62e0bea",
      "projectName": "31019 - OMVHS Duct Opening (Metro Mechanical PO 36392)",
      "projectNumber": "PO 36392",
      "internalProjectNumber": "31019",
      "companyId": null,
      "leadPmName": "Asha Goel",
      "leadPmEmail": "asha.goel@goelservices.com",
      "invoiceNumber": 7,
      "dueDate": "2025-01-15T00:00:00.000Z",
      "daysPastDue": 448,
      "netDollars": 53727,
      "status": "SIGNED"
    }
  ]
}
```

- **`contractId`**: Siteline contract id (string).
- **`projectName` / `projectNumber` / `internalProjectNumber`**: Project identity; display these in the UI.
- **`companyId`**: Currently `null` in this implementation; reserved for future company‑filter use.
- **`leadPmName` / `leadPmEmail`**: Project manager name and email, derived from Siteline `leadPMs`.
- **`dueDate`**: Pay app due date (ISO 8601 string).
- **`daysPastDue`**: Whole days between `dueDate` and “today” (UTC midnight).
- **`netDollars`**: (Billed − Retention) ÷ 100, already converted to dollars.
- **`status`**: Pay app status string. Records with `PAID` or `DRAFT` are **excluded**.

#### Errors

- **401** — Invalid or expired token; re‑auth or redirect to login.
- **500** — Server/DB error; show a generic error and optional retry.

### TypeScript types – Over 50 Days Tab

```ts
export interface AgingOverdueItem {
  contractId: string;
  projectName: string | null;
  projectNumber: string | null;
  internalProjectNumber: string | null;
  companyId: string | null;
  leadPmName: string | null;
  leadPmEmail: string | null;
  /** Invoice/Pay App number from Siteline (payAppNumber). */
  invoiceNumber: number | null;
  dueDate: string | null; // ISO string
  daysPastDue: number;
  netDollars: number;
  status: string | null;
}

export interface AgingOverdueResponse {
  items: AgingOverdueItem[];
}
```

### Building the Over 50 Days table

**Suggested columns:**

1. **Project** – `projectName` (optionally show `internalProjectNumber` in smaller text).
2. **GC / Project #** – e.g. `projectNumber`.
3. **PM** – `leadPmName` (make `leadPmEmail` a mailto link or tooltip).
4. **Due Date** – formatted from `dueDate`.
5. **Days Past Due** – `daysPastDue`.
6. **Invoice #** – `invoiceNumber`.
7. **Net Amount** – format `netDollars` as currency.
8. **Status** – `status`.

**Rows:**

- One row per `items[]` element.
- Sort descending by `daysPastDue` or `netDollars` in the UI.

### Example: fetch and render Over 50 Days tab

```ts
const API_BASE = 'http://localhost:3000'; // or your backend URL

async function loadAgingOverdue(): Promise<AgingOverdueResponse | null> {
  const token = localStorage.getItem('access_token');
  if (!token) return null;

  const res = await fetch(`${API_BASE}/siteline/aging-overdue`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    if (res.status === 401) {
      // clear auth + redirect to login
    }
    return null;
  }
  return res.json();
}

// In your component:
// - Use the existing aging report tab wired to /siteline/aging-report
// - Use loadAgingOverdue() to power the Over 50 Days tab.
```
