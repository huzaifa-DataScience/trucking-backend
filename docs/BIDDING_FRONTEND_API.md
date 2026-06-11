# Bidding API — Frontend Handoff

Backend for the **Base Bid** estimator. Everything below is live in the backend and DB-migrated.
Use this to wire up the bidding form, dropdowns, the wage/burden admin screens, and the live calculator.

- **Base URL:** same API host as the rest of the dashboard.
- **Auth:** every endpoint requires the standard JWT (`Authorization: Bearer <token>`), same as other modules.
- **Content type:** `application/json`.
- **Money/percent convention:** rates are decimals (e.g. `0.06` = 6%, `0.009` = 0.9%). Dollar amounts are plain numbers.

---

## 1. What's new in this release

| Area | Change |
|------|--------|
| **Client-calc model** | The **browser Excel engine is the source of truth** for Base Bid math. The backend stores the client's `computed` snapshot and never recalculates over it. |
| **`PATCH /bids/:id` accepts `computed`** | Send your engine output; it is stored verbatim and returned by `GET`. Extra keys are **not stripped**. |
| **`baseBid` is passthrough** | Any input field you send is stored as-is — no need to wait on a backend deploy to add new Excel fields. |
| **`/calculate` deprecated** | No-op for normal save (echoes the stored snapshot). Server engine retained only as an opt-in verify pass (`forceServerCalc: true`). |
| **Bigger payloads** | JSON body limit raised to 1 MB; `computed` is soft-capped at 256 KB. |
| **Wage rates** | Fully CRUD-able (add / edit / soft-delete). Seeded with the Excel wage table. |
| **Payroll burden** | Config table `Bid_PayrollBurden` (Medicare, SS, SUTA, FUTA, WC, PFL, IRA, PPO, fringe, benefits) — fully CRUD-able. |
| **Auto-derived labor rate** | Endpoint converts a wage into a **burdened labor rate** (e.g. `$30` → `47.69`). |

### MVP confirmations (client engine `engineVersion` 1.2.0+)

| Topic | Backend behavior |
|-------|------------------|
| **Save** | `PATCH /bids/:id` with `baseBid`, `systems`, `computed` — stored **verbatim**; **no** server recalc on PATCH. |
| **Load** | `GET /bids/:id` returns stored `baseBid`, `systems`, `computed` unchanged (latest `source: client` snapshot). |
| **PATCH response** | Same shape as GET — includes stored `computed` after save. |
| **PATCH without `computed`** | Previous `computed` snapshot **unchanged**. |
| **Submitted lock** | `baseBid` / `systems` / `computed` on a non-`draft` bid → **409 Conflict** (`reopen to draft` message). Status-only PATCH (`{ "status": "draft" }`) still allowed. |
| **`/calculate`** | Deprecated no-op unless `{ "forceServerCalc": true }` (verify only). |

### D10 crew composite vs burdened wage (important)

These are **different numbers** in Excel:

| Concept | Excel | Example | Backend today |
|---------|-------|---------|---------------|
| **Single-tier burdened wage** | Payroll burden on selected CBA wage | **$47.69** | `GET /lookups/bidding/wage-rates/:id/burdened-rate` |
| **D10 crew composite** | Named range `labor_rate` → Labor Costs `F$25` (foreman + workers + apprentices blend) | **$51.70** | **Not auto-derived server-side for MVP** |

**MVP (official):** Your client engine computes D10 (`laborRateCompositePerHour`) from the Labor Costs worksheet logic and sends it in `baseBid` (and/or echoes in `computed`). The burdened-rate endpoint is for **breakdown UI** on wage pick — **do not** substitute `burdenedRate` for D10.

**Post-MVP:** we may add `GET /lookups/bidding/labor-composite` once crew counts + tier mix inputs are agreed.

---

## 2. Dropdown / lookup endpoints

All under `GET /lookups/bidding/*`. Use these to populate selects on the form.

