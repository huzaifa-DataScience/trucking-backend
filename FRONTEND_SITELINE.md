# Siteline Billing API (Frontend)

Siteline is our construction billing provider. The **backend** talks to Siteline’s GraphQL API; the **frontend** only calls our REST endpoints below. All responses are JSON.

**Base URL:** Same as the rest of the API (e.g. `http://localhost:3000` in development).

**Authentication:** When auth is enabled, send the JWT for all Siteline endpoints except status:

```
Authorization: Bearer <access_token>
```

`GET /siteline/status` is public (no token).

---

## Endpoints

### 1. Check if Siteline is configured

Use this to show/hide billing UI or show a “Siteline not configured” message.

```
GET /siteline/status
```

**Auth:** None (public).

**Response (configured):**
```json
{
  "configured": true,
  "message": "Siteline module ready"
}
```

**Response (not configured):**
```json
{
  "configured": false,
  "message": "Set SITELINE_API_URL and SITELINE_API_TOKEN in .env"
}
```

---

### 2. Current company

Company associated with the Siteline API token (name, locations, etc.).

```
GET /siteline/company
```

**Response (success):** Siteline company object, e.g.:

```json
{
  "id": "...",
  "name": "Acme Construction",
  "phoneNumber": "...",
  "locations": [
    {
      "id": "...",
      "nickname": "HQ",
      "street1": "...",
      "city": "...",
      "state": "...",
      "country": "...",
      "postalCode": "...",
      "timeZone": "..."
    }
  ]
}
```

**Response (error):** `{ "error": "Siteline GraphQL errors: ..." }` or `{ "configured": false, "message": "..." }`.

---

### 3. List contracts

Siteline’s API does **not** expose a “list all contracts” query (their `Company` type has `contacts`, not `contracts`). This endpoint returns an empty list and a message.

```
GET /siteline/contracts
```

**Response (success):**

```json
{
  "contracts": [],
  "message": "Siteline's API does not provide a list of contracts. Use GET /siteline/contracts/:id with a contract id, or check Siteline docs for another way to list contracts."
}
```

To show contract data you need contract ids from somewhere else (e.g. Siteline web app, another integration, or your own DB). Then use **GET /siteline/contracts/:id** for each contract.

---

### 4. Single contract

One contract by id, with full SOV line items and pay apps.

```
GET /siteline/contracts/:id
```

**Example:** `GET /siteline/contracts/abc123`

**Response (success):** Same contract shape as in the list, with richer `sov.lineItems`:

```json
{
  "id": "...",
  "project": { ... },
  "sov": {
    "lineItems": [
      {
        "id": "...",
        "sortOrder": 1,
        "code": "01",
        "name": "General conditions",
        "originalTotalValue": 50000,
        "latestTotalValue": 52000,
        "totalBilled": 13000,
        "progressComplete": 0.25
      }
    ],
    ...
  },
  "payApps": [ ... ]
}
```

**Response (not found / error):** `null` or `{ "error": "..." }`.

---

### 5. Single pay app

One pay app by id, with G702 summary values and detailed progress.

```
GET /siteline/pay-apps/:id
```

**Example:** `GET /siteline/pay-apps/xyz789`

**Response (success):**

```json
{
  "id": "...",
  "payAppNumber": 2,
  "billingType": "LUMP_SUM",
  "billingStart": "2025-02-01",
  "billingEnd": "2025-02-28",
  "payAppDueDate": "2025-03-15",
  "status": "SIGNED",
  "updatedAt": "...",
  "currentBilled": 30000,
  "currentRetention": 3000,
  "totalRetention": 5500,
  "totalValue": 100000,
  "balanceToFinish": 70000,
  "previousRetentionBilled": 2500,
  "retentionOnly": false,
  "timeZone": "America/New_York",
  "progress": [
    {
      "id": "...",
      "progressBilled": 10000,
      "storedMaterialBilled": 5000,
      "totalValue": 20000,
      "sovLineItem": {
        "id": "...",
        "code": "01",
        "name": "General conditions"
      }
    }
  ],
  "contract": {
    "id": "...",
    "project": {
      "id": "...",
      "name": "Project Alpha",
      "projectNumber": "..."
    }
  },
  "g702Values": {
    "originalContractSum": 100000,
    "netChangeByChangeOrders": 0,
    "contractSumToDate": 100000,
    "totalCompletedToDate": 55000,
    "totalRetention": 5500,
    "previousPayments": 25000,
    "currentPaymentDue": 30000,
    "balanceToFinish": 70000,
    "balanceToFinishWithRetention": "..."
  }
}
```

**Response (not found / error):** `null` or `{ "error": "..." }`.

