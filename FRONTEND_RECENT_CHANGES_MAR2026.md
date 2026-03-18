# Frontend Integration – Recent Backend Changes (Auth + Aging Report + Over‑50 Tab)

This document summarizes the backend changes you need to know about so you can update the frontend safely. It does **not** replace the detailed docs (`FRONTEND_AUTH.md`, `FRONTEND_AGING_REPORT.md`), but highlights what actually changed and what you should do.

---

## 1. Auth & RBAC (Backend Re‑enabled)

### 1.1 Endpoints

- `POST /auth/login`
- `POST /auth/register`
- `GET /auth/profile`
- Most application routes (dashboards, Siteline, admin, etc.) now require a **JWT**.

### 1.2 Frontend responsibilities

- After successful login / register:
  - Store `access_token`.
  - Store `user` (at minimum: `id`, `email`, `role`, `status`, `permissions`).
- On every non‑public API request:
  - Send `Authorization: Bearer <access_token>`.
- On `401`:
  - Clear auth state and redirect to login.
- Admin UI:
  - Gate on `user.role === 'admin'`.

See `FRONTEND_AUTH.md` for exact request/response shapes and TypeScript interfaces.

---

## 2. Aging Report – Main Tab (`/siteline/aging-report`)

Nothing in the **URL** changed, but the **row shape** now includes optional PM info.

### 2.1 Endpoint

```http
GET /siteline/aging-report
Authorization: Bearer <access_token>
```

### 2.2 Response (unchanged fields + NEW PM fields)

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

export interface AgingReportRow {
  projectName: string;
  // NEW: primary PM for this project, when available
  leadPmName?: string | null;
  leadPmEmail?: string | null;
  buckets: Record<AgingBucket, number>;
  projectTotal: number;
}

export interface AgingReportTotals extends Record<AgingBucket, number> {
  projectTotal: number;
}

export interface AgingReportResponse {
  buckets: readonly string[];
  rows: AgingReportRow[];
  totals: AgingReportTotals;
}
```

### 2.3 What to change in the UI

- Existing rendering logic (pivot table by `buckets`) can remain exactly the same.
- **Optional enhancement**: add a **“PM” column** that shows `row.leadPmName` if present, maybe with `row.leadPmEmail` as a mailto link or tooltip.

If `leadPmName` / `leadPmEmail` are `null`, that means Siteline has no `leadPMs` for any contracts under that project yet.

---

## 3. New Over‑50 Days Tab (`/siteline/aging-overdue`)

A new backend endpoint supports a **second tab** next to the main aging report. This tab lists **individual pay apps** where the aging rules match:

- `daysPastDue > 50`, and
- `netDollars > 0`, and
- status is **not** `PAID` or `DRAFT`.

### 3.1 Endpoint

```http
GET /siteline/aging-overdue
Authorization: Bearer <access_token>
```

No query params at this time.

### 3.2 Response shape

```ts
export interface AgingOverdueItem {
  contractId: string;
  projectName: string | null;
  projectNumber: string | null;
  internalProjectNumber: string | null;
  companyId: string | null;
  leadPmName: string | null;   // PM name, when available
  leadPmEmail: string | null;  // PM email, when available
  dueDate: string | null;      // ISO date string
  daysPastDue: number;         // strictly > 50
  netDollars: number;          // strictly > 0
  status: string | null;       // excludes PAID / DRAFT
}

export interface AgingOverdueResponse {
  items: AgingOverdueItem[];
}
```

**Important notes:**

- `dueDate`, `status`, `billed`, `retention` all originate from Siteline pay apps.
- Backend derives:
  - `daysPastDue` from `dueDate` vs “today”.
  - `netDollars = (billed − retention) / 100`.
- `leadPmName` / `leadPmEmail` are filled either from cached contract data or, if missing, by live‑calling Siteline for that contract’s `leadPMs`.

### 3.3 How to render the Over‑50 tab

- Add a second tab (e.g. “> 50 Days”) next to the main aging report.
- When that tab is active:

```ts
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
      // clear auth + redirect
    }
    return null;
  }

  return res.json();
}
```

- Suggested columns:
  - Project (`projectName` / `internalProjectNumber`)
  - GC / Project # (`projectNumber`)
  - PM (`leadPmName`, with `leadPmEmail` as a link/tooltip)
  - Due Date (`dueDate`)
  - Days Past Due (`daysPastDue`)
  - Net Amount (`netDollars` formatted as currency)
  - Status (`status`)

Rows are already filtered to >50 days & >0 amount; you can sort on `daysPastDue` or `netDollars` client‑side.

---

## 4. Where to Look for Full Details

- **Auth flows and types**: `FRONTEND_AUTH.md`
- **Full aging report + Over‑50 tab spec**: `FRONTEND_AGING_REPORT.md`
- **Siteline integration overview**: `FRONTEND_SITELINE.md`

This doc is just the **high‑level “what changed and what to do”**; use the detailed docs above as the source of truth when implementing. 
