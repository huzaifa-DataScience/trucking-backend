# Bidding module — structure for backend (API alignment)

**Audience:** NestJS backend team.  
**Goal:** Match how the **frontend is organized** and how **Siteline / Job Dashboard** APIs work today, so you can add `bidding` in the same style.

**Related docs**

| Doc | Purpose |
|-----|---------|
| [docs/BIDDING_DATABASE_DESIGN.md](./docs/BIDDING_DATABASE_DESIGN.md) | **DB reuse rules, ER, no duplicate tables** |
| [BIDDING_IMPLEMENTATION.md](./BIDDING_IMPLEMENTATION.md) | Full DB tables, calc engine, phases (if present) |
| [BIDDING_FRONTEND_DESIGN.md](./BIDDING_FRONTEND_DESIGN.md) | UI routes, insight strip, wizard |
| [BACKEND_IMPLEMENTATION.md](./BACKEND_IMPLEMENTATION.md) | Existing API patterns (JWT, pagination) |
| `BiddingSheet.xlsx` (repo root) | Excel source of truth |
| `trucking/BIDDING_SHEET.md` (backend repo, if present) | Workbook extraction + named ranges |

**Status:** Frontend is a **UI prototype** with **mock data**. API client file `src/lib/api/endpoints/bidding.ts` is **not wired yet** — backend can implement to this contract and frontend will connect.

---

## 1. Big picture

```text
Excel BiddingSheet.xlsx (13 tabs)
        │
        ▼
┌───────────────────────────────────────────────────────────────┐
│  NestJS `bidding` module (NEW)                                 │
│  • Lookups  → SQL master tables (VRF and Lists, teams, wages)  │
│  • Bids CRUD → transactional tables per estimate               │
│  • Calc engine → ports Excel formulas (server-side only)       │
└───────────────────────────────┬───────────────────────────────┘
                                │ REST + JWT (same as /job-dashboard, /siteline)
                                ▼
┌───────────────────────────────────────────────────────────────┐
│  trucking-frontend (Next.js)                                   │
│  Workspace: "Bidding sheet"  →  /bidding/*                       │
│  Pattern: src/lib/api/endpoints/bidding.ts (like siteline.ts)  │
└───────────────────────────────────────────────────────────────┘
```

**Rule:** All **math** runs on the backend (`POST /bids/:id/calculate`). The UI only sends **inputs** and displays **`computed`** read-only fields.

---

## 2. Excel tabs → backend / frontend mapping

| Excel sheet | Backend (tables + calc) | Frontend wizard step |
|-------------|------------------------|----------------------|
| **VRF and Lists** | Master lookups (`Bid_Teams`, `Bid_WageRates`, …) | Dropdowns on all steps |
| **Startup** | `Bid_Startup` | `/bidding/[id]/startup` |
| **Base Bid** | `Bid_BaseBidSettings` + `baseBid.ts` | `/bidding/[id]/base-bid` |
| **Labor Costs** + **Labor Costs Worksheet** | `Bid_LaborLines` + `laborWorksheet.ts` | `/bidding/[id]/labor` |
| **Quantites and Price from Mike** | `Bid_QuantityLines` | Phase 2 — `/quantities` (not built yet) |
| **Spec *** | `Bid_SpecSections` | Phase 2 |
| **Proposal Sheet** + **Exclusions** | `proposal.ts` + `Bid_Exclusions` | `/bidding/[id]/review` |
| **Followup** | `Bid_CrmCompanies` (optional CRM) | Autocomplete later |

**Calc order (must match Excel):**

```text
startup → baseBid → laborWorksheet ↔ laborCosts → quantities → proposal → budget
```

---

## 3. Frontend file structure (current prototype)

