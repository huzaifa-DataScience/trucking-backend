# Bidding module — database design (no duplication)

**Principle:** Reuse existing `Ref_*` and `App_*` tables wherever the business concept already exists. Add **only** tables that hold bidding-specific masters or per-estimate data that cannot live elsewhere without losing meaning.

**Related:** [BIDDING_BACKEND_STRUCTURE.md](../BIDDING_BACKEND_STRUCTURE.md), `BiddingSheet.xlsx`.

---

## 1. Reuse map (do not duplicate)

| Concept | Use existing table | FK on bids | Notes |
|--------|-------------------|------------|--------|
| **Our company (GOEL / GOEL DC / DCB)** | `dbo.Ref_OurEntities` | `Bids.OurEntityId` → `EntityID` | Same as `Ref_Jobs.EntityID`, Siteline `entityId`. **No `Bid_BiddingCompanies`.** |
| **Our company dropdown API** | — | — | Reuse `GET /lookups/our-entities`. Optional alias: `GET /lookups/bidding/our-entities` → same handler. |
| **Awarded / known job** | `dbo.Ref_Jobs` | `Bids.JobId` → `JobID` (nullable) | When set, display name/number from job; avoid maintaining two sources of truth. |
| **Haulers / trucking vendors** | `dbo.Ref_ExternalCompanies` | — | **Not used** for bidding (wrong domain). |
| **Clearstory org / customers** | `Clearstory_*` | — | Integration mirror only; **not** estimator CRM. |
| **Siteline company** | `Siteline_EntityConfig` | — | Billing sync only. |
| **Users (creator, estimator)** | `dbo.App_Users` | `Bids.CreatedByUserId`, `Bids.UpdatedByUserId` | Optional `AssignedToUserId`. |

---

## 2. What must be new (bidding-only)

These do **not** exist in the DB today and are seeded from **VRF and Lists**, **Base Bid**, or Excel specs — not copies of `Ref_OurEntities`.

| Table | Purpose | Why new |
|-------|---------|--------|
| `Bids` | Estimate header | Transaction root |
| `Bid_Startup` | 1:1 Startup tab inputs | Per estimate |
| `Bid_BaseBidSettings` | 1:1 Base Bid inputs | Per estimate |
| `Bid_LaborLines` | Labor Costs rows | Per estimate, 1:N |
| `Bid_QuantityLines` | Quantities sheet rows | Phase 2 |
| `Bid_Exclusions` | Exclusions matrix | Phase 2 |
| `Bid_SpecLines` | Spec HVAC/Plumb/Duct selections | Phase 2 (or JSON column on bid if row count stays small) |
| `Bid_CalcSnapshots` | Audit of `POST /calculate` | Not user input |
| `Bid_Teams` | Captain, clerk, duct roles lookup | Excel team list; not in `Ref_*` |
| `Bid_WageRates` | Prevailing / scale wage rows | Excel wage table |
| `Bid_ProjectTypes` | Project type dropdown | Excel VRF list |
| `Bid_States` | State + sales tax % | Excel; US-wide reference for **bidding math only** |
| `Bid_ContractTypes` | Prime / sub / PO / verbal | Startup checkboxes |
| `Bid_PayrollRates` | FUTA, SUTA, WC, Medicare… | VRF percentages |
| `Bid_QuantityCodes` | HVAC / plumb / duct / equip codes | Quantities sheet |
| `Bid_LiftDefaults` | Default lift % / rental | Base bid defaults |

**Naming:** `Bid_*` prefix = bidding domain. `Ref_*` = shared across app (existing convention).

---

## 3. CRM / Followup (mechanical contractors) — separate, not “company table”

Excel **Followup** tab (~250 mechanical contractors) is **not** the same as `Ref_OurEntities` or `Ref_ExternalCompanies`.

