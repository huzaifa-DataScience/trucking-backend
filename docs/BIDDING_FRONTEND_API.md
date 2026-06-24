# Bidding API — Frontend Handoff (single doc)

**Give frontend this file only.** We append new bidding features here as they ship.

- **Last updated:** 2026-06-15
- **Base URL:** same API host as the rest of the dashboard (e.g. `https://<api-host>/bids`, `/lookups/bidding/...`).
- **Auth:** every endpoint requires JWT (`Authorization: Bearer <token>`).
- **JSON requests:** `Content-Type: application/json` (except attachment upload — `multipart/form-data`).
- **Money/percent convention:** rates are decimals (`0.06` = 6%, `0.15` = 15%). Dollar amounts are plain numbers.

**Also useful:** [BIDDING_BASEBID_FIELDS.md](./BIDDING_BASEBID_FIELDS.md) (Excel cell map).

---

## Changelog (newest first)

| Date | Feature | Status |
|------|---------|--------|
| 2026-06-15 | **Activity log** — who changed what, when (`GET /bids/:id/activity`) | **Live** — §3.6 |
| 2026-06-04 | **Company info** — client/GC section (`companyInfo`, prefill from job) | **Live** — §3.5 |
| 2026-06-04 | **Cover sheet** — `timeEstimate`, `submitDate` on bid header | **Live** — §3.4 |
| 2026-06-04 | **Attachments** — images/PDFs on bid | **Live** — §3.3 |
| 2026-03+ | Client-calc model, lookups CRUD, `baseBid` passthrough | **Live** — §1–§2, §4 |

---

## 1. What's in production

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
| **Attachments** | Upload/view/delete images and PDFs on a bid (`POST/GET/DELETE` under `/bids/:id/attachments`). Metadata in SQL; files on disk. |
| **Cover sheet fields** | `timeEstimate` (hours) and `submitDate` on bid header — list, detail, create, PATCH. See §3.4. |
| **Company info** | Client/GC the bid is for — `companyInfo` object + job prefill. See §3.5. |
| **Activity log** | Audit trail — who edited what and when. See §3.6. |

### MVP confirmations (client engine `engineVersion` 1.2.0+)

| Topic | Backend behavior |
|-------|------------------|
| **Save** | `PATCH /bids/:id` with `baseBid`, `systems`, `companyInfo`, `computed` — stored **verbatim**; **no** server recalc on PATCH. |
| **Load** | `GET /bids/:id` returns stored `baseBid`, `systems`, `companyInfo`, `computed` unchanged (latest `source: client` snapshot). |
| **PATCH response** | Same shape as GET — includes stored `computed` after save. |
| **PATCH without `computed`** | Previous `computed` snapshot **unchanged**. |
| **Submitted lock** | `baseBid` / `systems` / `companyInfo` / `computed` on a non-`draft` bid → **409 Conflict** (`reopen to draft` message). Status-only PATCH (`{ "status": "draft" }`) still allowed. |
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
| GET | `/bids/prefill/company-from-job/:jobId` | Suggested `companyInfo` from `Ref_Jobs` |
| GET | `/bids/:id/activity` | Full change history + summary stats |
| GET | `/bids?status=&entityId=&search=` | List (`search` matches estimate, bid name, **client company name**) |
| POST | `/bids` | Create a draft |
| GET | `/bids/:id` | Full detail (inputs + last stored `computed`) |
| PATCH | `/bids/:id` | Update header + Base Bid inputs + systems + **client `computed`** |
| DELETE | `/bids/:id` | Soft delete |
| POST | `/bids/:id/calculate` | **Deprecated** — no-op echo of stored snapshot (see §5) |
| POST | `/bids/:id/attachments` | Upload image/PDF (`multipart`, field `file`) |
| GET | `/bids/:id/attachments/:attachmentId/download` | Download / inline view |
| DELETE | `/bids/:id/attachments/:attachmentId` | Remove attachment (**draft** only) |

---

### 3.3 Attachments (images / PDFs) — **live**

Site photos, screenshots, PDFs. Metadata in SQL; files on disk. `GET /bids/:id` includes `attachments[]` (not on list).

| Rule | Value |
|------|--------|
| Types | JPEG, PNG, WebP, PDF |
| Max size | 10 MB per file |
| Max count | 20 per bid |
| Upload / delete | `status === "draft"` only |
| View / download | Any status |

**Upload** — `POST /bids/:id/attachments`, `multipart/form-data`, field name **`file`**; optional `label`.