```text
src/
├── app/(dashboard)/bidding/
│   ├── page.tsx                 # List bids (cards + filters)
│   ├── new/page.tsx             # Create estimate → POST /bids (TODO)
│   └── [id]/
│       ├── layout.tsx           # Wizard shell + insight strip (loads bid)
│       ├── page.tsx             # redirect → /startup
│       ├── startup/page.tsx     # Startup form inputs
│       ├── base-bid/page.tsx    # Team, wage, margin, lifts + computed totals
│       ├── labor/page.tsx       # Labor lines table
│       └── review/page.tsx      # Proposal preview + checklist
│
├── components/bidding/
│   ├── BidWizardLayout.tsx      # Header + insight strip + step nav
│   ├── BidInsightStrip.tsx      # MIKE / PJ / delta / margin / progress
│   ├── BidWizardSteps.tsx       # startup | base-bid | labor | review
│   ├── BidFormField.tsx         # Editable inputs
│   ├── ComputedField.tsx        # Read-only from `computed.*`
│   ├── BidListCard.tsx          # List row card
│   └── BidStatusBadge.tsx
│
└── lib/bidding/
    ├── types.ts                 # TypeScript contracts (mirror API DTOs)
    └── mock-data.ts             # TEMP — delete when API wired

# TO ADD (same style as siteline / job-dashboard):
└── lib/api/endpoints/bidding.ts
```

**Sidebar:** Separate workspace **“Bidding sheet”** (not under Operations or Billing) — same pattern as Billing vs Operations switcher.

**Company:** `ourEntityId` on bid header = `Ref_OurEntities.EntityID` (1=GOEL, 2=GOEL DC, 3=DCB), same as Job Dashboard `entityId`.

---

## 4. NestJS module structure (recommended)

Mirror existing modules (`siteline`, `job-dashboard`, `admin`):

```text
src/bidding/
├── bidding.module.ts
├── bidding.controller.ts          # /bids/*
├── bidding-lookups.controller.ts  # /lookups/bidding/*
├── bidding.service.ts             # CRUD + orchestration
├── bidding-calc.service.ts        # POST calculate → CalcResult
├── bidding-calc/
│   ├── index.ts                   # runAll(ctx)
│   ├── types.ts                   # BidCalcContext, CalcResult
│   ├── startup.ts
│   ├── baseBid.ts
│   ├── laborCosts.ts
│   ├── laborWorksheet.ts          # largest port (~953 Excel formulas)
│   ├── quantities.ts
│   └── proposal.ts
├── entities/                      # TypeORM
│   ├── bid.entity.ts
│   ├── bid-startup.entity.ts
│   ├── bid-base-bid-settings.entity.ts
│   ├── bid-labor-line.entity.ts
│   └── bid-calc-snapshot.entity.ts
└── dto/
    ├── create-bid.dto.ts
    ├── patch-bid.dto.ts
    ├── bid-detail.response.ts
    └── calc-result.response.ts
```

**Auth:** `@UseGuards(JwtAuthGuard)` on all routes (same as Siteline). Estimators: own bids; admin: lookup CRUD.

---

## 5. API contract (frontend will call)

Base URL: same host as today (`NEXT_PUBLIC_API_BASE_URL`).  
Auth: `Authorization: Bearer <JWT>`.

### 5.1 Lookups (GET, cacheable)

| Method | Path | Query | Returns |
|--------|------|-------|---------|
| GET | `/lookups/bidding/teams` | — | `BidTeamDto[]` |
| GET | `/lookups/bidding/wage-rates` | `state?`, `yearLabel?` | `BidWageRateDto[]` |
| GET | `/lookups/bidding/project-types` | — | `{ id, name }[]` |
| GET | `/lookups/bidding/states` | — | `{ stateCode, name, salesTaxRate }[]` |
| GET | `/lookups/our-entities` | — | **Reuse existing** — `{ id, name }[]` (GOEL / GOEL DC / DCB). Do not add `Bid_BiddingCompanies`. |
| GET | `/lookups/bidding/contract-types` | — | `{ id, name }[]` |
| GET | `/lookups/bidding/quantity-codes` | `trade=HVAC\|PLUMB\|DUCT\|EQUIPMENT` | `BidQuantityCodeDto[]` |
| GET | `/lookups/bidding/payroll-rates` | — | FUTA, Medicare, SUTA, WC, … |

**Style:** Same as `GET /lookups/jobs`, `GET /lookups/our-entities` — flat JSON arrays, human-readable labels.

### 5.2 Bids (CRUD)

| Method | Path | Body / query | Returns |
|--------|------|--------------|---------|
| GET | `/bids` | `status?`, `entityId?`, `search?` | `BidSummaryDto[]` |
| POST | `/bids` | See §5.4 | `BidDetailDto` |
| GET | `/bids/:id` | — | `BidDetailDto` + nested sections + `computed` |
| PATCH | `/bids/:id` | Partial §5.4 | `BidDetailDto` |
| DELETE | `/bids/:id` | — | `{ ok: true }` or 204 |
| POST | `/bids/:id/calculate` | — | `CalcResultDto` |
| POST | `/bids/:id/duplicate` | — | `BidDetailDto` (new id) |

