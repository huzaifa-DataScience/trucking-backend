# Bidding frontend — context for the FE agent

**Who:** Frontend (human or AI). Read this **before** any other bidding doc.  
**Last updated:** 2026-09-16  
**Backend:** live NestJS. JWT on every call.

You are building the **bidding UI**. Backend already computes Specs, production hours, and workflow gates. **Do not rebuild those engines.** Wrap existing screens in the PDF stage chrome. Incomplete save is allowed.

**Hand FE first:** [FRONTEND_BIDDING_DASHBOARD.md](./FRONTEND_BIDDING_DASHBOARD.md) (**dashboard ≠ Estimates list**). Then [FRONTEND_SPEC_SHEET.md](./FRONTEND_SPEC_SHEET.md) and [FRONTEND_INTAKE.md](./FRONTEND_INTAKE.md).

Repo of truth is this backend `docs/` folder — not an old chat, not FortuneSheet screenshots.

---

## Read in this order

1. [FRONTEND_AUTH.md](./FRONTEND_AUTH.md) — JWT on every call
2. [FRONTEND_BIDDING_DASHBOARD.md](./FRONTEND_BIDDING_DASHBOARD.md) — **`GET /dashboard`** vs Estimates **`GET /bids`**
3. [BIDDING_FRONTEND_API.md](./BIDDING_FRONTEND_API.md) **§0 first** — app shell, stages, handoff, outcome. This is the IA. Do not invent a second navigation.
4. [FRONTEND_BIDDING_LIFECYCLE.md](./FRONTEND_BIDDING_LIFECYCLE.md) — `process` field dictionary only (not a second UI spec)
5. Then the screen you are coding:
   - **Intake + Assignment (Stage 1):** [FRONTEND_INTAKE.md](./FRONTEND_INTAKE.md)
   - Setup spec **rules:** [FRONTEND_SPEC_SHEET.md](./FRONTEND_SPEC_SHEET.md)
   - Takeoff qty grid / Mike: [FRONTEND_BIDDING_SPECS.md](./FRONTEND_BIDDING_SPECS.md) + [FRONTEND_MIKE_RULES.md](./FRONTEND_MIKE_RULES.md)
   - After award hours: [FRONTEND_PRODUCTION_REPORT.md](./FRONTEND_PRODUCTION_REPORT.md)
   - Excel cell names for Estimate: [BIDDING_BASEBID_FIELDS.md](./BIDDING_BASEBID_FIELDS.md) (client engine; `/calculate` is deprecated)

Enums: `GET /lookups/bidding/process-meta`. Do not hardcode stage lists.

**Estimates / bidding list** = `GET /bids` (full list + `canEdit`). **Dashboard** = `GET /dashboard` (widgets). Different pages. Do not swap them.

---

## What this product is

One **bid** record from invitation → takeoff → proposal → win/lose → (if awarded) startup + production.

```
PRE (always)
  Intake → Assignment → Setup → Takeoff → Proposal → Post-Bid → Outcome

POST (only after a current outcome pick; can change)
  Awarded / startup     if outcome = awarded
  Lost form             if lost / no_bid / cancelled / postponed

Production tab          after awarded (same bid)
```

- **Stage** (`process.stage`): where they are in Pre. Includes `result` = Outcome tab.
- **Outcome** (`open | awarded | lost | no_bid | cancelled | postponed`): win/lose on the Outcome tab. **Changeable.** Switching awarded → lost hides startup and shows Lost; saved fields stay.
- **Status** (`draft | submitted | archived`): only locks **Estimate math** (`baseBid` / `systems` / `computed` / `companyInfo`). `process` stays PATCH-able after submit until archived.

Do not mix these three.

---

## Chrome and APIs (do not invent)

```
/bidding
/bidding/new                         POST /bids   (estimateNumber, ourEntityId, optional bidName + workType)
/bidding/[id]?stage=intake|assignment|estimating_setup|takeoff|proposal|post_bid|result
/bidding/[id]?stage=award            only if workflow.showAward
/bidding/[id]?stage=lost             only if workflow.showLost
```