```typescript
interface BidAttachment {
  id: number;
  fileId: number;
  fileName: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf';
  sizeBytes: number;
  label: string | null;
  sortOrder: number;
  downloadPath: string; // prefix with API base — JWT required
  createdAt: string;
}
```

**Preview** — cannot use raw `<img src>`; fetch with JWT → blob URL:

```typescript
const res = await fetch(`${API_BASE}${attachment.downloadPath}`, {
  headers: { Authorization: `Bearer ${token}` },
});
const previewUrl = URL.createObjectURL(await res.blob());
```

**Delete** — `DELETE /bids/:id/attachments/:attachmentId` → `{ "ok": true }` (draft only).

| HTTP | When |
|------|------|
| `400` | Missing file, bad type, or 20-file limit |
| `409` | Upload/delete on non-draft bid |
| `413` | File > 10 MB |

---

### 3.4 Cover sheet header fields — **live**

Not in `baseBid`. On list + detail + create/PATCH. **Not** draft-locked (unlike `baseBid` / `systems` / `computed`).

| Field | Type | UI label | Notes |
|-------|------|----------|-------|
| `bidDate` | string \| null | Bid Date | `YYYY-MM-DD` |
| `submitDate` | string \| null | Submit Date | `YYYY-MM-DD` — when bid goes to client |
| `timeEstimate` | number \| null | Time Estimate | Estimated **hours** for the bid |

`ourEntityId` + `companyName` = **your** company bidding (GOEL / GOEL DC / DCB) — from `GET /lookups/our-entities`. Not the client.

**Auto submit date:** `PATCH { "status": "submitted" }` with no `submitDate` → backend sets **today** (UTC). Send explicit `submitDate` to override.

```jsonc
// List + detail include these:
{ "bidDate": "2026-03-01", "submitDate": "2026-06-15", "timeEstimate": 120 }

// PATCH example
{
  "bidDate": "2026-03-01",
  "submitDate": "2026-06-15",
  "timeEstimate": 120,
  "status": "submitted"
}
```

**Migration:** backend needs `npm run bidding-migrate` (adds `SubmitDate`, `TimeEstimate` on `Bids`).

---

### 3.5 Company info (client / GC) — **live**

Who the bid is **for** (mechanical contractor, GC, owner). **Not** `ourEntityId` / `companyName` (that is GOEL / GOEL DC / DCB — who is bidding).

Stored separately from `baseBid`. **Draft-lock** same as `baseBid` / `systems` / `computed`.

#### Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| — | `GET /bids/:id` | Returns full `companyInfo` object |
| — | `POST` / `PATCH /bids/:id` | Create or merge `companyInfo` |
| GET | `/bids/prefill/company-from-job/:jobId` | Suggested values from `Ref_Jobs` (does not save) |

#### Object shape

```jsonc
{
  "companyName": "ABC Mechanical",
  "address": "123 Main St",
  "city": "Baltimore",
  "state": "MD",
  "zip": "21201",
  "contactName": "Jane Doe",
  "contactEmail": "jane@abc.com",
  "contactPhone": "410-555-0100",
  "notes": "GC on this job"
}
```

| Field | Type | Max length | Notes |
|-------|------|------------|-------|
| `companyName` | string | 500 | Shown on bid list as `clientCompanyName` |
| `address` | string | 500 | |
| `city` / `state` / `zip` | string | 500 | |
| `contactName` | string | 500 | |
| `contactEmail` | string | 500 | |
| `contactPhone` | string | 500 | |
| `notes` | string | 500 | Free text |

All fields optional. Extra keys are stored (passthrough) like `baseBid`.

```typescript
interface BidCompanyInfo {
  companyName?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  notes?: string | null;
}
```

#### Create / PATCH

`companyInfo` is **merged** into existing values (PATCH does not wipe omitted keys).

```jsonc
// PATCH /bids/12
{ "companyInfo": { "companyName": "ABC Mechanical", "contactName": "Jane Doe" } }
```

**Auto-prefill on create:** if you `POST /bids` with `jobId` and **omit** `companyInfo`, the backend seeds it from the job (`companyName` ← job name, `address` ← job address, `city` ← job city, `notes` ← job number).

**Manual prefill:** when the user picks a job in the UI, call prefill then let them edit before save:

```jsonc
// GET /bids/prefill/company-from-job/42
{
  "companyName": "Hospital Expansion",
  "address": "100 Main St",
  "city": "Baltimore",
  "state": null,
  "zip": null,
  "contactName": null,
  "contactEmail": null,
  "contactPhone": null,
  "notes": "Job # 12201"
}
```

Changing `jobId` alone does **not** overwrite saved `companyInfo` — call prefill and PATCH `companyInfo` if you want to refresh.