### 5.3 Export (phase 3)

| GET | `/bids/:id/export/xlsx` |
| GET | `/bids/:id/export/pdf` |

### 5.4 JSON shapes (align with frontend `types.ts`)

**`BidSummaryDto`** (list + insight strip header):

```json
{
  "id": "42",
  "estimateNumber": "IDC6098",
  "bidName": "SCU Replacement Basement…",
  "status": "draft",
  "companyName": "Goel Services, Inc.",
  "ourEntityId": 1,
  "bidDate": "2026-05-15",
  "mikeEstimate": 43837.68,
  "pjEstimate": 47600,
  "costPerHour": 89.91,
  "marginPercent": 0.25,
  "completionPercent": 72,
  "updatedAt": "2026-05-19T14:32:00Z"
}
```

**`POST /bids` body:**

```json
{
  "estimateNumber": "IDC6100",
  "bidName": "New job name",
  "ourEntityId": 2
}
```

**`PATCH /bids/:id` body** (send only changed sections):

```json
{
  "startup": {
    "jobName": "...",
    "jobNumber": "24037",
    "mechanicalContractor": "...",
    "contractType": "prime",
    "address1": "...",
    "clientContact": "...",
    "companyDomains": [
      { "companyKey": "Goel", "domain": "goelservices.com", "applicable": true }
    ]
  },
  "baseBid": {
    "teamCode": "Bil Shams",
    "projectState": "DC",
    "marginPercent": 0.25,
    "hoursPerDay": 8,
    "daysPerWeek": 5,
    "projectWageRateKey": "2026 - DC/Federal in DC/CITIZEN",
    "liftsNeeded": "yes",
    "liftPercentage": 0.15,
    "parking": 0
  },
  "laborLines": [
    { "sortOrder": 1, "category": "Foreman", "headcount": 1, "hours": 120, "baseRate": 42.5 }
  ]
}
```

**`CalcResultDto`** (`POST /bids/:id/calculate`):

```json
{
  "version": "1.0.0",
  "computed": {
    "baseBid.wageTotal": 37.29,
    "baseBid.wageDisplay": "NON-SCALE - W: ($30 + F: $7.29) = Total of $37.29",
    "baseBid.mikeEstimate": 43837.68,
    "baseBid.pjEstimate": 47600,
    "baseBid.costPerHourMike": 89.91,
    "baseBid.costPerHourPj": 97.62,
    "baseBid.liftTotal": 1815,
    "labor.totalHours": 800,
    "labor.loadedRate": 89.91,
    "insights.completionPercent": 72
  },
  "errors": [{ "field": "baseBid.projectWageRateKey", "message": "Wage rate not found" }],
  "warnings": []
}
```

**Frontend mapping:**

| UI | `computed` keys |
|----|-----------------|
| Insight strip — MIKE | `baseBid.mikeEstimate`, `baseBid.costPerHourMike` |
| Insight strip — PJ | `baseBid.pjEstimate`, `baseBid.costPerHourPj` |
| Insight strip — margin | `baseBid.marginPercent` or input mirror |
| Insight strip — progress | `insights.completionPercent` |
| `ComputedField` on Base bid | `baseBid.*` |
| Team roles (read-only) | from lookup after `teamCode` or `baseBid.captain`, etc. |

Use **dot notation** string keys so frontend does not need nested object merging.

---

## 6. Request flow (how frontend will use APIs)

Same pattern as Billings aging (debounced save + refresh):

```text
User opens /bidding/42/base-bid
    → GET /bids/42
    → render inputs from bid.baseBid + computed from bid.computed

User changes Team dropdown
    → PATCH /bids/42 { baseBid: { teamCode: "..." } }
    → POST /bids/42/calculate
    → merge response.computed into UI
    → BidInsightStrip + ComputedField update (brief highlight animation)

User completes wizard step
    → PATCH section only
    → POST /calculate
    → optional: completionPercent drives progress bar
```

**Planned client** (`src/lib/api/endpoints/bidding.ts`):