**Estimates (`/bidding`):** `GET /bids` — admin / clerk see the **full company list**. Captain / AE with `user.teamId` see **that team only**. Each row has `canEdit`. Hide Edit / Save when `canEdit === false`. `admin` / `super_admin`: every bid, always `canEdit: true`. Do not filter that page by stage. Export button: `GET /bids/export` (same query params → `bids.xlsx`).

Captain picks a crew in **Settings → My team**: people from `GET /lookups/bidding/contacts` (AEs included; also `GET /auth/team` → `people`) → `PATCH /auth/team` `{ slots }`. Replace stored `user` from `response.user`. Do not use `GET /lookups/bidding/captains` for this dropdown. Do not dropdown pre-made `GET /lookups/bidding/teams`. Do not page the dropdown.

**Dashboard (separate route `/dashboard`, not Estimates):** `GET /dashboard`. Widgets: `due`, `upcoming`, `assigned` + `messages`. Row click from either page → `/bidding/:id?stage=` + `row.processStage`.

- `admin` / `super_admin`: always `canEdit: true`
- Bid has no `teamId` yet: anyone may edit (intake)
- Bid `assignment.teamId` set: only users on that team (`user.teamId` from login) + admins

Assign a person to a crew: captain **Settings → My team** `PATCH /auth/team` `{ slots }`, or admin `PATCH /admin/users/:id` `{ "teamId": <Bid_Teams id> }`. Captain / AE plates **and Estimates** filter to that team when `user.teamId` is set.

Team label: `GET /lookups/bidding/teams` + `row.teamId`.

### Role dashboard widgets (`GET /dashboard`)

| Role | Due / upcoming | Assigned |
|------|----------------|----------|
| `bid_clerk` | Intake with a due date | Intake queue |
| `admin` / `super_admin` | All bids with a due date | **All bids** (every stage / outcome) |
| `captain` | Team setup / takeoff / proposal | Same + `takeoffAssigned` / `takeoffReceived` |
| `assistant_estimator` / `user` | Team setup + takeoff | Same |
| `project_manager` / `operations_manager` | Awarded jobs | Awarded list |

`messages.totalUnread` + `messages.items[]` = Connecteam inbox (same source as `/connecteam/conversations`). `notifications[]` mixes unread chats, due bids, and `isNew` assigned rows. There is **no** separate email/inbox product — `process-meta.defaults.notifications` stays false (handoff emails).

Empty widgets are OK. Do not replace the Estimates list with the dashboard.

`GET /bids/:id` returns `process` + **`workflow`**. Trust `workflow` for buttons:

| Field | Use |
|-------|-----|
| `canComplete` / `completeBlockedReason` | Complete & Hand Off |
| `canReturn` | Return |
| `showOutcomeTab` | always true — last Pre tab |
| `showAward` / `showLost` | Post screens; follow **current** outcome |
| `takeoffComparisons` | Duct1 vs Duct2 etc. Computed, not stored |

| User action | Call |
|-------------|------|
| Save (incomplete OK) | `PATCH /bids/:id` `{ process }` — objects **merge**, **arrays replace** |
| Hand off | `POST /bids/:id/handoff` `{ "action": "complete" \| "return" }` |
| Win/lose (and change later) | `POST /bids/:id/outcome` `{ "outcome": "awarded" }` — also sets `stage` to `result` |
| Submit price | `PATCH { "status": "submitted" }` — not outcome |

Setup → Takeoff blocked until `process.technicalReview.approvedForTakeoff === true`.  
Outcome tab: `canComplete` is false. Change outcome there; do not hand off off that tab.  
Assignment “no bid” jumps to Outcome with `no_bid` pre-selected; user can still change it.