| Method | Path | Returns |
|--------|------|---------|
| GET | `/lookups/our-entities` | **Reuse existing** — company list `{ id, name }[]` (GOEL / GOEL DC / DCB). Do **not** build a new one. |
| GET | `/lookups/bidding/teams` | Teams with crew roles |
| GET | `/lookups/bidding/wage-rates` | Wage/fringe options |
| GET | `/lookups/bidding/payroll-burden` | Burden constants |
| GET | `/lookups/bidding/states` | `{ stateCode, salesTaxRate }[]` |
| GET | `/lookups/bidding/project-types` | `{ id, name }[]` |
| GET | `/lookups/bidding/building-types` | `{ id, name }[]` |
| GET | `/lookups/bidding/preferences` | `{ id, name }[]` |

### Teams
```jsonc
// GET /lookups/bidding/teams
[
  {
    "id": 1, "teamName": "Wilder Rodriguez",
    "captain": "Wilder Rodriguez", "bidClerk": "Hassan Riaz",
    "duct1": "John Carlo Orpilla", "duct2": null,
    "hydronic1": "Jonathan Bruce", "hydronic2": "Brian Angelo Limon",
    "plumbing1": "Hennan Berberio", "plumbing2": "Mark Chua"
  }
]
```
Team admin:
- `POST /lookups/bidding/teams` body `{ "teamName": "New Team" }`
- `DELETE /lookups/bidding/teams/:id` (soft remove)

### Wage rates (CRUD)
```jsonc
// GET /lookups/bidding/wage-rates
[
  {
    "id": 1, "rateLabel": "NON-SCALE",
    "wage": 30, "fringe": 7.29, "total": 37.29,
    "displayLabel": "NON-SCALE - W: ($30 + F: $7.29) = Total of $37.29",
    "wageAsOf": "2026-03-03"
  }
]
```
| Method | Path | Body |
|--------|------|------|
| POST | `/lookups/bidding/wage-rates` | `{ rateLabel, wage, fringe, displayLabel?, wageAsOf? }` |
| PATCH | `/lookups/bidding/wage-rates/:id` | any subset of the above |
| DELETE | `/lookups/bidding/wage-rates/:id` | — (soft delete) |

- `total` and a default `displayLabel` are computed by the backend from `wage + fringe`; you don't need to send them.
- `wageAsOf` is ISO date `YYYY-MM-DD`.

### Payroll burden (CRUD)
```jsonc
// GET /lookups/bidding/payroll-burden
[
  { "id": 1, "code": "medicare", "label": "Medicare", "rateType": "pct_wage",
    "rate": 0.009, "annualCap": null, "hoursBasis": null, "includeInBaseRate": true },
  { "id": 3, "code": "suta", "label": "SUTA", "rateType": "capped_annual",
    "rate": 0.033, "annualCap": 9000, "hoursBasis": 1500, "includeInBaseRate": true },
  { "id": 8, "code": "ppo_health", "label": "PPO Health", "rateType": "per_hour",
    "rate": 2.4, "annualCap": null, "hoursBasis": null, "includeInBaseRate": true }
]
```
`rateType` is one of:
| rateType | Meaning | Per-hour amount |
|----------|---------|-----------------|
| `pct_wage` | percent of wage | `rate × wage` |
| `capped_annual` | capped annual tax | `(annualCap × rate) / hoursBasis` |
| `per_hour` | flat per-hour cost | `rate` |

| Method | Path | Body |
|--------|------|------|
| POST | `/lookups/bidding/payroll-burden` | `{ code, label, rateType, rate, annualCap?, hoursBasis?, includeInBaseRate? }` |
| PATCH | `/lookups/bidding/payroll-burden/:id` | any subset |
| DELETE | `/lookups/bidding/payroll-burden/:id` | — (soft delete) |

### Auto-derived burdened rate
```jsonc
// GET /lookups/bidding/wage-rates/:id/burdened-rate
{
  "wageRateId": 1, "rateLabel": "NON-SCALE",
  "wage": 30, "burdenedRate": 47.69, "totalBurden": 17.69,
  "lines": [
    { "code": "medicare", "label": "Medicare", "amountPerHour": 0.27 },
    { "code": "social_security", "label": "Social Security", "amountPerHour": 2.03 }
    // ... one line per active burden item
  ]
}
```
Use when the user picks a wage rate to show **single-tier** burden + breakdown (`lines` presentation-rounded; `burdenedRate` authoritative for that tier). **Not** Excel D10 — see §1.

