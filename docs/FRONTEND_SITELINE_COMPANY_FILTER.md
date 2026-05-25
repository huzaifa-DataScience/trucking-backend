# Siteline billing — company filter (frontend)

**Problem today:** The app has a global “Our company” dropdown (GOEL / GOEL DC / DCB), but **Siteline screens do not pass that selection to the API**. The backend stores **separate** Siteline data per company and only returns the correct slice when you send **`entityId`**.

**Rule:** Use the **same `entityId`** as Job / Material / Hauler dashboards (`GET /lookups/our-entities`). Do **not** send `companyId` — it is **ignored** on Siteline routes.

---

## 1. Company IDs (must match everywhere)

| entityId | Name (dropdown label) | Siteline legal name (from API) |
|----------|------------------------|--------------------------------|
| **1** | GOEL | Goel Services, Inc |
| **2** | GOEL DC | Goel DC, LLC |
| **3** | DCB | Delaware Cornerstone Builders, Inc. (DCB) |
| 4 | TBD / Unassigned | *(no Siteline token — hide on billing screens)* |

**Default when user picks “All companies” on other dashboards:** Siteline billing should **not** use “all” — either require a company or default to **`entityId=2` (GOEL DC)** to match backend config (`SITELINE_AGING_PRIMARY_ENTITY_ID`).

---

## 2. Load the dropdown (same as other dashboards)

**Preferred** — already used on Job Dashboard:

```http
GET /lookups/our-entities
Authorization: Bearer <token>
```

```json
[
  { "id": 1, "name": "GOEL" },
  { "id": 2, "name": "GOEL DC" },
  { "id": 3, "name": "DCB" },
  { "id": 4, "name": "TBD" }
]
```

**Optional** — Siteline-specific metadata (Siteline UUID, last sync time):

```http
GET /siteline/entity-config
Authorization: Bearer <token>
```

```json
[
  {
    "entityId": 1,
    "entityName": "GOEL",
    "sitelineCompanyId": "c85ffa3f-9161-4564-af4e-c4f428c46478",
    "sitelineCompanyName": "Goel Services, Inc",
    "lastResolvedAt": "2026-05-20T17:02:26.458Z"
  },
  ...
]
```

Use **`entityId`** + **`entityName`** for labels. `sitelineCompanyId` is for debugging only — do not send it as a query param.

**UI:** On Siteline / Billing pages, filter dropdown to **ids 1, 2, 3 only** (exclude 4).

---

## 3. Global state — wire the existing company picker

You likely already have something like:

```typescript
selectedEntityId: number | null;  // from /lookups/our-entities
```

### Required behavior on Siteline routes

1. **Read** `selectedEntityId` from the same global store / context / URL as Job Dashboard.
2. **When the user changes company** in the header dropdown → **refetch every Siteline API** on the current page (do not keep showing the previous company’s data).
3. **If `selectedEntityId` is `null` or “All”** → for Siteline only, use **`2`** (GOEL DC) or disable the billing view with a message: *“Select a company to view Siteline billing.”*

### Do not do this

```http
GET /siteline/aging-report
GET /siteline/aging-report?companyId=2
```

### Do this

```http
GET /siteline/aging-report?entityId=2
GET /siteline/aging-overdue?entityId=2
```

---

## 4. Endpoints that MUST include `entityId`

Whenever `selectedEntityId` is set (or defaulted to `2`), append **`entityId`** to these calls:

| Screen / feature | Method | Endpoint | Required query |
|------------------|--------|----------|----------------|
| Aging pivot table | GET | `/siteline/aging-report` | `entityId`, optional `startDate`, `endDate`, `search`, `overdueOnly`, … |
| Overdue AR list | GET | `/siteline/aging-overdue` | `entityId`, optional filters |
| Live Siteline company (optional) | GET | `/siteline/company` | `entityId` — uses that company’s API token |
| Entity lookup (optional) | GET | `/siteline/entity-config` | none |

**Not filtered by `entityId` today (live Siteline / global):**

- `GET /siteline/status` — no filter
- `GET /siteline/contracts/:id` — single contract by UUID (no entity param yet)
- `GET /siteline/pay-apps/paginated` — uses default token only

If you add a **contracts list** or **pay apps grid** per company later, backend will need `entityId` on those too — plan for it now in the shared fetch helper.

---

## 5. Example: shared fetch helper

