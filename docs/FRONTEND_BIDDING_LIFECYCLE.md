# Bid lifecycle — `process` field dictionary

**Last updated:** 2026-08-23  
**UI (stages, handoff, award gate):** **[BIDDING_FRONTEND_API.md §0](./BIDDING_FRONTEND_API.md)** — that is the FE handoff. This file is **fields + API only**.  
**Stage 1 screen:** **[FRONTEND_INTAKE.md](./FRONTEND_INTAKE.md)**

**Related:** [BIDDING_FRONTEND_API.md](./BIDDING_FRONTEND_API.md) · [FRONTEND_INTAKE.md](./FRONTEND_INTAKE.md) · [BIDDING_BASEBID_FIELDS.md](./BIDDING_BASEBID_FIELDS.md) · [FRONTEND_BIDDING_SPECS.md](./FRONTEND_BIDDING_SPECS.md) · [FRONTEND_SPEC_SHEET.md](./FRONTEND_SPEC_SHEET.md)

---

## What this is

PDF workflow on **one** `Bids` row. No email inbox — **New bid** on the list. Invitation is an attachment (`label=invitation`).

`process` lives on `Bid_Content.ProcessJson`. List filters: `Bids.ProcessStage`, `Bids.OutcomeStatus`, `Bids.WorkType`.

**Stage ≠ outcome.**  
Pre stages: `intake` → `assignment` → `estimating_setup` → `takeoff` → `proposal` → `post_bid` → **`result` (Outcome tab)**.  
Outcome (`open` / `awarded` / `lost` / `no_bid` / `cancelled` / `postponed`) lives on that last Pre tab and **can be changed**. Post screens (`workflow.showAward` / `showLost`) follow the **current** value — they are not a one-shot lock.

`status` (draft / submitted / archived) still only locks Estimate math.

---

## Contract tier chain (why it exists)

The stack is **who we work for, all the way to the owner** — not “the mechanical we invoice.”

On a government job you cannot lien the building (sovereign). The GC must carry a **payment bond**. If we are unpaid, we have **90 days from the last day we had labor on site** to notice the bonding company.

So we store:

1. Every layer, top → us (`process.contractTiers`, `sortOrder` 0 = owner). `+ Add` layer. Extra fields: relationship, PM, superintendent, foreman.
2. Which layers are **bonded**, bond #, bonding company, who to notice.
3. Later: last labor date → `bond.claimDueDate` = last labor + **90** days. **No auto-email yet.**

HQ example (PJ on the call — 4th-tier sub):

| sortOrder | role | company | bonded? |
|-----------|------|---------|---------|
| 0 | `owner` | US Government | no |
| 1 | `cm` | US Army Corps of Engineers | no |
| 2 | `gc` | Clark Construction | **yes** |
| 3 | `first_tier` | Kogok Sheet Metal | **yes** |
| 4 | `mechanical` | Heritage Mechanical | no |
| 5 | `us` | Goel | no |

Sketch on **Intake** (roles + `hasTheJob` / `invitedUs` / `isPaying`). `lessee` = who pays if not the owner. Names/contacts/bonds confirm on Awarded. Starter rows: `process-meta.intakeEditor.sketchTiers`. HQ example: `hqExampleTiers`.

---

## Which stage owns which fields

Chrome: **[BIDDING_FRONTEND_API.md §0](./BIDDING_FRONTEND_API.md)**. Enums: `GET /lookups/bidding/process-meta`.

| Stage / screen | `process.stage` | Fields |
|----------------|-----------------|--------|
| Intake | `intake` | workType, bidKind, drawingName (= bid name), ownerProjectNumber, mechanicalEngineerProjectNumber, invitations, documentLinks, address, owner, architect, ME, contractTiers (sketch), GCs, mechanicals, relatedBidId, dueDate, dueTime. `budgetOnly` is derived from `bidKind=budget`. |
| Assignment | `assignment` | assignment.* (`teamId` + pursue/captain/AE/clerk), takeoffAssignments (people/due) |
| Estimating Setup | `estimating_setup` | construction type, mbePreference, entityRule, PLA, wageDecisionId, clearance, labor, OCIP, lifts, parking, schedule, insulationSpecs, **specSheets**, technicalReview |
| Takeoff | `takeoff` | Specs/Mike APIs + takeoffAssignments.versions |
| Proposal | `proposal` | existing `baseBid`; estimateReview, proposalVersions, amendments, submission |
| Post-Bid | `post_bid` | intelligence, stillBidding on GCs/mechanicals |
| Awarded (**gated**) | `result` after `POST .../outcome` | award.*, startup.*, contractTiers — **only if `workflow.showAward`** (`outcome = awarded`) |
| Lost (**gated**) | `result` after outcome | lost.* — **only if `workflow.showLost`** (lost / no_bid / cancelled / postponed) |