#### List + search

```jsonc
// GET /bids
[
  {
    "id": "12",
    "estimateNumber": "IDC6098",
    "companyName": "GOEL",
    "clientCompanyName": "ABC Mechanical",
    "status": "draft"
  }
]
```

- `companyName` — **your** entity (GOEL / GOEL DC / DCB)
- `clientCompanyName` — from `companyInfo.companyName` (null if empty)
- `GET /bids?search=abc` — matches estimate #, bid name, or **client company name**

#### Detail example

```jsonc
// GET /bids/12
{
  "id": "12",
  "ourEntityId": 1,
  "companyName": "GOEL",
  "clientCompanyName": "ABC Mechanical",
  "jobId": 42,
  "companyInfo": {
    "companyName": "ABC Mechanical",
    "address": "123 Main St",
    "city": "Baltimore",
    "state": "MD",
    "zip": "21201",
    "contactName": "Jane Doe",
    "contactEmail": "jane@abc.com",
    "contactPhone": "410-555-0100",
    "notes": "GC on this job"
  }
}
```

**Do not use** `Ref_OurEntities` or hauler tables for this section. Followup contractor dropdown (`/lookups/bidding/prospects`) is **post-MVP**.

**Migration:** `npm run bidding-migrate` adds `Bid_Content.CompanyInfoJson`.

---

### 3.6 Activity log (audit trail) — **live**

Check-and-balance: who touched the bid, what area changed, when. Logged automatically on create, PATCH, submit/reopen, delete, attachment add/remove.

#### Summary on bid detail

`GET /bids/:id` includes `activitySummary`:

```jsonc
{
  "activitySummary": {
    "attendeeCount": 3,
    "changeCount": 18,
    "lastActivityAt": "2026-06-15T14:30:00.000Z",
    "lastActivityByEmail": "estimator@goelservices.com"
  }
}
```

| Field | Meaning |
|-------|---------|
| `attendeeCount` | Distinct users who made changes |
| `changeCount` | Total log entries |
| `lastActivityAt` | Most recent event (ISO) |
| `lastActivityByEmail` | Who made the last change |

#### Full timeline

`GET /bids/:id/activity`

```jsonc
{
  "summary": { /* same shape as activitySummary */ },
  "items": [
    {
      "id": 42,
      "action": "updated",
      "area": "baseBid",
      "summary": "Base bid inputs updated (marginPercent, projectState)",
      "changedFields": ["baseBid.marginPercent", "baseBid.projectState"],
      "userId": 5,
      "userEmail": "estimator@goelservices.com",
      "createdAt": "2026-06-15T14:30:00.000Z"
    },
    {
      "id": 41,
      "action": "submitted",
      "area": "status",
      "summary": "Bid submitted",
      "changedFields": ["status"],
      "userId": 5,
      "userEmail": "estimator@goelservices.com",
      "createdAt": "2026-06-15T12:00:00.000Z"
    }
  ]
}
```

Newest first.

#### Actions & areas

| `action` | When |
|----------|------|
| `created` | `POST /bids` |
| `updated` | Field/section edit |
| `submitted` | Status → `submitted` |
| `reopened` | Status back to `draft` |
| `archived` | Status → `archived` |
| `deleted` | Soft delete |
| `attachment_added` | File upload |
| `attachment_removed` | File delete |

| `area` | What changed |
|--------|----------------|
| `bid` | Whole bid (create/delete) |
| `header` | Cover sheet (`bidDate`, `timeEstimate`, `estimateNumber`, …) |
| `companyInfo` | Client/GC section |
| `baseBid` | Calculator inputs |
| `systems` | System rows |
| `computed` | Client calculator snapshot |
| `attachments` | Images/PDFs |
| `status` | Draft / submitted / archived |

#### UI suggestions

- **Summary strip** on bid detail: *"3 people · 18 edits · last by estimator@… 2h ago"*
- **Activity tab** — call `GET /bids/:id/activity`, render `items` as a timeline
- Filter by user/date in the UI (client-side on `items`)

`changedFields` lists keys only (not before/after values) — enough for MVP accountability.

**Migration:** `npm run bidding-migrate` adds `Bid_ActivityLog` + `Bids.UpdatedByUserId`.

---

### List item
```jsonc
// GET /bids
[
  {
    "id": "12", "estimateNumber": "IDC6098", "bidName": "Some Project",
    "status": "draft", "ourEntityId": 1, "companyName": "GOEL",
    "clientCompanyName": "ABC Mechanical",
    "bidDate": "2026-03-01", "submitDate": null, "timeEstimate": 120,
    "updatedAt": "2026-05-29T10:00:00.000Z"
  }
]
```
`status` is `draft | submitted | archived`. `id` is returned as a **string**.

