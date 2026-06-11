# Bidding — Frontend calculator handoff (backend changes)

**Audience:** NestJS / API team (`trucking` backend).  
**From:** Frontend (`trucking-frontend`).  
**Date:** March 2026.

---

## 1. Decision (read this first)

| Topic | Old assumption | New agreement |
|-------|----------------|---------------|
| **Source of truth for formulas** | Backend calc engine ports Excel | **`BiddingSheet.xlsx`** (repo root) |
| **Who runs Base Bid math** | `POST /bids/:id/calculate` on server | **Browser** (TypeScript engine mirroring Excel) |
| **Who owns displayed totals** | Server `computed` after calculate | **Client `computed` snapshot** saved with the bid |
| **Backend calc engine** | Required for MVP | **Optional** — persistence + lookups remain required |

The frontend will **not** depend on the server to re-derive PJ/MIKE, per-system breakdowns, or labor build-up for the Base Bid sheet. The backend should **store** what the client sends and **not overwrite** it with a second calculation unless we explicitly add a “recalculate server-side” mode later.

**Lookups stay on the backend** (teams, wage rates, payroll burden, states, project/building types, preferences, our-entities). Only the **Base Bid formula graph** moves client-side for the first release.

**Reference docs (frontend repo)**

| Doc | Purpose |
|-----|---------|
| `BiddingSheet.xlsx` | Formula spec |
| `BIDDING_BASEBID_FIELDS.md` | Cell ↔ field map, Excel audit |
| `BIDDING_FRONTEND_API.md` | Current API (will be updated on frontend side after you ship changes) |

---

## 2. What the backend should keep (unchanged)

- **Auth** — JWT on all `/bids` and `/lookups/bidding/*` routes.
- **CRUD** — `GET/POST/PATCH/DELETE /bids`, list filters (`status`, `entityId`, `search`).
- **Lookups** — all `GET /lookups/bidding/*` plus wage-rate / payroll-burden / team admin CRUD.
- **`GET /lookups/bidding/wage-rates/:id/burdened-rate`** — still useful for UI breakdown (client may also fold burden into its own engine later).
- **Input storage** — `baseBid` (JSON), `systems[]` (JSON), header fields (`estimateNumber`, `bidName`, `ourEntityId`, `bidDate`, `status`, etc.).
- **Conventions** — money as plain numbers; percents as decimals (`0.15` = 15%).

---

## 3. Required API changes

### 3.1 Accept client `computed` on `PATCH /bids/:id`

Today `PATCH` only documents `baseBid`, `systems`, and `status`. **Extend** the body:

```jsonc
{
  "status": "draft",
  "baseBid": { "marginPercent": 0.25, "projectState": "DC" },
  "systems": [ { "key": "duct1", "used": true, "materials": 3268.95, "laborHours": 228.52, "mikeTotalPrice": 19515.92, "quantity": 5455.98 } ],
  "computed": {
    "engineVersion": "1.0.0",
    "calculatedAt": "2026-06-03T12:00:00.000Z",
    "baseBid.mikeEstimate": 43837.68,
    "baseBid.pjEstimate": 47600,
    "baseBid.costPerHourMike": 89.91,
    "baseBid.costPerHourPj": 97.62,
    "labor.totalHours": 487.59,
    "insights.completionPercent": 70
  }
}
```

**Server behavior:**

1. **Merge** `baseBid` as today.
2. **Replace** `systems[]` as today.
3. If `computed` is present → **replace** the stored computed snapshot with the client payload (do **not** run server formulas and merge).
4. Persist `engineVersion` + `calculatedAt` if you add columns; otherwise keep inside the `computed` JSON blob.

**Validation (light touch):**

- Reject non-finite numbers (`NaN`, `Infinity`).
- Optional: max JSON size for `computed` (e.g. 256 KB).
- **Do not** require every legacy server key; client may send **more** keys than the old engine (per-system breakdown — see §4).

### 3.2 `GET /bids/:id` — return last saved snapshot

- Return `computed` exactly as stored (from last `PATCH` with `computed`, or `{}` on old rows).
- **Do not** trigger server recalculation on GET.