Mint unique `id`s on array items (`newId()` below — do **not** call `crypto.randomUUID()` raw; it throws on HTTP / non-secure origins). Do not keep template id `new-duct`.

```ts
function newId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
```

**Stage 1 (Intake + Assignment):** bid name **locked** to `drawingName`. Two project #s (`#` stripped). `bidKind` includes `budget`. Second invitation → `invitations[]` (plus `addenda` per inviter). Paste invite email in `invitations[].inviteBody`. Preferred reach `contact.preferredContact`. Paste address in `projectAddress.line1` (city/state/zip fill on save). Owner/federal `documentLinks[].checkAddenda`. **No `jobId` until awarded.** One invite → `whoElseBidding.researched` required to hand off. Drawings attachment required for build-to-print / design-assist. Mistake second bid: `POST /bids/:id/link-duplicate`. Typeahead `GET /bids?search=&ownerProjectNumber=&mechanicalEngineerProjectNumber=`. Tiers on intake. **Building type / project type / impacted GSF / company rule on intake** (`constructionType`, `constructionSubtype`, `impactedGsf`, `entityRule`) — not on proposal. Assignment: Nick + PJ + clerk, pick captain (`assignment.captainUserId` from `GET /lookups/bidding/captains` — login users only, not hardcoded names) → `teamId` fills. Party address book: `GET /lookups/bidding/parties?role=&q=&page=&pageSize=` → `{ items, total, page, pageSize }`. Full contract: [FRONTEND_INTAKE.md](./FRONTEND_INTAKE.md).

---

## Three different “spec” things (most common mix-up)

| Thing | When | What | API |
|-------|------|------|-----|
| Spec **PDFs** | Setup | Which client books apply | attachments `hydronic-spec`, `plumbing-spec`, … + `process.insulationSpecs` |
| **Spec sheet** | Setup, **before takeoff** | Allowed **rules**: system × area × size × material (dropdowns) | `process.specSheets` on `PATCH /bids/:id` |
| **Specs grid + Mike** | **Takeoff** | Quantities, Recv, hours | `GET/PATCH /bids/:id/spec-lines`, `POST /bids/:id/mike-files` |

There is **no** `GET /bids/:id/specs`. Qty grid is **`/spec-lines`**.

### Spec sheet (Setup) — not a spreadsheet

PJ (2026-08-23): family → product → layer 1 factory jacket → layer 2 field cover. **FortuneSheet is out.** CSV auto-fail vs takeoff is **later**. Day 1 = dropdowns + save.

Each sheet: `kind: 'duct' | 'hydronic' | 'plumbing' | 'equipment'`.

Buy American: `process.buyAmerican` on Setup **before** the table (with OCIP). Project-level.

Row extras: `insulationFamily`, `ductShape`, `sizeMode`, `manufacturersAllowed`, `manufacturerPreferred`, `accessories`, `specSection`, `specParagraph`. Facing = layer 1. Jacket = layer 2. Duct size = circumference, not pipe NPS.

Estimators may type the Mike code (`GET spec-materials?code=FGA`). Do **not** put codes in a dropdown.

Full contract: [FRONTEND_SPEC_SHEET.md](./FRONTEND_SPEC_SHEET.md).

### Specs + Mike (Takeoff)

All CSVs on a bid are **one takeoff**. `POST /bids/:id/mike-files` **appends** and **auto-regenerates** Spec lines (`specsRegenerated` in response). `GET /bids/:id/mike-files` → `files.length` is 0 or 1, `calcMerge.mode === "single_file"`.

`GET /estimation-files` is the **CSV library only**. Do not build Production or Specs from it.

Stacking (pipe vs roll) is backend. UI copy: [FRONTEND_MIKE_RULES.md](./FRONTEND_MIKE_RULES.md). Do not re-sum Mike rows in the browser.

Structshare = item **search list**. No cheapest / vendor pick. Vendor names stripped from `itemName`.

