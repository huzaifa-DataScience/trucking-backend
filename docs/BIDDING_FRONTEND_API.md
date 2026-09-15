# Bidding API — Frontend Handoff (single doc)

**Start here if you are an FE agent:** **[FRONTEND_BIDDING_CONTEXT.md](./FRONTEND_BIDDING_CONTEXT.md)** (product + anti-patterns). This file is the **shell + Base Bid API**. Do **not** follow a second “app IA” doc.

- **Login home (role dashboard):** **[FRONTEND_BIDDING_DASHBOARD.md](./FRONTEND_BIDDING_DASHBOARD.md)** — **give to FE first**
- Specs grid / Mike: **[FRONTEND_BIDDING_SPECS.md](./FRONTEND_BIDDING_SPECS.md)** (same bid, **Takeoff** stage)
- Spec **sheet** (dropdown rules, before takeoff) — **give to FE:** **[FRONTEND_SPEC_SHEET.md](./FRONTEND_SPEC_SHEET.md)**
- **Intake + Assignment (Stage 1):** **[FRONTEND_INTAKE.md](./FRONTEND_INTAKE.md)**
- Production hours: **[FRONTEND_PRODUCTION_REPORT.md](./FRONTEND_PRODUCTION_REPORT.md)** (same bid, **Production tab**)
- `process` field dictionary: **[FRONTEND_BIDDING_LIFECYCLE.md](./FRONTEND_BIDDING_LIFECYCLE.md)**
- Excel cell map: **[BIDDING_BASEBID_FIELDS.md](./BIDDING_BASEBID_FIELDS.md)**

- **Last updated:** 2026-09-16
- **Base URL:** same API host as the rest of the dashboard (e.g. `https://<api-host>/bids`, `/lookups/bidding/...`).
- **Auth:** every endpoint requires JWT (`Authorization: Bearer <token>`).
- **JSON requests:** `Content-Type: application/json` (except attachment upload — `multipart/form-data`).
- **Money/percent convention:** rates are decimals (`0.06` = 6%, `0.15` = 15%). Dollar amounts are plain numbers.

---

## Changelog (newest first)