### 3.3 `POST /bids/:id/calculate` — deprecate for Base Bid MVP

Pick one approach and document it:

| Option | Behavior |
|--------|----------|
| **A (recommended)** | Keep endpoint for backward compatibility but **no-op**: return `{ computed: <stored>, version, errors: [], warnings: ["Server calculate deprecated; client is source of truth"] }` without overwriting stored snapshot unless body flag `forceServerCalc: true`. |
| **B** | Return **410 Gone** or **501** with message pointing to this doc. |
| **C** | Remove from OpenAPI; frontend stops calling it. |

Frontend will **stop calling** `/calculate` for normal save once backend accepts `computed` on `PATCH`.

### 3.4 `POST /bids` (create)

- Optional: allow initial `baseBid` / `systems` / `computed` on create.
- If omitted, return `computed: {}` until first client save.

### 3.5 List endpoint `GET /bids`

No change required. List items stay **without** MIKE/PJ totals (performance). Detail view loads full `computed`.

---

## 4. Suggested `computed` shape (flexible JSON)

The client engine will grow beyond the current flat map. Store **`computed` as JSON** (same column/table as today) without strict schema enforcement at first.

### 4.1 Minimum keys (parity with today’s UI)

These match the existing server engine output; frontend will continue to populate them:

| Key | Excel anchor (Base Bid) |
|-----|-------------------------|
| `baseBid.mikeEstimate` | H48 / J20 |
| `baseBid.pjEstimate` | H47 |
| `baseBid.costPerHourMike` | I48 |
| `baseBid.costPerHourPj` | I47 |
| `baseBid.marginPercent` | D4 (echo) |
| `baseBid.costPerHourBeforeMargin` | I45 |
| `baseBid.marginPerHour` | I46 |
| `labor.totalHours` | H37 / J19 |
| `labor.parkingPerHour` | D11 |
| `labor.liftsPerHour` | D12 |
| `labor.materialEscalationFactor` | H11 |
| `labor.salesTaxPercent` | H13 |
| `insights.completionPercent` | progress bar (client-defined rules OK) |

### 4.2 Extended keys (frontend will add — do not strip)

Optional nested structure for Excel row parity (names tentative — treat as opaque until frontend publishes `engineVersion` changelog):

```jsonc
{
  "engineVersion": "1.0.0",
  "laborBuildUp": {
    "compositePerHour": 51.7,
    "parkingPerHour": 3.125,
    "liftsPerHour": 0,
    "totalPerHourWithParkingAndLifts": 54.825
  },
  "systemsComputed": [
    {
      "key": "duct1",
      "laborHours": 228.52,
      "materials": 3268.95,
      "costPerHour": 69.99,
      "subtotal": 15993.7,
      "price": 21324.93
    }
  ],
  "errors": [],
  "warnings": []
}
```

**Backend:** persist as-is; no need to implement these formulas server-side for MVP.

### 4.3 Metadata

| Field | Type | Notes |
|-------|------|-------|
| `engineVersion` | string | Semver of frontend Excel port (e.g. `1.0.0`). Bump when formula logic changes. |
| `calculatedAt` | ISO datetime | When client ran the engine. |
| `errors` | `{ field, message }[]` | Client-side validation (optional). |
| `warnings` | `string[]` | Non-blocking (optional). |

---

## 5. What to remove or freeze on the backend

| Item | Action |
|------|--------|
| Server Base Bid formula port for **display** | Freeze or remove from hot path; keep code behind flag if needed for audit diff. |
| Auto-overwrite `computed` on every `PATCH` | **Stop** — only update when `computed` is in body or `/calculate` explicitly called (if kept). |
| Requirement that `laborRateCompositePerHour` be server-derived | Relax — client sends input + computed; server stores both. |
| Per-system `computed` in API response | Not required from server calc; client will send `systemsComputed` when ready. |

**Keep** payroll burden math for **`GET /lookups/bidding/wage-rates/:id/burdened-rate`** unless frontend inlines it later (notify us before removing).

---

## 6. Database / persistence