Full contract: [FRONTEND_BIDDING_SPECS.md](./FRONTEND_BIDDING_SPECS.md).

---

## Estimate (Proposal) — output + client Excel engine

**PJ 13 Sep:** not a second intake form. Proposal = **output + calculations**. Cell map: **[BIDDING_BASEBID_FIELDS.md](./BIDDING_BASEBID_FIELDS.md)**. `process-meta.proposalEditor`.

**First here (or mainly here) — not Intake/Assignment:**

| Block | Fields |
|-------|--------|
| Schedule / money | Bid date, submit date, time estimate (hrs), margin, hours/day, days/week, duration (months), start in # months, backcheck hours, avg # people, material escalation / year |
| Wage / flags | Wage **rate** (scale), citizen, apprenticeable, sales tax applicable. Preference (MBE), PLA, CCIP-covers-WC — **also on Setup**, keep in sync |
| Lifts | Needed?, % on lifts, cost / 4 weeks |
| Parking | Parking?, % who park, cost / day |
| Mike / system grid | Per column: Mike estimate #, materials, labor hours, Mike total, quantity, used? |

**Read-only — do not re-ask:** company, estimate #, bid name · building / project type · impacted SF · state · team / captain / AE / crew.

Setup is **still editable** (spec sheet, wage **decision**, PLA, OCIP). Identity fields are not Setup/Proposal editors.

Browser Excel engine is source of truth. `PATCH` `baseBid` + `systems` + **`computed`**. Extra `computed` keys are **not stripped**. `POST /bids/:id/calculate` is a **no-op** unless `{ "forceServerCalc": true }`.

If the engine needs GSF, copy `process.impactedGsf` → `baseBid.gsfOfBuilding`.

**Wage decision** (Davis-Bacon #, `process.wageDecisionId`) ≠ **wage rate** (calculator scale, `baseBid.wageRateLabel`).

Our company: `Bids.ourEntityId` via `GET /lookups/our-entities`. Do not invent a bidding-companies table.

---

## Production (after awarded)

Green/red = **Connecteam actual hours** vs **hours earned from received material** — not vs Mike takeoff hours.

- List `/production` → `GET /production-reports` → `{ mergeMode, rows[] }` — **1 row per bid**, **no** hours/status on the list
- Detail → `GET /bids/:id/production-report` — hours live under **`totals`**, Connecteam under **`connecteam`**, files under **`mikeFilesMerged: { count, fileIds, fileNames }`**

Do not flatten the detail payload. Do not recompute `status`. Paint `totals.status`. Actual hours are **job-level**; do not split them across commodity rows.

Full contract: [FRONTEND_PRODUCTION_REPORT.md](./FRONTEND_PRODUCTION_REPORT.md).

---

## Explicitly later (do not build)

- CSV takeoff vs spec-sheet auto-fail
- Bond day-89 email
- Follow-Up CRM import (mechanical dropdowns are free text for now)
- Replacing Mike
- Handoff / due-date emails
- Production BOM pack / per-commodity actual-hour split
- Drawing sheet catalog (floor / area / date per Mike page)
- Planning jobs with no ITB / no drawings

---

## FE must not

- Chrome-less mini-apps for Specs or Production — they are **bid tabs**
- Second systems/areas/materials API
- Treat first outcome pick as final
- Compare production actuals to `hoursEstimatedMike`
- Recalculate Specs qty, PPH, or production status in the browser
- Use FortuneSheet for the spec sheet
- Create a second bid when another invitation arrives for the same drawings
- Let the clerk freely rename the bid off the invitation subject
- Show `budgetOnly` as its own checkbox (`bidKind: "budget"` instead)

Auth: `Authorization: Bearer <access_token>`. Percents are decimals (`0.25` = 25%).

**One line:** one bid, PDF stages, wrap don’t rebuild. Setup = dropdown spec **rules**. Takeoff = Mike + qty **grid**. Outcome **changeable**. Production = paint `totals.status` after award.