---

### 6. Paginated contracts (billing grid)

Wraps Siteline `paginatedContracts(input: GetPaginatedContractsInput!)`. Use this for the **main contracts table** in the billing view.

```
GET /siteline/contracts/paginated?month=&payAppStatus=&contractStatus=&limit=&cursor=
```

- **month**: billing month like `2024-09` (used for the nested `payApps(months:[...])`).
- **payAppStatus**: combined status filter (e.g. `SUBMITTED_SYNCED_PAID` as in the Postman collection).
- **contractStatus**: e.g. `ACTIVE`.
- **limit**: page size (default defined by backend / Siteline).
- **cursor**: pagination cursor from the previous page.

**Shape (success):**

```json
{
  "cursor": "opaque-cursor",
  "hasNext": true,
  "contracts": [
    {
      "id": "...",
      "internalProjectNumber": "INTERNAL-001",
      "billingType": "LUMP_SUM",
      "percentComplete": 0.45,
      "project": {
        "projectNumber": "PRJ-001"
      },
      "payApps": [
        {
          "id": "...",
          "status": "SIGNED",
          "billingStart": "2024-09-01",
          "billingEnd": "2024-09-30",
          "timeZone": "America/New_York",
          "updatedAt": "2024-10-05T12:00:00Z"
        }
      ]
    }
  ]
}
```

Use this to build a **contracts table** with filters for month, contract status, and pay app status.

---

### 7. Paginated pay apps (billing grid)

Wraps Siteline `paginatedPayApps(input: GetPaginatedPayAppsInput!)`. Use this for a **pay apps table** (e.g. “All pay apps submitted in a month”).

```
GET /siteline/pay-apps/paginated?submittedInMonth=&limit=&cursor=
```

- **submittedInMonth**: e.g. `2024-09`.
- **limit**: page size.
- **cursor**: pagination cursor from previous page.

**Shape (success):**

```json
{
  "totalCount": 120,
  "cursor": "opaque-cursor",
  "hasNext": true,
  "payApps": [
    {
      "id": "...",
      "payAppNumber": 2,
      "billingType": "LUMP_SUM",
      "contract": {
        "id": "...",
        "internalProjectNumber": "INTERNAL-001",
        "project": {
          "projectNumber": "PRJ-001"
        }
      }
    }
  ]
}
```

---

### 8. Aging report (from synced DB)

Net dollars by project and days-past-due bucket. Uses data synced from Siteline into `Siteline_Contracts` and `Siteline_PayApps` (cron runs every 10 minutes). Excludes pay apps with status `PAID` or `DRAFT`. **Net Dollars = (Billed − Retention) / 100.**

```
GET /siteline/aging-report
```

**Auth:** Same as other Siteline endpoints (JWT when auth is enabled).

**Response (success):**

```json
{
  "buckets": ["Current", "1-30 Days", "31-60 Days", "61-90 Days", "91-120 Days", ">120 Days"],
  "rows": [
    {
      "projectName": "Project Alpha",
      "buckets": {
        "Current": 15000.50,
        "1-30 Days": 0,
        "31-60 Days": 2200.00,
        "61-90 Days": 0,
        "91-120 Days": 0,
        ">120 Days": 0
      },
      "projectTotal": 17200.50
    }
  ],
  "totals": {
    "Current": 45000.00,
    "1-30 Days": 12000.00,
    "31-60 Days": 2200.00,
    "61-90 Days": 0,
    "91-120 Days": 0,
    ">120 Days": 0,
    "projectTotal": 59200.00
  }
}
```

**Frontend usage:** See **[FRONTEND_AGING_REPORT.md](./FRONTEND_AGING_REPORT.md)** for full docs: response shape, TypeScript types, and how to build the pivot table (columns, totals row, formatting).

---

## TypeScript types (optional)

You can define types for your UI; backend returns plain JSON from Siteline.

```typescript
// Status check
interface SitelineStatus {
  configured: boolean;
  message: string;
}

// Error / not configured
interface SitelineError {
  error?: string;
  configured?: false;
  message?: string;
}

// Use when you need strong typing; fields may vary with Siteline schema
interface SitelineCompany {
  id: string;
  name: string;
  phoneNumber?: string;
  locations?: Array<{
    id: string;
    nickname?: string;
    street1?: string;
    city?: string;
    state?: string;
    country?: string;
    postalCode?: string;
    timeZone?: string;
  }>;
}

interface SitelineContract {
  id: string;
  billingType: string;
  status: string;
  project?: { id: string; name: string; projectNumber?: string; location?: unknown };
  sov?: {
    totalValue?: number;
    totalBilled?: number;
    totalRetention?: number;
    progressComplete?: number;
    lineItems?: Array<{
      id: string;
      code?: string;
      name?: string;
      originalTotalValue?: number;
      totalBilled?: number;
      progressComplete?: number;
    }>;
  };
  payApps?: SitelinePayApp[];
}

interface SitelinePayApp {
  id: string;
  payAppNumber?: number;
  billingStart?: string;
  billingEnd?: string;
  payAppDueDate?: string;
  status?: string;
  currentBilled?: number;
  totalValue?: number;
  balanceToFinish?: number;
  g702Values?: Record<string, unknown>;
}
```