No new tables required for MVP if you already store:

- `base_bid` JSON (or normalized columns)
- `systems` JSON
- `computed` JSON (last snapshot)

**Recommended columns** (optional, for reporting):

| Column | Type | Notes |
|--------|------|-------|
| `computed_json` | `nvarchar(max)` / JSON | Full client snapshot |
| `calc_engine_version` | `varchar(20)` | Copy of `computed.engineVersion` for indexing |
| `calc_at` | `datetime2` | Copy of `computed.calculatedAt` |

**Submitted bids:** when `status` → `submitted`, store the **`computed` snapshot at submit time** immutably (either freeze row or append `bid_snapshots` — product call). Frontend will send final `computed` on the submit `PATCH`.

---

## 7. Validation & security

- **Inputs:** continue to validate enums (`systems[].key`), foreign keys (`ourEntityId`), string lengths, date formats.
- **Computed:** treat as **client-asserted numbers** for UI/reporting, not as server-verified financial truth, unless you add a later server reconciliation job.
- **Tampering:** same as any client-submitted total — if compliance requires server verification, add async `POST /bids/:id/verify` later that runs server engine and returns a diff; out of scope for this handoff.

---

## 8. Migration for existing bids

| Scenario | Behavior |
|----------|----------|
| Old bids with server-only `computed` | `GET` returns existing JSON; frontend may recalc on first edit and `PATCH` new snapshot. |
| Old bids with empty `computed` | Frontend runs engine locally after load; first save sends `computed`. |
| Mixed engine versions | Use `computed.engineVersion` in support tooling. |

No DB backfill required unless reporting needs `calc_engine_version` column populated from JSON.

---

## 9. Frontend rollout (your timeline)

| Phase | Frontend | Backend dependency |
|-------|----------|------------------|
| **1** | Implement TS engine (Base Bid + Labor Costs composite for `D10`) | **`PATCH` accepts `computed`** |
| **2** | Wire form: local calc on Save, stop calling `/calculate` | `/calculate` deprecated per §3.3 |
| **3** | Per-system tables in UI | Persist extended `systemsComputed` JSON |
| **4** | Optional: inline burdened rate | Burden endpoint optional |

We will update `BIDDING_FRONTEND_API.md` after your endpoints are live.

---

## 10. Open questions for backend (please confirm)

1. **`PATCH` without `computed`** — leave stored snapshot unchanged? (Frontend expects **yes**.)
2. **Max size** for `computed` JSON — any limit?
3. **Submitted immutability** — freeze `computed` on `status: submitted` or allow edits only in `draft`?
4. **`/calculate` deprecation** — Option A, B, or C from §3.3?
5. **New input fields** — will you add `backcheckHours`, `salesTaxApplicable`, `parkingPeoplePercent`, `startInMonths` to `baseBid` schema when frontend sends them? (Excel has these; API types may need extending.)

Reply in PR or Slack; frontend will align `PatchBidBody` types to your OpenAPI.

---

## 11. Summary checklist for backend

- [ ] `PATCH /bids/:id` accepts optional **`computed`** object; **replaces** stored snapshot; does not auto-run server formulas.
- [ ] `GET /bids/:id` returns stored **`computed`** without side-effect recalc.
- [ ] Deprecate or no-op **`POST /bids/:id/calculate`** for normal client flow.
- [ ] Keep all **lookup** and **CRUD** endpoints.
- [ ] Allow **extra keys** in `computed` JSON (forward-compatible).
- [ ] Document **`engineVersion`** convention.
- [ ] Confirm behavior for **submitted** bids and **PATCH without computed**.
- [ ] Extend **`baseBid`** schema for any new input fields the frontend adds (see `BIDDING_BASEBID_FIELDS.md` §1).

---

## 12. Contact / ownership

| Layer | Owner |
|-------|--------|
| Excel spec | Estimators + `BiddingSheet.xlsx` |
| Formula implementation | Frontend (`src/lib/bidding/engine/` — TBD) |
| Persistence & lookups | Backend |
| API contract updates | Both; this doc is the backend slice |