| Date | Feature | Status |
|------|---------|--------|
| 2026-09-16 | **Proposal = output** (PJ) — building type / project type / impacted GSF / company on **intake**. Base Bid sheet shows them read-only; calculator stays editable. | **[BIDDING_BASEBID_FIELDS.md](./BIDDING_BASEBID_FIELDS.md)** · **[FRONTEND_INTAKE.md](./FRONTEND_INTAKE.md)** |
| 2026-09-16 | **Captain Settings crew** — `GET/PATCH /auth/team` picks **people** (`GET /connecteam/users`), not a pre-made Bid_Teams dropdown. First save creates their team. | **[FRONTEND_AUTH.md](./FRONTEND_AUTH.md)** |
| 2026-09-15 | **Captain team** — `PATCH /auth/team`. Estimates auto-filters captain/AE by `user.teamId`. Assignment: pick captain (`GET /lookups/bidding/captains`) → `teamId` fills. | **[FRONTEND_BIDDING_DASHBOARD.md](./FRONTEND_BIDDING_DASHBOARD.md)** · **[FRONTEND_INTAKE.md](./FRONTEND_INTAKE.md)** |
| 2026-09-11 | **Estimates Excel export** — `GET /bids/export` (same filters as `GET /bids`). `.xlsx` download. | **[FRONTEND_BIDDING_DASHBOARD.md](./FRONTEND_BIDDING_DASHBOARD.md)** |
| 2026-09-10 | **Role dashboards** — `GET /dashboard` (alias `GET /bids/my-plate`) is due / upcoming / assigned + messages. Estimates list is `GET /bids`. | **[FRONTEND_BIDDING_DASHBOARD.md](./FRONTEND_BIDDING_DASHBOARD.md)** |
| 2026-09-10 | **Team edit** — `GET /bids` is not role-filtered. `canEdit` per row. Assign `teamId` on the user. | **This doc §3 + [FRONTEND_BIDDING_CONTEXT.md](./FRONTEND_BIDDING_CONTEXT.md)** |
| 2026-08-25 | **Spec sheet cascade** — family → layer 1 → layer 2; equipment kind; duct circumference; manufacturer; Buy American. | **[FRONTEND_SPEC_SHEET.md](./FRONTEND_SPEC_SHEET.md)** |
| 2026-08-25 | **Intake parties directory** — `GET /lookups/bidding/parties?role=&q=`. PATCH upserts; no POST. | **[FRONTEND_INTAKE.md](./FRONTEND_INTAKE.md)** |
| 2026-08-23 | **Stage 1 gates** — bid type + drawings (build-to-print/design-assist) + single-invite research to hand off; bid name locked; `#` stripped on project #s; per-invite addenda; `POST /bids/:id/link-duplicate`. | **[FRONTEND_INTAKE.md](./FRONTEND_INTAKE.md)** |
| 2026-08-19 | Spec sheet cascade: type filters systems **and** materials; **codes auto** (system/area/material). Area is one shared list. | **[FRONTEND_SPEC_SHEET.md](./FRONTEND_SPEC_SHEET.md)** |
| 2026-08-18 | **Spec sheet = dropdown rules** (not FortuneSheet). Setup, before takeoff. Reuse spec-systems/areas/materials/facings. | **[FRONTEND_SPEC_SHEET.md](./FRONTEND_SPEC_SHEET.md)** |
| 2026-08-16 | **Spec sheet** — Setup stage, before takeoff. Template (Duct/Plumbing) + FortuneSheet. Images via attachments. | superseded 2026-08-18 |
| 2026-08-14 | **Outcome tab** — last Pre tab; win/lose changeable. Post Awarded/Lost follow current outcome. Not a one-shot button. | **This doc §0** |
| 2026-08-14 | **Award UI is gated** — post-award/startup is a **separate** phase. Change outcome to Awarded first; only then show that screen. Lost ≠ award form. | **This doc §0** |
| 2026-08-10 | **Mike upload auto-regenerates Specs** — `POST .../mike-files` rebuilds Spec lines; fixes stale Foamglas/FSK zeros | **Live** — **[FRONTEND_BIDDING_SPECS.md](./FRONTEND_BIDDING_SPECS.md)** |
| 2026-08-10 | **Mike Rules panel copy** — Specs Rules button/sub-tab (Mike stacking only) | **Doc** — **[FRONTEND_MIKE_RULES.md](./FRONTEND_MIKE_RULES.md)** |
| 2026-08-09 | **Structshare = item search list** — no cheapest/vendor pick; Recv + Hrs@Recv share attr search; `itemName` vendor-stripped | **Live** — **[FRONTEND_BIDDING_SPECS.md](./FRONTEND_BIDDING_SPECS.md)** |
| 2026-08-08 | **Multi-Mike = one takeoff** — Specs/Production merge all files on a bid; Production list = **1 row per bid** | **Live** — see MUST READ in **[FRONTEND_PRODUCTION_REPORT.md](./FRONTEND_PRODUCTION_REPORT.md)** |
| 2026-08-05 | **Production report** — commodity earned hours (Mike/Trimble) vs Connecteam actual → green/red | **Live** — **[FRONTEND_PRODUCTION_REPORT.md](./FRONTEND_PRODUCTION_REPORT.md)** |
| 2026-07-21 | **Specs Plumb** — Mike rows, Spec lines, Trimble received, item catalog / Structshare | **Live** — see **[FRONTEND_BIDDING_SPECS.md](./FRONTEND_BIDDING_SPECS.md)** |
| 2026-06-15 | **Activity log** — who changed what, when (`GET /bids/:id/activity`) | **Live** — §3.6 |
| 2026-06-04 | **Company info** — client/GC section (`companyInfo`, prefill from job) | **Live** — §3.5 |
| 2026-06-04 | **Cover sheet** — `timeEstimate`, `submitDate` on bid header | **Live** — §3.4 |
| 2026-06-04 | **Attachments** — images/PDFs on bid | **Live** — §3.3 |
| 2026-03+ | Client-calc model, lookups CRUD, `baseBid` passthrough | **Live** — §1–§2, §4 |