### Create
```jsonc
// POST /bids
{ "ourEntityId": 1, "jobId": 42, "estimateNumber": "IDC6098", "bidName": "Optional",
  "bidDate": "2026-03-01", "submitDate": "2026-06-15", "timeEstimate": 80,
  "companyInfo": { "companyName": "ABC Mechanical", "contactName": "Jane Doe" },
  "baseBid": { "marginPercent": 0.15 }, "systems": [], "computed": {} }
```
Omit `companyInfo` on create with `jobId` → backend auto-prefills from job.
Returns the full detail object (same shape as `GET /bids/:id`).

### Detail
```jsonc
// GET /bids/:id
{
  "id": "12", "estimateNumber": "IDC6098", "bidName": "...", "status": "draft",
  "ourEntityId": 1, "companyName": "GOEL", "clientCompanyName": "ABC Mechanical",
  "jobId": 42,
  "bidDate": "2026-03-01", "submitDate": "2026-06-15", "timeEstimate": 80,
  "updatedAt": "...",
  "companyInfo": { "companyName": "ABC Mechanical", "address": "123 Main St", "city": "Baltimore" },
  "baseBid": { /* the saved Base Bid inputs (see §4) */ },
  "systems": [ /* the saved system rows (see §4) */ ],
  "computed": { /* last client snapshot, or {} if never saved */ },
  "attachments": [
    {
      "id": 3,
      "fileId": 8,
      "fileName": "site.jpg",
      "mimeType": "image/jpeg",
      "sizeBytes": 245000,
      "label": "Site photo",
      "sortOrder": 0,
      "downloadPath": "/bids/12/attachments/3/download",
      "createdAt": "2026-06-04T12:00:00.000Z"
    }
  ]
}
```

### Update (header + inputs + computed)
`PATCH /bids/:id` accepts any subset.
- Header fields (`bidDate`, `submitDate`, `timeEstimate`, `estimateNumber`, …) — see §3.4.
- `baseBid` is **merged** into existing inputs (passthrough — any key is stored).
- `systems` **replaces** the array (`key` is still validated against the enum).
- `computed` **replaces** the stored snapshot verbatim — the server never runs its own formulas over it.
- A PATCH **without** `computed` leaves the previous snapshot unchanged.
- `companyInfo` — **merged** on PATCH (§3.5); draft-locked with `baseBid` / `systems` / `computed`.

```jsonc
{
  "status": "draft",
  "bidDate": "2026-03-01",
  "submitDate": "2026-06-15",
  "timeEstimate": 120,
  "companyInfo": { "companyName": "ABC Mechanical", "contactPhone": "410-555-0100" },
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
- **Draft-lock:** content (`baseBid` / `systems` / `companyInfo` / `computed`) can only be changed while `status: "draft"`. On a `submitted`/`archived` bid these return **409 Conflict** — first reopen with a status-only PATCH `{ "status": "draft" }`, then edit.
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

1. **On bid open:** `GET /bids/:id` → hydrate `baseBid`, `systems`, `computed`, `companyInfo`, `attachments`, cover sheet fields.
2. **Company info:** separate form section (§3.5). On job pick → `GET /bids/prefill/company-from-job/:jobId`, let user edit, save via `PATCH { companyInfo }`.
3. **Activity log:** show `activitySummary` on detail; full timeline via `GET /bids/:id/activity` (§3.6).
4. **Cover sheet:** bind `timeEstimate` + `submitDate` to header PATCH (§3.4). On submit, send `status: "submitted"`; `submitDate` auto-fills if empty.
5. **On dropdown focus:** load `/lookups/bidding/*` once and cache.
6. **On wage-rate select:** `GET /lookups/bidding/wage-rates/:id/burdened-rate` → burden breakdown.
7. **On input change:** client Excel engine live; debounced `PATCH` with `{ baseBid, systems, computed }` — no `/calculate`.
8. **Attachments (draft only):** §3.3 — upload/preview/delete; read-only gallery when submitted.
9. **Admin:** wage-rate and payroll-burden CRUD (§2).

---

## 7. DB migration (backend/devops)

`npm run bidding-migrate` — idempotent `scripts/sql/add-bidding-tables.sql`.

Recent alters: `Bid_ActivityLog`, `Bids.UpdatedByUserId`, `Bid_Content.CompanyInfoJson`, `Bids.SubmitDate`, `Bids.TimeEstimate`, `App_Files` / `Bid_Attachments`. Re-run safe after each backend deploy.