---

## 3. Bids (CRUD) — under `/bids`

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/bids?status=&entityId=&search=` | List (all filters optional) |
| POST | `/bids` | Create a draft |
| GET | `/bids/:id` | Full detail (inputs + last stored `computed`) |
| PATCH | `/bids/:id` | Update header + Base Bid inputs + systems + **client `computed`** |
| DELETE | `/bids/:id` | Soft delete |
| POST | `/bids/:id/calculate` | **Deprecated** — no-op echo of stored snapshot (see §5) |

### List item
```jsonc
// GET /bids
[
  {
    "id": "12", "estimateNumber": "IDC6098", "bidName": "Some Project",
    "status": "draft", "ourEntityId": 1, "companyName": "GOEL",
    "bidDate": "2026-03-01", "updatedAt": "2026-05-29T10:00:00.000Z"
  }
]
```
`status` is `draft | submitted | archived`. `id` is returned as a **string**.

### Create
```jsonc
// POST /bids
{ "ourEntityId": 1, "jobId": null, "estimateNumber": "IDC6098", "bidName": "Optional", "bidDate": "2026-03-01",
  // all optional — seed the draft with initial inputs/computed if you have them:
  "baseBid": { "marginPercent": 0.15 }, "systems": [], "computed": {} }
```
Returns the full detail object (same shape as `GET /bids/:id`).

### Detail
```jsonc
// GET /bids/:id
{
  "id": "12", "estimateNumber": "IDC6098", "bidName": "...", "status": "draft",
  "ourEntityId": 1, "companyName": "GOEL", "jobId": null,
  "bidDate": "2026-03-01", "updatedAt": "...",
  "baseBid": { /* the saved Base Bid inputs (see §4) */ },
  "systems": [ /* the saved system rows (see §4) */ ],
  "computed": { /* last calculate() result, or {} if never run */ }
}
```

### Update (header + inputs + computed)
`PATCH /bids/:id` accepts any subset.
- `baseBid` is **merged** into existing inputs (passthrough — any key is stored).
- `systems` **replaces** the array (`key` is still validated against the enum).
- `computed` **replaces** the stored snapshot verbatim — the server never runs its own formulas over it. Extra keys (`systemsComputed`, `laborBuildUp`, `engineVersion`, …) are kept.
- A PATCH **without** `computed` leaves the previous snapshot unchanged.

```jsonc
{
  "status": "draft",
  "baseBid": { "marginPercent": 0.15, "projectState": "MD", "wageRateLabel": "NON-SCALE", "backcheckHours": 12 },
  "systems": [ { "key": "duct1", "used": true, "materials": 10000, "laborHours": 200, "mikeTotalPrice": 50000, "quantity": 1500 } ],
  "computed": {
    "engineVersion": "1.0.0",
    "calculatedAt": "2026-06-04T12:00:00.000Z",
    "baseBid.mikeEstimate": 43837.68,
    "baseBid.pjEstimate": 47600,
    "labor.totalHours": 487.59,
    "insights.completionPercent": 70
  }
}
```

**Rules / limits**
- **Draft-lock:** content (`baseBid` / `systems` / `computed`) can only be changed while `status: "draft"`. On a `submitted`/`archived` bid these return **409 Conflict** — first reopen with a status-only PATCH `{ "status": "draft" }`, then edit. The snapshot at submit time stays preserved in history.
- **Size:** `computed` is capped at **256 KB** (→ `413`); whole request body limit is 1 MB.
- **Validation:** non-finite numbers (`NaN`/`Infinity`) are rejected (`400`). `engineVersion` (≤20 chars) is stored as the snapshot's version tag; it defaults to the server version if omitted.

---

## 4. Base Bid input shape (`baseBid`)

All fields optional; send what the form has. **`baseBid` is passthrough** — any key you send is stored as-is and returned on `GET` / PATCH response. No backend deploy needed to add Excel fields.

**Percent convention:** decimals (`0.15` = 15%). **`parkingPeoplePercent`:** decimal where **`1` = 100%** (not `100`).

| Field | Type | Notes |
|-------|------|-------|
| `marginPercent` | number | e.g. `0.15` |
| `projectState` | string | state code |
| `salesTaxApplicable` | boolean | |
| `stateSalesTaxRate` | number | optional override |
| `hoursPerDay` / `daysPerWeek` | number | schedule |
| `durationMonths` / `startInMonths` | number | schedule (`startInMonths` = Excel B13) |
| `bidDate` | string | `YYYY-MM-DD` |
| `gsfOfBuilding` | number | |
| `parking` | boolean | + `parkingCostPerDay`, `parkingPeoplePercent` (`1` = 100%) |
| `liftsNeeded` | boolean | + `liftPercentage`, `liftCostPer4Weeks` |
| `averageNoPeople` | number | Excel H7 / G7 crew size |
| `backcheckHours` | number | Excel backcheck input |
| `wage` | number | optional echo of selected scale wage (passthrough) |
| `fringe` | number | optional echo of selected fringe (passthrough) |
| `wageRateLabel` | string | selected wage rate label (lookup) |
| `materialEscalationPerYear` | number | e.g. `0.04` |
| `laborRateCompositePerHour` | number | **D10** — client engine or manual; not `burdened-rate` |
| `teamName` / `assistantEstimator` | string | |
| `projectType` / `buildingType` / `preference` | string | from lookups |
| `ccipCoversWc` / `citizenProject` / `apprenticeable` / `pla` | boolean | flags |

### System row (`systems[]`)
| Field | Type | Notes |
|-------|------|-------|
| `key` | enum | one of `duct1, duct2, hydronic1, hydronic2, plumbing1, plumbing2, vrf, equipment` |
| `used` | boolean | include in totals |
| `mikeEstimateNumber` | number | reference |
| `materials` | number | materials before escalation |
| `laborHours` | number | |
| `mikeTotalPrice` | number | total price per MIKE |
| `quantity` | number | LF/SF |

---

## 5. Calculate — `POST /bids/:id/calculate` (deprecated)

The client Excel engine is the source of truth, so you **do not need to call this** in the normal save flow. It is kept only for backward compatibility and an optional server-side verify pass.

**Default (no body, or `{ "forceServerCalc": false }`)** — no-op echo of the stored snapshot; **does not** overwrite anything:
```jsonc
{
  "version": "1.0.0",
  "computed": { /* the last stored client snapshot, or {} */ },
  "errors": [],
  "warnings": [ "Server calculate is deprecated; the client Excel engine is the source of truth. Pass forceServerCalc:true to run a server verification pass." ]
}
```

**Verify pass (`{ "forceServerCalc": true }`)** — runs the legacy server engine against saved inputs and stores a separate `source: "server"` snapshot for audit/diff. This **does not** affect what `GET /bids/:id` returns (that always prefers the latest client snapshot). Use only for reconciliation.

> Normal wiring: stop calling `/calculate` on save. Persist your snapshot via `PATCH … { computed }` and re-read `GET /bids/:id`.

---

## 6. Suggested UI wiring

1. **On bid open:** `GET /bids/:id` → hydrate form from `baseBid` + `systems`, show last `computed`.
2. **On dropdown focus:** load `/lookups/bidding/*` once and cache.
3. **On wage-rate select:** `GET /lookups/bidding/wage-rates/:id/burdened-rate` → show burdened rate + breakdown.
4. **On input change:** run the **client Excel engine** to update the computed panel live (no network). On save (debounced), `PATCH /bids/:id` with `{ baseBid, systems, computed }`. **Do not** call `/calculate`.
5. **On submit:** `PATCH /bids/:id` with final `{ computed, status: "submitted" }`. The bid then locks (edits require reopening to `draft`).
6. **Admin screens:** wage-rate and payroll-burden CRUD tables using the POST/PATCH/DELETE routes in §2.

---

## 7. DB migration (for the backend/devops, not frontend)

One file: `scripts/sql/add-bidding-tables.sql` (idempotent). Run via `npm run bidding-migrate`.

> **Re-run required** for the client-calc release: it adds a `Source` column to `Bid_CalcSnapshots` (`'client'` vs `'server'` verify) via an idempotent `ALTER`. Existing snapshot rows are backfilled to `'client'`.
