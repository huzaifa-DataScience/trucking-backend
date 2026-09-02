# Bidding frontend — context for the FE agent

**Who:** Frontend (human or AI). Read this **before** any other bidding doc.  
**Last updated:** 2026-08-25  
**Backend:** live NestJS. JWT on every call.

You are building the **bidding UI**. Backend already computes Specs, production hours, and workflow gates. **Do not rebuild those engines.** Wrap existing screens in the PDF stage chrome. Incomplete save is allowed.

**Hand FE these two files:** [FRONTEND_SPEC_SHEET.md](./FRONTEND_SPEC_SHEET.md) (Setup cascade — 25 Aug) and [FRONTEND_INTAKE.md](./FRONTEND_INTAKE.md) (Stage 1).

Repo of truth is this backend `docs/` folder — not an old chat, not FortuneSheet screenshots.

---

## Read in this order

1. [FRONTEND_AUTH.md](./FRONTEND_AUTH.md) — JWT on every call
2. [BIDDING_FRONTEND_API.md](./BIDDING_FRONTEND_API.md) **§0 first** — app shell, stages, handoff, outcome. This is the IA. Do not invent a second navigation.
3. [FRONTEND_BIDDING_LIFECYCLE.md](./FRONTEND_BIDDING_LIFECYCLE.md) — `process` field dictionary only (not a second UI spec)
4. Then the screen you are coding:
   - **Intake + Assignment (Stage 1):** [FRONTEND_INTAKE.md](./FRONTEND_INTAKE.md)
   - Setup spec **rules:** [FRONTEND_SPEC_SHEET.md](./FRONTEND_SPEC_SHEET.md)
   - Takeoff qty grid / Mike: [FRONTEND_BIDDING_SPECS.md](./FRONTEND_BIDDING_SPECS.md) + [FRONTEND_MIKE_RULES.md](./FRONTEND_MIKE_RULES.md)
   - After award hours: [FRONTEND_PRODUCTION_REPORT.md](./FRONTEND_PRODUCTION_REPORT.md)
   - Excel cell names for Estimate: [BIDDING_BASEBID_FIELDS.md](./BIDDING_BASEBID_FIELDS.md) (client engine; `/calculate` is deprecated)

Enums: `GET /lookups/bidding/process-meta`. Do not hardcode stage lists.

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

**Stage 1 (Intake + Assignment):** bid name **locked** to `drawingName`. Two project #s (`#` stripped). `bidKind` includes `budget`. Second invitation → `invitations[]` (plus `addenda` per inviter). One invite → `whoElseBidding.researched` required to hand off. Drawings attachment required for build-to-print / design-assist. Mistake second bid: `POST /bids/:id/link-duplicate`. Typeahead `GET /bids?search=&ownerProjectNumber=&mechanicalEngineerProjectNumber=`. Tiers on intake. Assignment: Nick + PJ, `assignment.teamId`. Party typeahead: `GET /lookups/bidding/parties?role=&q=`. Full contract: [FRONTEND_INTAKE.md](./FRONTEND_INTAKE.md).

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

## Estimate (Proposal) — client Excel engine

Browser Excel engine is source of truth. `PATCH` `baseBid` + `systems` + **`computed`**. Extra `computed` keys are **not stripped**. `POST /bids/:id/calculate` is a **no-op** unless `{ "forceServerCalc": true }`.

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