Handoff: `POST /bids/:id/handoff`. Setup → takeoff requires `technicalReview.approvedForTakeoff === true`. Assignment `pursue: false` + complete → `outcome = no_bid`.

---

## Reuse (do not duplicate)

| Already exists | Keep using |
|----------------|------------|
| Bid #, name, our company, job link, submit date, time estimate | Bid header |
| PLA, wage **scale**, lifts $, parking $, OCIP WC, citizen, team | `baseBid` |
| Client/GC name+address | `companyInfo` (one counterpart, not the full tier tree) |
| Spec PDFs / PLA / invitation | `POST /bids/:id/attachments` with `label` from `process-meta.attachmentLabels` |
| Spec sheet images | same attachments API, `label=spec-sheet-image` — [FRONTEND_SPEC_SHEET.md](./FRONTEND_SPEC_SHEET.md) |
| Mike CSV versions | existing Mike upload — **never throw out old files** |
| Specs grid (qty) | `GET /bids/:id/spec-lines` — Takeoff. Not the Setup spec **sheet** tables |
| Team / Duct1–Plumbing2 names | `GET /lookups/bidding/teams` |
| Owner / architect / ME / invite contact | `GET /lookups/bidding/parties?role=&q=&page=&pageSize=` `{ items, total, page, pageSize }` (PATCH on the bid upserts) |

**Wage decision ≠ wage rate.**  
`Bid_WageRates` = calculator scale.  
`Bid_WageDecisions` = Davis-Bacon / state / city **decision number**. Pick `process.wageDecisionId`.

**Our entity:** `Bids.ourEntityId` is the real pick. `process.entityRule` only **suggests**.

---

## API

```
GET    /lookups/bidding/process-meta
GET    /lookups/bidding/parties?role=&q=&page=&pageSize=
GET    /lookups/bidding/wage-decisions
POST   /lookups/bidding/wage-decisions
PATCH  /lookups/bidding/wage-decisions/:id
DELETE /lookups/bidding/wage-decisions/:id   (soft)

PATCH  /bids/:id          { process }
POST   /bids/:id/handoff  { action: "complete" | "return", notes? }
POST   /bids/:id/outcome  { outcome }
GET    /bids?processStage=&workType=&outcome=
```

`GET /bids/:id` returns `process` + `workflow` (gates + `takeoffComparisons`).

After PATCH, backend also sets:

- `entityRule.suggestedOurEntity` from the DC/MD rule
- `bond.claimDueDate` = `lastLaborDate + 90` when `governmentOwned === true`
- `lost.difference` = winning − our price when both present

Submitted bids: you **can** PATCH `process` (and upload attachments). You **cannot** PATCH `baseBid` / `systems` / `computed` / `companyInfo` until reopen to draft.

Outcome is **changeable**. Switching awarded → lost hides Post startup (`showAward`) and shows Lost (`showLost`); stored fields stay. FE must not treat the first pick as final.

Legacy `process.stage` values (`first_input`, `estimating`, `intelligence`, `awarded`, `production`) remap on read. `awarded` → `post_bid` + `outcome = awarded`.

---

## `process` shape (all optional except `stage` + `outcome`)

Use `GET /lookups/bidding/process-meta` rather than hardcoding. Summary of new/changed blocks:

```ts
{
  stage: "intake" | "assignment" | "estimating_setup" | "takeoff" | "proposal" | "post_bid" | "result",
  outcome: "open" | "awarded" | "lost" | "no_bid" | "cancelled" | "postponed",
  // intake
  invitationReceivedAt, inviteContact,   // mirrored from invitations[0]
  invitations: [{ receivedAt, contact, links, attachmentIds, addenda, notes }],
  whoElseBidding: { researched, notes },   // required to leave intake if < 2 invitations
  documentLinks: [{ url, label, source }],
  drawingName,   // architect name on drawings — writes header bidName
  ownerProjectNumber, mechanicalEngineerProjectNumber,
  projectAddress, bidKind,   // built_to_print | design_build | design_assist | budget | unknown
  budgetOnly,   // derived when bidKind=budget — hide in UI
  relatedBidId, relatedBidNote, dueDate, dueTime, owner, architect, mechanicalEngineer,
  generalContractors, mechanicals,   // hasTheJob + stillBidding on each party
  contractTiers,   // sketch on intake; hasTheJob, invitedUs, isPaying; bonds at award
  // assignment
  assignment: { pursue, priority, teamId, captain, assistantEstimator, bidClerk, internalEstimateDue, internalReviewDue },
  takeoffAssignments: [{
    role: "duct1"|"duct2"|"hydronic1"|"hydronic2"|"plumbing1"|"plumbing2"|"vrf"|"equipment"|"other",
    assigneeName, assignedAt, dueAt, status, hoursSpent, notes, finalQuantity, reviewedBy,
    versions: [{ version, createdBy, createdAt, reason, quantity, hoursSpent, csvAttachmentId, pdfAttachmentId }]
  }],
  // estimating setup
  constructionType, constructionSubtype, mbePreference, pla, wageDecisionId, clearance, entityRule,
  labor: { apprenticeship, certifiedPayroll, calculatedLaborRate },
  ocipCcip, buyAmerican, lifts, parking,
  schedule: { expectedStart, expectedDurationDays, expectedCompletion, salesTax, materialEscalation, liftPercent },
  insulationSpecs: { hydronic, plumbing, ductworkInsulation, piping, ductwork, equipment, other },
  specSheets: [{ id, kind, title, specNumber, rows, footerNote, imageAttachmentIds }],
  // kind: duct|hydronic|plumbing|equipment. row also: insulationFamily, sizeMode, ductShape, manufacturers*, accessories, specSection/Paragraph
  technicalReview: { preparedBy, reviewedBy, reviewDate, approvedForTakeoff, comments },
  // proposal
  estimateReview: { materialCost, laborCost, equipmentCost, subcontractCost, otherCosts, totalCost, margin, bidAmount,
                    scopeIncluded, scopeExcluded, alternates, qualifications, notes },
  proposalVersions: [{ version, amount, date, preparedBy, reviewedBy, reason, bestAndFinal, valueEngineering, scopeChange, attachmentId }],
  amendments: [{ number, date, attachmentId, drawingsChanged, specsChanged, phasingChanged, scopeChanged,
                 wageRateChanged, scheduleImpact, pricingImpact, requiresEstimateRevision, notes }],
  submission: { date, time, amount, submittedBy, mechanicalContractor, generalContractor, recipientContact, attachmentId },
  dateSubmitted, amountSubmitted, proposalIteration,
  // post-bid
  intelligence: { followUpOwner, nextFollowUpDate, expectedAwardDate, bafoRequested, revisedProposalRequired,
                  mechanicalUnableToGetPricing, customerFeedback, currentProjectStatus,
                  competitors: [{ name, amount, source, confidence, atBid }], notes },
  // awarded — gated
  award: { jobNumber, pm, me, ops, awardDate, finalContractAmount, primeContractor, mechanicalContractor, performingOurEntityId },
  startup: { formOfContract, contractPrice, laborBudget, materialBudget, equipmentBudget, bondCost, otherBudget,
             totalManhours, avgLaborRate, projectedStart, projectedCompletion, certifiedPayroll, taxExemption,
             travelParking, scheduleReceived, sovReceived, specialInstructions },
  contractTiers: [{ sortOrder, role, company, relationship, contactName, projectManager, superintendent, foreman,
                    email, phone, isBonded, bondNumber, bondingCompany, noticeTo,
                    hasTheJob, invitedUs, isPaying }],
  bond: { governmentOwned, lastLaborDate, billed100Percent, claimDueDate, notes },
  // lost — gated
  lost: { date, awardedMechanical, awardedInsulation, winningPrice, ourFinalPrice, difference, reason, notes,
          possibleRebid, relatedOpportunityId },
  breadcrumbs: [{ at, text }]
}
```

**Arrays replace** on PATCH. To add amendment #2, send the full `amendments` array.

**Attachment labels:** `invitation`, `drawings`, `specifications`, `addenda`, `pla`, `wage-decision`, spec labels, `proposal`, `amendment`, `takeoff-csv`, `takeoff-pdf`, `startup`, `spec-sheet-image`.

---

## Defaults (PDF “confirm before building”)

Until the business changes them, `process-meta.defaults`:

| Question | Default |
|----------|---------|
| Who assigns after intake? | Nick + PJ + bid clerk (`assignment.teamId` from `GET /lookups/bidding/teams`) |
| Intake mandatory to hand off | Header `estimateNumber` + `ourEntityId` only; rest incomplete OK |
| Specs / technical review / takeoff assign | Captain |
| Proposal approval | Estimating review |
| Post-bid owner | `intelligence.followUpOwner` |
| Award convert | **Outcome first**, then Awarded screen (not automatic) |
| Lock completed stages? | No — activity log is the history |
| Handoff emails | Not now |

---

## Explicitly later

- Day-89 bond notice email  
- Follow Up CRM import for mechanical dropdowns (free text for now)  
- Replacing Mike  
- Production BOM pack  
- Automatic handoff / due-date notifications  

---

## Migrate

```bash
npm run bidding-migrate-process
```

Adds/remaps `Bids.ProcessStage`, `Bids.OutcomeStatus`, `Bids.WorkType`, `Bid_Content.ProcessJson`, table `Bid_WageDecisions`.