---

## 0. What FE must change (read this first)

**Source:** *Proposed Bid-to-Project Startup Workflow* PDF. One bid record. Do **not** rebuild Estimate / Specs / Production — wrap them. Incomplete save.

**Two zones — do not mix:**

1. **Pre** (always): Intake → Assignment → Setup → Takeoff → Proposal → Post-Bid → **Outcome**
2. **Post** (only after Outcome has a pick, and it can change): Awarded/startup **or** Lost

Outcome is a **tab at the end of Pre**, not a one-shot button. Win → Lost → Win again is allowed. Changing it switches which Post screen shows; it does not delete saved fields.

### Keep (wrap)

| Already shipped | Lives in stage |
|-----------------|----------------|
| Bid list + create (est #, our company, name) | Hub. Add `processStage`, `outcomeStatus`, `workType` columns/filters. |
| Base Bid calculator | **Proposal** (also usable during takeoff) |
| Specs + Mike upload | **Takeoff** — versions never overwritten |
| Production report | After **outcome = awarded** |

### Chrome

```text
/dashboard                            GET /dashboard      (role widgets — not Estimates)
/bidding                              GET /bids           (Estimates list — captain/AE = their team; admin = all)
/bidding/new                          3 fields → POST → intake
/bidding/[id]?stage=intake|assignment|estimating_setup|takeoff|proposal|post_bid|result
/bidding/[id]?stage=award             only when workflow.showAward   ← POST
/bidding/[id]?stage=lost              only when workflow.showLost    ← POST
```

```
PRE  1 Intake ▸ 2 Assignment ▸ 3 Setup ▸ 4 Takeoff ▸ 5 Proposal ▸ 6 Post-Bid ▸ 7 Outcome
                                                                              (win / lose — changeable)
POST (separate, not in that strip until a pick)
     Awarded / startup     if outcome = awarded
     Lost form             if lost / no_bid / cancelled / postponed
```

Read `workflow` on `GET /bids/:id` — do not invent the gate.

| `workflow` | Meaning |
|------------|---------|
| `canComplete` / `completeBlockedReason` | Enable **Complete & Hand Off** |
| `canReturn` | Enable **Return** |
| `showOutcomeTab` | Always `true`. Last **Pre** tab. Put win/lose **here**, not a header button. |
| `outcomeEditable` | Always `true` until archived. `POST /bids/:id/outcome` again to change. |
| `showAward` | Show **Post** Awarded/startup. Follows **current** outcome. |
| `showLost` | Show **Post** Lost form. Follows **current** outcome. |
| `takeoffComparisons` | Duct1 vs Duct2 (etc.) — computed, not stored |

### Actions

| User does | Call |
|-----------|------|
| Save draft (any stage, incomplete OK) | `PATCH /bids/:id` `{ process }` — objects merge, **arrays replace** |
| Complete my step & hand off | `POST /bids/:id/handoff` `{ "action": "complete", "notes"? }` — Intake blocked until bid type + (drawings if build-to-print/design-assist) + who-else research if fewer than two invites |
| Close a mistaken duplicate | `POST /bids/:id/link-duplicate` `{ "keepBidId" }` — merges invites onto keep, archives this bid |
| Return to previous step | `POST /bids/:id/handoff` `{ "action": "return" }` |
| **Win / lose / no-bid / cancel / postpone** (and change later) | `POST /bids/:id/outcome` `{ "outcome": "awarded" }` — same call to switch |
| Submit price (locks Estimate math) | `PATCH { "status": "submitted" }` — not the same as outcome |

`status` (draft / submitted / archived) locks calculator math. `outcome` is the Pre **Outcome tab** and is **not sticky**. Do not mix them.

Assignment **No bid** jumps to the Outcome tab with `no_bid` pre-selected — user can still change it.

Estimating Setup → Takeoff is blocked until `process.technicalReview.approvedForTakeoff === true`.

Outcome tab: **Complete & Hand Off** is off (`canComplete: false`). Change `outcome` on that tab instead.

### Stage → screen

| Stage | Bind | Notes |
|-------|------|--------|
| Intake | `process` identity + parties + invite docs | Bid clerk. Estimator **not** required. Bid name = `drawingName`. Two project #s. `bidKind` (budget is a kind). `invitations[]` (`inviteBody`, `preferredContact`) + `documentLinks[]` (`checkAddenda`). Paste address in `line1`. **Hide `jobId`.** Tiers sketched here. Typeahead: `GET /bids?search=&ownerProjectNumber=&mechanicalEngineerProjectNumber=`. **[FRONTEND_INTAKE.md](./FRONTEND_INTAKE.md)**. |
| Assignment | `process.assignment`, `takeoffAssignments` | Nick + PJ + bid clerk. Pick **captain** from `GET /lookups/bidding/captains` (`assignment.captainUserId`) — backend fills `assignment.teamId`. Bid/no-bid, AE/clerk, 1 or 2 people per scope. |
| Estimating Setup | wage **decision**, PLA, OCIP, lifts, parking, `insulationSpecs`, **`specSheets`**, `technicalReview` | Wage **decision** ≠ wage **rate**. Spec **sheet** = dropdown **rules** — **[FRONTEND_SPEC_SHEET.md](./FRONTEND_SPEC_SHEET.md)**. Building type / GSF are **intake**, not here. |
| Takeoff | existing Specs/Mike + `takeoffAssignments.versions` | Never overwrite a takeoff file. New version each revision. Show `workflow.takeoffComparisons`. |
| Proposal | existing Estimate (`baseBid` + `computed`) + `estimateReview`, `proposalVersions`, `amendments`, `submission` | **Output + calc.** `proposalEditor.firstHere` = schedule/money, wage rate, lifts, parking, Mike grid. `readOnly` = company / estimate # / bid name / building / project type / GSF / state / team / captain / AE / crew. PLA/CCIP/MBE also on Setup. `+ Add` amendment. **[BIDDING_BASEBID_FIELDS.md](./BIDDING_BASEBID_FIELDS.md)** |
| Post-Bid | `process.intelligence`, GC/mechanical `stillBidding` | Follow-up, competitors. Still **Pre**. |
| **Outcome** | `process.outcome` / `POST .../outcome` | Last Pre tab. Awarded / Lost / No bid / Cancelled / Postponed. **Change anytime.** |
| Awarded / startup (**Post**) | `process.award`, `startup`, `contractTiers`, `jobId` | **Only if `workflow.showAward`.** Hidden if they switch away from awarded. Data stays. |
| Lost (**Post**) | `process.lost` | **Only if `workflow.showLost`.** Same rule. |
| Production | existing production APIs | After awarded. |

**New bid** stays tiny: `estimateNumber`, `ourEntityId`, optional `bidName` + `process.workType`. Then intake. Half-empty OK.

Enums / who-owns-what: `GET /lookups/bidding/process-meta`. Full shape: [FRONTEND_BIDDING_LIFECYCLE.md](./FRONTEND_BIDDING_LIFECYCLE.md).

Ship order: list + intake + assignment + handoff + **Outcome tab**. Post Awarded/Lost screens follow the current outcome and must not replace Pre.

---

## 1. What's in production

| Area | Change |
|------|--------|
| **App shell** | Bid list → New or open → **PDF stages** + handoff. Wrap Estimate/Specs/Production. Awarded/Lost **after outcome**. **§0**. |
| **`process` on the bid** | Lifecycle JSON (pre-win + award). `GET`/`PATCH` `/bids/:id`. Filters `processStage`, `workType` on list. |
| **Production report** | Commodity earned hours vs Connecteam actual (green/red). **[FRONTEND_PRODUCTION_REPORT.md](./FRONTEND_PRODUCTION_REPORT.md)**. |
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
| **Save** | `PATCH /bids/:id` with `baseBid`, `systems`, `companyInfo`, `computed`, **`process`** — stored **verbatim**; **no** server recalc on PATCH. |
| **Load** | `GET /bids/:id` returns stored `baseBid`, `systems`, `companyInfo`, **`process`**, `computed` unchanged (latest `source: client` snapshot). |
| **PATCH response** | Same shape as GET — includes stored `computed` after save. |
| **PATCH without `computed`** | Previous `computed` snapshot **unchanged**. |
| **Submitted lock** | `baseBid` / `systems` / `companyInfo` / `computed` on a non-`draft` bid → **409**. **`process` is still PATCH-able** after submit (handoff, intel, outcome). Archived → process locked too. Status-only PATCH (`{ "status": "draft" }`) still allowed. |
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
| GET | `/lookups/bidding/process-meta` | Lifecycle enums, field entry-phase, HQ tier example (**[FRONTEND_BIDDING_LIFECYCLE.md](./FRONTEND_BIDDING_LIFECYCLE.md)**) |
| GET / POST / PATCH / DELETE | `/lookups/bidding/wage-decisions` | Prevailing-wage **decision #** lookup (not calculator wage rates) |
| GET | `/lookups/bidding/teams` | Teams with crew roles + `captainUserId` |
| GET | `/lookups/bidding/captains` | `App_Users` `role=captain` (not rejected/inactive). `{ userId, name, email, status, teamId, teamName }`. **`teamId` may be null — still show the row.** Not “who is logged in right now.” Empty only if no user has role captain. |
| GET | `/lookups/bidding/contacts` | Settings people picker — login captains **and AEs/clerks** + Connecteam + Excel roster. `{ appUserId, connecteamUserId, name, email, role }[]`. Optional `?role=assistant_estimator`. No paging. |
| GET | `/lookups/bidding/parties` | Intake directory `?role=owner\|architect\|mechanical\|invite_contact&q=&page=&pageSize=` → `{ items, total, page, pageSize }` |
| GET | `/lookups/bidding/wage-rates` | Wage/fringe options |
| GET | `/lookups/bidding/payroll-burden` | Burden constants |
| GET | `/lookups/bidding/states` | `{ stateCode, salesTaxRate }[]` |
| GET | `/lookups/bidding/project-types` | `{ id, name }[]` |
| GET | `/lookups/bidding/building-types` | `{ id, name }[]` |
| GET | `/lookups/bidding/preferences` | `{ id, name }[]` |
| GET | `/lookups/bidding/spec-systems` | Specs — system → `code`/`unit`/`kind` (`?kind=duct\|hydronic\|plumbing\|equipment`) |
| GET | `/lookups/bidding/spec-materials` | Insulation types. **`family` required** (or `code` / `q`). Bare GET → `[]`. `layer` / `?kind=` ignored. Each row has `family` + `layer`. |
| GET | `/lookups/bidding/spec-areas` | Specs — area → `code` (shared list, not per system) |
| GET | `/lookups/bidding/spec-sizes` | `?code=` Trimble NPS; `[]` = leave size blank. Do not omit `code` after pick. |
| GET | `/lookups/bidding/spec-thicknesses` | `?code=` Trimble thick; `[]` = leave thick blank |
| GET | `/lookups/bidding/spec-facings` | Specs / spec sheet — `{ value, label, sortOrder }` (ASJ, FSK, …) override |
| GET | `/lookups/bidding/helper-map` | Specs — phrase → keyword/base (backend; rarely shown in UI) |
| GET / PATCH | `/lookups/bidding/item-catalog` | Specs — Structshare catalog + price edit |

### Teams
```jsonc
// GET /lookups/bidding/teams
[
  {
    "id": 1, "teamName": "Wilder Rodriguez",
    "captain": "Wilder Rodriguez", "captainUserId": 12, "bidClerk": "Hassan Riaz",
    "duct1": "John Carlo Orpilla", "duct2": null,
    "hydronic1": "Jonathan Bruce", "hydronic2": "Brian Angelo Limon",
    "plumbing1": "Hennan Berberio", "plumbing2": "Mark Chua"
  }
]

// GET /lookups/bidding/captains  — login users with role=captain only (example row)
[
  { "userId": 12, "name": "Wilder Rodriguez", "firstName": "Wilder", "lastName": "Rodriguez",
    "email": "wilder@goel.com", "teamId": 1, "teamName": "Wilder Rodriguez" }
]
```
Assignment: bind captain to `assignment.captainUserId` from that GET. Do **not** hardcode Wilder/Bil/Mike. If the array is empty, nobody has role captain yet. Save — `teamId` + `captain` name fill. Team-first still works (fills captain **only** if that team has a login captain).

Captain’s own crew (**Settings → My team**): `GET/PATCH /auth/team` — pick people from `GET /lookups/bidding/contacts` (or `GET /auth/team` → `people`). Includes AEs / clerks / Excel Wilder-Bil-Mike crew, not captains-only. Not `GET /lookups/bidding/teams`.

Team admin:
- `POST /lookups/bidding/teams` body `{ "teamName": "New Team" }`
- `DELETE /lookups/bidding/teams/:id` (soft remove)

### Parties (intake directory)
```jsonc
// GET /lookups/bidding/parties?role=mechanical&q=wsp&page=1&pageSize=10
{
  "items": [
    {
      "id": 12, "name": "WSP", "company": "WSP", "contactName": null,
      "email": "a@wsp.com", "phone": null, "role": "mechanical",
      "inactive": false, "doNotContact": false, "status": null
    }
  ],
  "total": 1, "page": 1, "pageSize": 10
}
```
Filter `role` + optional `q` (name / company / email). Default `page=1`, `pageSize=10` (max 50). Seeded from past bids; `PATCH /bids/:id { process }` upserts owner / architect / mechanicalEngineer / invitations[].contact. No POST. Not a bare array.

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
| GET | `/dashboard` | **Role dashboard** (not Estimates). `{ title, hint, plateId, teamId, counts, groups, messages, notifications }`. `groups` = `due` / `upcoming` / `assigned`. |
| GET | `/bids/my-plate` | Same payload as `GET /dashboard`. Prefer `/dashboard`. Register before `:id`. |
| GET | `/bids?status=&entityId=&search=&processStage=&workType=&outcome=&ownerProjectNumber=&mechanicalEngineerProjectNumber=&teamId=` | List. Captain/AE with `user.teamId` auto-scoped to that crew (`teamId=all` to see everyone). `search` also matches drawing name + both project #s. Exact # params for duplicate typeahead. Rows include `drawingName`, `ownerProjectNumber`, `mechanicalEngineerProjectNumber`, `relatedBidId`, `bidKind`, `dueDate`, `dueTime`, `teamId`, `canEdit`, `isNew`. Hide Edit when `canEdit` is false. |
| GET | `/bids/export` | Excel of the same list. Same query params as `GET /bids`. Register before `:id`. `bidding:read`. `.xlsx` attachment `bids.xlsx`. |
| POST | `/bids` | Create a draft (optional `process`) |
| GET | `/bids/:id` | Full detail (inputs + `process` + `workflow` + last stored `computed`) |
| PATCH | `/bids/:id` | Header + Base Bid + systems + `computed` + **`process`** |
| POST | `/bids/:id/handoff` | Complete or return a workflow stage |
| POST | `/bids/:id/outcome` | Set awarded / lost / no_bid / cancelled / postponed |
| DELETE | `/bids/:id` | Soft delete |
| POST | `/bids/:id/calculate` | **Deprecated** — no-op echo of stored snapshot (see §5) |
| POST | `/bids/:id/attachments` | Upload image/PDF (`multipart`, field `file`) |
| GET | `/bids/:id/attachments/:attachmentId/download` | Download / inline view |
| DELETE | `/bids/:id/attachments/:attachmentId` | Remove attachment (until **archived**) |

`GET /dashboard` example:

```json
{
  "role": "captain",
  "plateId": "captain",
  "title": "Captain dashboard",
  "hint": "Your team’s setup / takeoff / proposal. Takeoff sent vs back is on Assigned.",
  "teamId": 2,
  "counts": { "due": 1, "upcoming": 2, "assigned": 8, "unreadMessages": 3, "notifications": 4 },
  "groups": [
    { "id": "due", "title": "Due", "columns": [{ "key": "estimateNumber", "label": "Bid #" }], "rows": [] },
    { "id": "upcoming", "title": "Upcoming", "columns": [], "rows": [] },
    { "id": "assigned", "title": "Assigned", "columns": [], "rows": [] }
  ],
  "messages": { "totalUnread": 3, "items": [{ "conversationId": "…", "title": "Mike", "unreadCount": 2, "lastMessagePreview": "…" }] },
  "notifications": [{ "kind": "message", "title": "Mike", "conversationId": "…" }, { "kind": "due", "title": "Weinberg", "bidId": "12" }]
}
```

---

### 3.3 Attachments (images / PDFs) — **live**

Site photos, screenshots, PDFs. Metadata in SQL; files on disk. `GET /bids/:id` includes `attachments[]` (not on list).

| Rule | Value |
|------|--------|
| Types | JPEG, PNG, WebP, PDF |
| Max size | 10 MB per file |
| Max count | 20 per bid |
| Upload / delete | until `status === "archived"` (submit does **not** block — PLA/spec PDFs after win) |
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

**Delete** — `DELETE /bids/:id/attachments/:attachmentId` → `{ "ok": true }` (blocked only if **archived**).

| HTTP | When |
|------|------|
| `400` | Missing file, bad type, or 20-file limit |
| `409` | Upload/delete on **archived** bid |
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
    "status": "draft",
    "processStage": "intake",
    "outcomeStatus": "open",
    "workType": "insulation"
  }
]
```

- `companyName` — **your** entity (GOEL / GOEL DC / DCB)
- `clientCompanyName` — from `companyInfo.companyName` (null if empty)
- `GET /bids?search=abc` — estimate #, bid name, client company, **drawing name**, **both project #s**
- `GET /bids?ownerProjectNumber=` / `mechanicalEngineerProjectNumber=` — exact duplicate keys (intake typeahead)
- `GET /bids?processStage=intake&workType=insulation&outcome=open` — list filters for §0

#### Detail example

```jsonc
// GET /bids/12
{
  "id": "12",
  "ourEntityId": 1,
  "companyName": "GOEL",
  "clientCompanyName": "ABC Mechanical",
  "jobId": 42,
  "processStage": "intake",
  "outcomeStatus": "open",
  "workType": "insulation",
  "process": { "stage": "intake", "outcome": "open", "workType": "insulation" },
  "workflow": { "stage": "intake", "outcome": "open", "canComplete": true, "showAward": false, "showLost": false },
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
      "userFirstName": "Hassan",
      "userLastName": "Riaz",
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
| `handed_off` | `POST /bids/:id/handoff` complete |
| `returned` | `POST /bids/:id/handoff` return |
| `outcome_set` | `POST /bids/:id/outcome` |

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

### 3.7 `process` (lifecycle) — **live**

Same bid row. Bind stages from **§0**. Full shape: **[FRONTEND_BIDDING_LIFECYCLE.md](./FRONTEND_BIDDING_LIFECYCLE.md)**.

```http
PATCH /bids/:id
{ "process": { "stage": "intake", "workType": "insulation", "owner": { "name": "DIA" } } }

POST /bids/:id/handoff
{ "action": "complete", "notes": "Ready for assignment" }

POST /bids/:id/outcome
{ "outcome": "awarded" }
```

- Objects merge; **arrays replace**.
- Editable after **submit**. Locked if **archived**.
- `GET /bids/:id` always returns full `process` + **`workflow`** (gates, comparisons).
- List exposes `processStage` + `outcomeStatus` + `workType`.
- Outcome is **changeable** (`POST /bids/:id/outcome` again). Post Awarded/Lost follow `workflow.showAward` / `showLost`. Saved award/lost fields are kept when switching.

`GET /lookups/bidding/process-meta` — stages, outcomes, who, field phase.  
`GET /lookups/bidding/wage-decisions` — **not** `/wage-rates`.

---

### List item
```jsonc
// GET /bids
[
  {
    "id": "12", "estimateNumber": "IDC6098", "bidName": "Some Project",
    "status": "draft", "ourEntityId": 1, "companyName": "GOEL",
    "clientCompanyName": "ABC Mechanical",
    "processStage": "intake", "outcomeStatus": "open", "workType": "insulation",
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
  "process": { "stage": "intake", "workType": "insulation" },
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
- **Draft-lock:** `baseBid` / `systems` / `companyInfo` / `computed` only while `status: "draft"` (else **409** — reopen `{ "status": "draft" }`). **`process` is not draft-locked** (locked only when archived).
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
| `gsfOfBuilding` | number | **Copy** from `process.impactedGsf` for the engine. Do **not** edit GSF on Proposal (PJ: intake). |
| `parking` | boolean | + `parkingCostPerDay`, `parkingPeoplePercent` (`1` = 100%) |
| `liftsNeeded` | boolean | + `liftPercentage`, `liftCostPer4Weeks` |
| `averageNoPeople` | number | Excel H7 / G7 crew size |
| `backcheckHours` | number | Excel backcheck input |
| `wage` | number | optional echo of selected scale wage (passthrough) |
| `fringe` | number | optional echo of selected fringe (passthrough) |
| `wageRateLabel` | string | selected wage rate label (lookup) |
| `materialEscalationPerYear` | number | e.g. `0.04` |
| `laborRateCompositePerHour` | number | **D10** — client engine or manual; not `burdened-rate` |
| `teamName` / `assistantEstimator` | string | Echo from assignment / team row. Do **not** pick a hardcoded team on Proposal. |
| `projectType` / `buildingType` / `preference` | string | `projectType` / `buildingType` = intake (`constructionSubtype` / `constructionType`) — **show read-only**. `preference` is Setup MBE. |
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

**App chrome and tabs: §0.** Then:

1. **Estimates list:** `GET /bids` — admin/clerk full list; captain/AE their team. **Dashboard (other page):** `GET /dashboard`. Do not mix.
2. **On bid open:** `GET /bids/:id` → hydrate `process`, **`workflow`**, `baseBid`, Specs if takeoff, attachments.
2. **Company info:** Proposal/Estimate (§3.5). Job pick → prefill, PATCH `companyInfo`.
3. **Activity log:** `activitySummary` on chrome; timeline `GET /bids/:id/activity` (§3.6). Handoff/outcome are their own actions.
4. **Cover / due date:** `submitDate` + `timeEstimate` on header (§3.4). Submit → `{ "status": "submitted" }` (locks math, not outcome).
5. **Lookups:** cache `/lookups/bidding/*` including **`process-meta`** and **`wage-decisions`**.
6. **Wage-rate select (Estimate):** `GET .../wage-rates/:id/burdened-rate`. Wage-**decision** (Setup stage) is a different dropdown.
7. **Estimate input change:** client engine live; debounced `PATCH { baseBid, systems, computed }` — no `/calculate`.
8. **Stage fields:** debounced `PATCH { process }`. Incomplete OK. **Complete & Hand Off** is `POST .../handoff`, not a tab click. Spec sheet = dropdown rules `process.specSheets` — [FRONTEND_SPEC_SHEET.md](./FRONTEND_SPEC_SHEET.md).
9. **Outcome tab** (always, end of Pre): `POST /bids/:id/outcome` — changeable. **Post** Awarded/Lost only if `workflow.showAward` / `showLost`.
10. **Attachments:** §3.3 — upload until archived. Use `label` from `process-meta.attachmentLabels`.
11. **Admin:** wage-rate, payroll-burden, **wage-decision** CRUD.

---

## 7. DB migration (backend/devops)

`npm run bidding-migrate` — idempotent `scripts/sql/add-bidding-tables.sql`.  
`npm run bidding-migrate-process` — `ProcessStage`, `OutcomeStatus`, `WorkType`, `ProcessJson`, `Bid_WageDecisions` (remaps old stage names).