---

## Quick checklist for frontend

1. Call `GET /siteline/status` on load (or when entering billing view); if `configured === false`, hide billing features or show “Siteline not set up”.
2. Use `GET /siteline/company` for company name/locations if needed (e.g. header or settings).
3. Use `GET /siteline/contracts/paginated` for the main **contracts table** (filters: month, payAppStatus, contractStatus).
4. Use `GET /siteline/pay-apps/paginated` for an **all pay apps table** by submitted month.
5. Use `GET /siteline/contracts/:id` when the user opens a contract (e.g. SOV line items, full pay app list, change order requests).
6. Use `GET /siteline/pay-apps/:id` for pay app detail (G702 values, SOV progress rows).
7. Use `GET /siteline/aging-report` for the aging report (net dollars by project × days-past-due bucket); data comes from synced DB.
8. Always handle `error` and `configured: false` in responses; show a clear message and optional retry.

---

## Recommended UI / tables

Based on typical construction billing / pay app UIs (G702/G703 style dashboards), here is a suggested structure.

### 1. Contracts table (top-level billing view)

- **Data source:** `GET /siteline/contracts/paginated`.
- **Filters:** month, contractStatus, payAppStatus.
- **Suggested columns:**
  - Contract / internal project number (`internalProjectNumber`).
  - Project number (`project.projectNumber`).
  - Billing type (`billingType`).
  - Percent complete (`percentComplete`, formatted as `%`).
  - Latest pay app status for the selected month (from `payApps[0].status`, with billingStart/billingEnd).
  - Actions: “View contract” (opens contract detail), “View pay apps”.

You can treat this as the **main table** for Siteline data in your app.

### 2. Pay apps table (per month)

- **Data source:** `GET /siteline/pay-apps/paginated`.
- **Filters:** `submittedInMonth`, optional search by project/contract.
- **Suggested columns:**
  - Pay app number (`payAppNumber`).
  - Project / contract (`contract.project.projectNumber`, `contract.internalProjectNumber`).
  - Billing type (`billingType`).
  - Status (`status`).
  - Last updated date (`updatedAt`).
  - Action: “Open pay app” → navigates to detail view (uses `/siteline/pay-apps/:id`).

This table is good for a **“Pay apps by month”** screen.

### 3. Contract detail view

- **Data source:** `GET /siteline/contracts/:id`.
- **Sections:**
  - **Header:** project name, project number, internal project number, billing type, overall percent complete.
  - **SOV table** (like G703 continuation sheet):
    - One row per `sov.lineItems` with columns: `code`, `name`, `originalTotalValue` / `latestTotalValue`, `totalBilled`, `progressComplete`.
  - **Pay apps list:** small table of `payApps` for this contract (number, period, status, submittedAt) with links to open each pay app.
  - **Change orders:** optional table from `changeOrderRequests` (id, name, internalNumber, amount).

This view is for drilling into a single contract from the contracts table.

### 4. Pay app detail view

- **Data source:** `GET /siteline/pay-apps/:id`.
- **Suggested layout:**
  - **Summary cards** (top row) using `g702Values`:
    - Original contract sum, total completed to date, total retention, previous payments, current payment due, balance to finish.
  - **Meta info:** pay app number, billing period, status, submitted date, contract + project references.
  - **Progress table** (bottom):
    - One row per `progress` item with: SOV code/name (`progress.sovLineItem.code/name`), `progressBilled`, `storedMaterialBilled`, `totalValue`.

This gives a G702/G703-style view: high-level billing summary + line-by-line breakdown.

### 5. Aging report table

- **Data source:** `GET /siteline/aging-report`.
- **Logic (matches Python):** Net dollars = (Billed − Retention) / 100; exclude status PAID/DRAFT; bucket by days past due (Current, 1–30, 31–60, 61–90, 91–120, >120).
- **Suggested layout:** Pivot table — rows = project name (plus a TOTALS row from `totals`), columns = the six buckets + Project total; cells = dollar amounts formatted as currency (e.g. `$15,000.50`). Sort by project total descending (backend returns rows pre-sorted).