```typescript
import { get, post, patch } from "../client";

export async function getBids(params?: { status?: string; entityId?: number; search?: string }) {
  return get<BidSummaryDto[]>("/bids", params);
}
export async function getBid(id: string) {
  return get<BidDetailDto>(`/bids/${id}`);
}
export async function createBid(body: CreateBidDto) {
  return post<BidDetailDto>("/bids", body);
}
export async function patchBid(id: string, body: PatchBidDto) {
  return patch<BidDetailDto>(`/bids/${id}`, body);
}
export async function calculateBid(id: string) {
  return post<CalcResultDto>(`/bids/${id}/calculate`, {});
}
```

---

## 7. Database tables (summary)

**Canonical design (no duplication):** [docs/BIDDING_DATABASE_DESIGN.md](./docs/BIDDING_DATABASE_DESIGN.md).

| Type | Tables |
|------|--------|
| **Reuse (existing)** | `Ref_OurEntities` (`Bids.OurEntityId`), optional `Ref_Jobs` (`Bids.JobId`), `App_Users` (audit) |
| **Master (new, bidding-only)** | `Bid_Teams`, `Bid_WageRates`, `Bid_ProjectTypes`, `Bid_States`, `Bid_ContractTypes`, `Bid_LiftDefaults`, `Bid_PayrollRates`, `Bid_QuantityCodes`, … |
| **Per bid (new)** | `Bids`, `Bid_Startup`, `Bid_BaseBidSettings`, `Bid_LaborLines`, `Bid_QuantityLines`, `Bid_Exclusions` |
| **Audit** | `Bid_CalcSnapshots` (`payloadJson`, `calcVersion`, `inputsHash`) |

**Do not create:** `Bid_BiddingCompanies` (use `Ref_OurEntities`), duplicate hauler/Clearstory company tables, or stored `computed` columns on main bid tables.

**CRM (Followup):** phase 1 = text on `Bid_Startup`; phase 4 = shared `Ref_BidProspects` (one table), not a bidding-only company clone.

Seed `Bid_*` masters from **VRF and Lists** + Base Bid (`scripts/seed-bidding-from-xlsx` — planned).

---

## 8. Implementation phases (backend ↔ frontend)

| Phase | Backend delivers | Frontend wires |
|-------|------------------|----------------|
| **P0** | Migrations + seed lookups | — |
| **P1** | Lookup GETs + `POST/GET/PATCH /bids` (no calc) | List, new, startup/base forms save |
| **P2** | `baseBid.ts` + `laborWorksheet.ts` + `POST /calculate` | Insight strip + `ComputedField` live |
| **P3** | Quantities + proposal + export | `/quantities`, PDF/xlsx |
| **P4** | Followup CRM optional | Contractor autocomplete |

**Golden test:** One completed bid (**IDC6098**) — inputs JSON + expected `computed` within $0.01.

---

## 9. Consistency checklist (match existing APIs)

- [ ] `@UseGuards(JwtAuthGuard)` on all `/bids` and `/lookups/bidding/*`
- [ ] Errors: `{ "message": "...", "statusCode": 400 }` (Nest default)
- [ ] Dates: ISO `YYYY-MM-DD` for bid date; ISO datetime for `updatedAt`
- [ ] Money: numbers in JSON (dollars, not cents) unless you standardize cents elsewhere
- [ ] List endpoints return **arrays**, not `{ data: [] }`, unless you change global convention
- [ ] Register module in `app.module.ts` like `SitelineModule`
- [ ] CORS: allow frontend origin (port 3002)

---

## 10. What backend should implement first (MVP)

1. `GET /lookups/bidding/teams` + `wage-rates` + `states` + `contract-types`
2. `POST /bids`, `GET /bids`, `GET /bids/:id`, `PATCH /bids/:id`
3. `POST /bids/:id/calculate` with at least:
   - `baseBid.wageTotal` (N+O)
   - `baseBid.mikeEstimate`, `baseBid.pjEstimate`
   - `baseBid.costPerHourMike`, `baseBid.costPerHourPj`
   - team role fields from `TeamCode` lookup
4. Golden test IDC6098

Frontend will remove `mock-data.ts` and connect `bidding.ts` once P1/P2 exist.

---

*Generated for backend handoff — aligns with frontend prototype in `src/app/(dashboard)/bidding` and [BIDDING_IMPLEMENTATION.md](./BIDDING_IMPLEMENTATION.md).*