```typescript
const SITELINE_ENTITY_IDS = [1, 2, 3] as const;
const DEFAULT_SITELINE_ENTITY_ID = 2;

function sitelineEntityId(selected: number | null | undefined): number {
  if (selected != null && SITELINE_ENTITY_IDS.includes(selected as 1 | 2 | 3)) {
    return selected;
  }
  return DEFAULT_SITELINE_ENTITY_ID;
}

async function fetchAgingReport(
  token: string,
  selectedEntityId: number | null,
  filters: { startDate?: string; endDate?: string; search?: string },
) {
  const entityId = sitelineEntityId(selectedEntityId);
  const params = new URLSearchParams({
    entityId: String(entityId),
    ...(filters.startDate && { startDate: filters.startDate }),
    ...(filters.endDate && { endDate: filters.endDate }),
    ...(filters.search && { search: filters.search }),
  });
  const res = await fetch(`${API_BASE}/siteline/aging-report?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
```

Call **`fetchAgingReport`** from:

- Initial page load
- `useEffect` when `selectedEntityId` changes
- When date range / search filters change (keep passing the same `entityId`)

---

## 6. Example URLs (copy-paste for QA)

Replace `localhost:3005` with your API host.

```http
# GOEL
GET /siteline/aging-report?entityId=1

# GOEL DC (default backend behavior if param omitted)
GET /siteline/aging-report?entityId=2

# DCB
GET /siteline/aging-report?entityId=3

# Overdue view
GET /siteline/aging-overdue?entityId=2&minDaysPastDue=51
```

**Sanity check:** Row counts and dollar totals should **change** when switching `entityId` (after backend sync has finished for all three companies).

---

## 7. UI checklist (implementation tickets)

### A. Global wiring

- [ ] Siteline / Billing layout subscribes to **the same** company context as Job Dashboard.
- [ ] Changing dropdown triggers **refetch** (loading state + clear old rows while loading).

### B. Aging report page

- [ ] `GET /siteline/aging-report?entityId={selected}` on load and on company change.
- [ ] Show selected company name in page title or subtitle (e.g. “Aging — GOEL DC”).
- [ ] Empty state if `rows.length === 0`: “No aging data for {company} yet; sync runs every 10 minutes.”

### C. Overdue / AR page (if separate)

- [ ] `GET /siteline/aging-overdue?entityId={selected}` — same pattern.

### D. Do not break Job/Material/Hauler

- [ ] Keep sending **`entityId`** (not `companyId`) on those dashboards — see [FRONTEND_COMPANY_FILTER.md](./FRONTEND_COMPANY_FILTER.md).

### E. Network tab verification (per screen)

1. Open DevTools → Network.
2. Change company from GOEL → GOEL DC → DCB.
3. Confirm **new** requests with `entityId=1`, then `2`, then `3`.
4. Confirm response `rows` / `totals` differ between companies.

---

## 8. Response shape (unchanged)

`entityId` only affects **which snapshot** is read; JSON shape is the same — see [FRONTEND_AGING_REPORT.md](./FRONTEND_AGING_REPORT.md) and [FRONTEND_SITELINE.md](./FRONTEND_SITELINE.md).

Optional fields on aging response:

- `entityId` — company used for the query (echoes your `?entityId=`)
- `snapshotReady` — `false` if no per-company snapshot exists yet (do not treat as “zero AR”)
- `message` — human-readable reason when empty (show in UI banner)
- `sitelineDashboardRange` — cached date range from sync (`YYYY-MM-DD`, not ISO midnight UTC)
- `lastAgingBreakdownSync` — when snapshot was written
- `source` — `"siteline"` vs `"local_pay_apps"`

**Empty rows with old `lastAgingBreakdownSync`:** Previously the API could fall back to a legacy merged snapshot (no DCB rows) while `entityId=3` was set — fixed. If `snapshotReady: false`, show `message` and wait for sync; do not show misleading dates from another company.

---

## 9. Sync / empty data (not a frontend bug)

Data is filled by backend cron (~every 10 minutes per company). If one company returns empty:

- Backend may still be syncing (hundreds of contracts per entity).
- User can wait or ask ops to confirm `GET /siteline/entity-config` has `sitelineCompanyId` set for that row.

Frontend should show a clear message, not a broken table.

---

## 10. One-page summary for the frontend team

1. **Reuse** the existing Our Company dropdown (`/lookups/our-entities`, ids **1 / 2 / 3**).
2. On **every Siteline billing API call**, add query param **`entityId={selected}`** (default **2** if needed).
3. **Never** use `companyId` on Siteline routes.
4. **Refetch** all Siteline data when the user changes company.
5. Verify in Network tab that URLs change with `entityId` and that data changes between GOEL, GOEL DC, and DCB.

---

## Related docs

- [FRONTEND_COMPANY_FILTER.md](./FRONTEND_COMPANY_FILTER.md) — Job / Material / Hauler `entityId`
- [FRONTEND_SITELINE.md](./FRONTEND_SITELINE.md) — Siteline endpoints and response shapes
- [FRONTEND_AGING_REPORT.md](./FRONTEND_AGING_REPORT.md) — Aging table columns and formatting