| Option | When |
|--------|------|
| **Phase 1** | Free-text on `Bid_Startup` (`mechanicalContractor`, `clientContact`, …) — no CRM table |
| **Phase 4** | Single shared `Ref_BidProspects` (or `Ref_Contractors`) seeded from Followup — **one** CRM table for whole app, not per-module duplicate |

**Do not** store Followup rows in `Bid_BiddingCompanies` or duplicate `Ref_OurEntities`.

Optional link later: `Bid_Startup.BidProspectId` → `Ref_BidProspects` when CRM exists.

---

## 4. Entity relationship (core)

```text
Ref_OurEntities (1) ──────< Bids >────── (0..1) Ref_Jobs
                              │
                              ├── 1:1 Bid_Startup
                              ├── 1:1 Bid_BaseBidSettings
                              ├── 1:N Bid_LaborLines
                              ├── 1:N Bid_QuantityLines   (phase 2)
                              └── 1:N Bid_CalcSnapshots

Bid_Teams, Bid_WageRates, Bid_ProjectTypes, …  (lookups, no FK from Ref_*)
Bid_BaseBidSettings.TeamId ──> Bid_Teams (optional)
Bid_BaseBidSettings.WageRateId ──> Bid_WageRates (optional)
```

---

## 5. Column rules (avoid redundant copies)

| Rule | Example |
|------|---------|
| **FK over repeat** | `Bids.OurEntityId` + join for name; do not store `companyName` on `Bids` except denormalized cache updated on save (optional, for list performance only). |
| **Job link** | If `Bids.JobId` is set, prefer `Ref_Jobs.JobNumber` / `JobName` for display; `Bid_Startup.jobNumber` only when pre-award or override. |
| **No formula columns** | Do not persist Excel `computed` in main tables; only in `Bid_CalcSnapshots.payloadJson` or API response. |
| **No second wage table** | Wage **definitions** in `Bid_WageRates`; selected key on `Bid_BaseBidSettings` only. |
| **Soft delete** | `Bids.IsDeleted` + `DeletedAt` rather than copying rows for “duplicate bid”. |

---

## 6. Removed from earlier drafts

| Removed | Replaced by |
|---------|-------------|
| `Bid_BiddingCompanies` | `Ref_OurEntities` + `Bids.OurEntityId` |
| `GET /lookups/bidding/bidding-companies` | `GET /lookups/our-entities` |
| `Bid_CrmCompanies` (duplicate CRM) | `Ref_BidProspects` (phase 4) or text fields (phase 1) |

---

## 7. `Bids` header (minimal)

| Column | Type | Notes |
|--------|------|--------|
| `BidId` | `bigint` PK | |
| `OurEntityId` | `int` FK → `Ref_OurEntities` | Required |
| `JobId` | `int` FK → `Ref_Jobs` NULL | Optional link to ops job |
| `EstimateNumber` | `nvarchar(32)` UNIQUE | e.g. IDC6098 |
| `BidName` | `nvarchar(500)` | |
| `Status` | `nvarchar(20)` | draft / submitted / archived |
| `BidDate` | `date` | |
| `CreatedByUserId` | `int` FK → `App_Users` NULL | |
| `CreatedAt`, `UpdatedAt` | `datetime2` | |
| `IsDeleted` | `bit` | |

List API can `JOIN Ref_OurEntities` for `companyName` in DTO — not a stored duplicate column unless you add a maintained cache column later for performance.

---

## 8. Checklist before adding any table

- [ ] Does `Ref_OurEntities`, `Ref_Jobs`, or `App_Users` already model this?
- [ ] Is this integration data (`Clearstory_*`, `Siteline_*`, `Trimble_*`)? → do not mix into bids.
- [ ] Is this only used inside bidding Excel? → `Bid_*` master is OK.
- [ ] Will another module need the same CRM list? → `Ref_*` shared table, not `Bid_*`.

---

*This document is the source of truth for bidding schema decisions. Update [BIDDING_BACKEND_STRUCTURE.md](../BIDDING_BACKEND_STRUCTURE.md) if API paths change.*
