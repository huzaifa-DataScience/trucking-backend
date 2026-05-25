# Siteline — company filter (`entityId`) — backend

**Repo:** `trucking` (NestJS API).

**Frontend contract:** `trucking-frontend/FRONTEND_SITELINE_COMPANY_FILTER.md` (how the header dropdown must call these routes).

---

## Summary

Siteline aging data is stored **per company** (`Ref_OurEntities.EntityID`). Clients must pass query param **`entityId`** (`1`, `2`, or `3`) on aging/read routes. The param **`companyId` is not used** on Siteline routes.

If `entityId` is omitted, the API defaults to **`SITELINE_AGING_PRIMARY_ENTITY_ID`** (default **2** = GOEL DC).

**Status:** Implemented in this repo (controller + report service + per-entity sync). Frontend Billings must pass `entityId` (see frontend doc).

---

## Company IDs

| entityId | Name | Siteline token env |
|----------|------|-------------------|
| **1** | GOEL | `SITELINE_API_TOKEN_ENTITY_1` |
| **2** | GOEL DC | `SITELINE_API_TOKEN_ENTITY_2` or legacy `SITELINE_API_TOKEN` |
| **3** | DCB | `SITELINE_API_TOKEN_ENTITY_3` |
| 4 | TBD / Unassigned | No Siteline token — not used for aging |

Same ids as `GET /lookups/our-entities`.

---

## REST endpoints (require `entityId` for correct company)

| Method | Path | Query |
|--------|------|--------|
| GET | `/siteline/aging-report` | **`entityId`** + optional filters (`startDate`, `endDate`, `search`, …) |
| GET | `/siteline/aging-overdue` | **`entityId`** + optional filters |
| GET | `/siteline/company` | optional **`entityId`** (uses that entity’s token) |
| GET | `/siteline/reconciliation/gaps` | optional **`entityId`** |
| GET | `/siteline/entity-config` | none (lists all configured entities) |

**Examples:**

```http
GET /siteline/aging-report?entityId=1
GET /siteline/aging-overdue?entityId=2&minDaysPastDue=51
GET /siteline/reconciliation/gaps?entityId=3
```

**Do not** rely on `?companyId=2` — it is ignored.

---

## Default when `entityId` is missing

`SitelineReportService.resolveReportEntityId()`:

1. If `entityId` is `1`, `2`, or `3` → use it.
2. Else → `SitelineEntityConfigService.primaryEntityIdForMergedAging()` (env `SITELINE_AGING_PRIMARY_ENTITY_ID`, default **2**).

**Files:**

- `src/siteline/siteline.controller.ts` — parses `entityId` query string
- `src/siteline/siteline-report.service.ts` — loads latest `Siteline_AgingSummary` for that `entityId`
- `src/siteline/siteline-entity-config.service.ts` — tokens, `SITELINE_ENTITY_IDS`, primary entity

---

## Data model & sync

Cron sync writes **separate** aging snapshots per entity:

- `Siteline_AgingSummary.entityId`
- `Siteline_AgingContracts.entityId`

Sync loops `SITELINE_ENTITY_IDS` (`[1, 2, 3]`) in `src/siteline/siteline-sync.service.ts` when `SITELINE_AGING_COMPANY_ID_MODE=per_entity` (recommended).

Empty response for a valid `entityId` usually means sync has not finished for that company yet (~10 min cadence), not a missing API param.

---

## Environment

From `.env.example`:

```env
SITELINE_API_TOKEN_ENTITY_1=...
SITELINE_API_TOKEN_ENTITY_2=...
SITELINE_API_TOKEN_ENTITY_3=...
# Or legacy default for entity 2:
SITELINE_API_TOKEN=...

SITELINE_AGING_COMPANY_ID_MODE=per_entity
SITELINE_AGING_PRIMARY_ENTITY_ID=2
SITELINE_AGING_SNAPSHOT_ENABLED=true
```

Ops: confirm `GET /siteline/entity-config` shows `sitelineCompanyId` per row after tokens are set.

---

## Email jobs & multi-company

- **Lead PM overdue** (`siteline-overdue-email.service.ts`) — uses aging DB; confirm it filters by entity if you need per-company email batches.
- **Clearstory gap alert** — runs for each id in `SITELINE_ENTITY_IDS` (see `SITELINE_PM_EMAILS.md`).

---

## QA checklist (backend)

1. `GET /siteline/aging-report?entityId=1` vs `2` vs `3` → different row counts/totals (after sync).
2. Omitting `entityId` → same data as `entityId=2` (default).
3. `GET /siteline/entity-config` → three rows with tokens configured.
4. Invalid `entityId` (e.g. `99`) → falls back to primary entity `2`.

---

## Related docs

| Doc | Repo | Audience |
|-----|------|----------|
| `FRONTEND_SITELINE_COMPANY_FILTER.md` | trucking-frontend | Frontend — wire header → `entityId` |
| `SITELINE_PM_EMAILS.md` | trucking | PM overdue + Clearstory gap emails |
| `BACKEND_SITELINE_PM_EMAILS.md` | trucking-frontend | Long-form gap/email spec (copy to backend if desired) |
