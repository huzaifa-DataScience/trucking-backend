# Stage 1 — Intake + Assignment

**Give this file to FE** (with [FRONTEND_SPEC_SHEET.md](./FRONTEND_SPEC_SHEET.md) for Setup).  
**Last updated:** 2026-09-16  
**Source:** PJ + Amr (2026-08-20) + spec catch-up (2026-08-23) + PJ intake dry-run (2026-09). Locked pairs only.  
**Chrome / handoff:** [BIDDING_FRONTEND_API.md §0](./BIDDING_FRONTEND_API.md)  
**Enums:** `GET /lookups/bidding/process-meta` → `bidKinds`, `tierRoles`, `intakeEditor`

25 Aug extras: label **Engineer of Record — mechanical** (not “ME project”). Invitation **company first**, then contacts. Typeahead `GET /lookups/bidding/parties?role=&q=`. Activity = who / what / when.

9 Sep extras (PJ): **no `jobId` on intake** — link the job when awarded. Paste a full US address in `projectAddress.line1` — backend fills city/state/zip if those are empty (keeps `line1`). Preferred reach: `contact.preferredContact` `email` | `phone`. Paste the invitation email in `invitations[].inviteBody` (not `notes`). Mark `documentLinks[].checkAddenda` on the owner/federal source. Bid clerk (John) may complete **Assignment** so the queue does not sit. `intakeEditor` flags: `jobIdOnIntake`, `hideJobIdOnIntake`, `fillAddressFromLine1`, `preferredContact`, `inviteBody`, `checkAddenda`, `assignmentOwners`.

16 Sep extras (PJ review): **building type, project type, impacted GSF, company rule** on intake — not proposal. Proposal is **output + calculator**. `intakeEditor.constructionType` / `constructionSubtype` / `impactedGsf`. `process-meta.proposalEditor.isOutput`.

Incomplete **save** is OK. **Complete & Hand Off** from Intake is gated — read `workflow.canComplete` / `completeBlockedReason`. Bid clerk on Intake. Estimator is **not** on this page.

---

## Screens

| Stage | Who | Save | Hand off |
|-------|-----|------|----------|
| `intake` | Bid clerk (John) | `PATCH /bids/:id` `{ process }` | `POST /bids/:id/handoff` `{ "action": "complete" }` → Assignment |
| `assignment` | **Nick + PJ + bid clerk** | same | Complete → Setup. `assignment.pursue === false` → Outcome tab with `no_bid` |

New bid stays tiny (`estimateNumber`, `ourEntityId`). Then this form.

---

## Intake fields

| UI | Bind | PJ rule |
|----|------|---------|
| Bid / estimate # | header `estimateNumber` | Already on create |
| Bid name | header `bidName` **and** `process.drawingName` | **Locked to the drawing name.** If `drawingName` is set, header `bidName` is overwritten. Clerk cannot keep a nickname. |
| Address | `process.projectAddress` | Paste the full line in `line1` (Followup-style). On save, city/state/zip fill if empty. **Do not clear `line1`.** |
| Linked job | header `jobId` | **Skip on intake.** Hide the job picker. Set when awarded. |
| Due date / time | `process.dueDate`, `process.dueTime` | |
| Sticky Notes (whole bid) | **Comment thread** — [FRONTEND_BID_COMMENTS.md](./FRONTEND_BID_COMMENTS.md) | `GET`/`POST /bids/:id/comments`. Do **not** PATCH `process.notes`. Invite paste stays `invitations[].inviteBody`. |
| Invitation received | `process.invitations[].receivedAt` | Required when known. **Many vendors → many rows, one bid.** |
| Invitation company / person | `process.invitations[].contact` | **Company first**, then `contactName`. Typeahead: `GET /lookups/bidding/parties?role=invite_contact&q=`. |
| **Preferred contact** | `process.invitations[].contact.preferredContact` | **Dropdown — replace the old “Contact” field.** Options: `email` / `phone`. Next to it show `preferredContactValue` (that email or phone). Same on `owner` / `architect` / `mechanicalEngineer`. |
| Invitation email | `process.invitations[].inviteBody` | **Paste the full email / portal dump.** Cap 50k. `notes` stays clerk notes. |
| Inviter drawing links | `process.invitations[].links` | That inviter’s set. |
| Addenda from this inviter | `process.invitations[].addenda` | `{ number, receivedAt, attachmentIds, notes }` — which of the three sent addendum 2/3. |
| Who else is bidding? | `process.whoElseBidding` | If `invitations.length < 2`, `researched: true` is required to hand off. Call GC/architect/ME. **Do not ask the inviter.** |
| Owner / federal links | `process.documentLinks` | **More than one.** Public owner/federal set + extras. Mark `checkAddenda: true` on the source clerks should re-check for addenda. |
| Docs | `POST /bids/:id/attachments` `label=invitation\|drawings\|specifications\|addenda` | Put ids on `invitations[].attachmentIds`. |
| Bid type | `process.bidKind` | **Mandatory.** `built_to_print` / `design_build` / `design_assist` / `budget` / `unknown`. Labels in `process-meta.bidKindLabels`. |
| Budget | *(do not show a checkbox)* | Budget **is** `bidKind: "budget"`. `budgetOnly` is derived — hide it. |
| Related / rebid | `process.relatedBidId` | Click through to the prior bid. Same job coming back ≠ a new project. |
| Owner / architect / ME | `process.owner`, `.architect`, `.mechanicalEngineer` | From the title block. Typeahead: `GET /lookups/bidding/parties?role=owner\|architect\|mechanical&q=`. New names save on the bid; PATCH upserts the directory. |
| Owner or architect # | `process.ownerProjectNumber` | Title-block number. **Duplicate key.** |
| Engineer of Record — mechanical | `process.mechanicalEngineerProjectNumber` | Title-block number. **Not** “ME project”. **Duplicate key.** |
| Work type | `process.workType` | Insulation / demo / … — this is the locked “kind of work.” Do **not** invent Division. |
| Building type | `process.constructionType` | `GET /lookups/bidding/building-types` (Followup buckets). **Not on proposal.** |
| Project type | `process.constructionSubtype` | `GET /lookups/bidding/project-types`. **Not on proposal.** |
| Impacted SF | `process.impactedGsf` | Life-safety **renovated / impacted** area — not whole-building GSF. `$/SF` later. |
| Our company (first call) | header `ourEntityId` + `process.entityRule` | John picks from state/rules. `entityRule` only **suggests**. |
| Contract chain | `process.contractTiers` | Sketch ~5 layers now. See below. |
| GCs / mechanicals | `process.generalContractors`, `process.mechanicals` | Same opportunity. `hasTheJob` / `stillBidding` on each. |

`inviteContact` + `invitationReceivedAt` still exist. Backend mirrors `invitations[0]`. Prefer `invitations[]`.

Activity: `GET /bids/:id/activity` — show **who** (`userFirstName` + `userLastName`, else `userEmail`), **what** (`summary` + `changedFields`), **when** (`createdAt`). Not just “a change occurred”.

### Party directory

```
GET /lookups/bidding/parties?role=owner|architect|mechanical|invite_contact&q=&page=1&pageSize=10
```

Past owner / architect / mechanical / invite contacts (deduped). `q` matches name, company, email. Invalid / missing `role` → `{ items: [], total: 0, page, pageSize }`. Default `page=1`, `pageSize=10` (max 50). No `POST` — PATCH on the bid upserts. 404/error on FE → empty list + free text is still OK.

Response is **not** a bare array.

```json
{
  "items": [{
    "id": 12,
    "name": "WSP",
    "company": "WSP",
    "contactName": null,
    "email": "a@wsp.com",
    "phone": null,
    "role": "mechanical",
    "inactive": false,
    "doNotContact": false,
    "status": null
  }],
  "total": 1,
  "page": 1,
  "pageSize": 10
}
```

Address book modal: search `q`, table Name / Company / Email / Phone, row +, paginate with `page` / `pageSize`. If `inactive` / `doNotContact` → Name column `(Inactive)` / `(do not contact)`. Those flags are not stored yet — always `false`. Select fills the related intake fields.

---

## Duplicate — one opportunity

Typeahead **while typing** name or either project #:

```
GET /bids?search=Weinberg
GET /bids?ownerProjectNumber=C.480.19.1762
GET /bids?mechanicalEngineerProjectNumber=LW19-330-00
```

List rows include `drawingName`, `ownerProjectNumber`, `mechanicalEngineerProjectNumber`, `relatedBidId`, `bidKind`, `dueDate`.

If it is the same drawings: **open that bid** and **Add invitation**. Do **not** `POST /bids` again.

`POST /bids` now **409 `BID_DUPLICATE`** if estimate #, bid name (case-insensitive), or either project # already exists on an open/non-deleted bid. Body `details.existingBidId` — open that id. `huzaifa` and `Huzaifa` are the same name.

If a second bid was already created by mistake:

```
POST /bids/:duplicateId/link-duplicate
{ "keepBidId": 12, "notes": "same drawings" }
```

Invites + links move onto `keepBidId`. The duplicate is cancelled, archived, and `relatedBidId` points at the keeper.

`relatedBidId` on an open bid = older generation of the same job (budget → 100%, cancelled → rebid). Click opens that id.

Project numbers store **without `#`**. `#C.480` and `C.480` match.

---

## Bid type

| Value | When |
|-------|------|
| `built_to_print` | Drawings say 100% construction set |
| `design_build` | Often no / partial drawings |
| `design_assist` | In the invite |
| `budget` | They asked for budget pricing. Job will resurface — not “closed.” Mechanical may have to give quantities. |
| `unknown` | Not in the invite yet |

`other` is legacy only. Do not offer it on new forms.

**Handoff from Intake** (`workflow.canComplete`):

| Rule | When |
|------|------|
| `bidKind` required | Always. `other` / empty blocks. |
| Attachment `label=drawings` | Required for `built_to_print` and `design_assist`. Not required for `design_build` / `budget` / `unknown`. |
| `whoElseBidding.researched === true` | When there are fewer than **two** invitations. |

---

## Tiers (intake sketch)

Longest chain; skip unused rows. `process-meta.intakeEditor.sketchTiers` is the starter.

| sortOrder | role | Meaning |
|-----------|------|---------|
| 0 | `owner` | Who **owns the property** |
| 1 | `lessee` | Who **pays** if not the owner. Skip if owner pays. |
| 2 | `gc` or `cm` | Who they hired. Optional. |
| 3 | `mechanical` | Optional. Skip if GC/owner hired us. |
| 4 | `us` | Goel |

Roles: `GET /lookups/bidding/process-meta` → `tierRoles` (`owner`, `lessee`, `cm`, `gc`, `first_tier`, `mechanical`, `us`, `other`).

Per tier:

- `hasTheJob` — already awarded to them, or they are still bidding. **Unknown at invite — research.** Call GC / architect / ME. **Do not ask the person who invited us** who else is bidding.
- `invitedUs` — this layer asked us for the bid (the one immediately above us).
- `isPaying` — this layer is paying for the job (owner or lessee).

Bonds (`isBonded`, bond #) can wait for Awarded. Same array.

Insulation **can** be direct to owner — do not require a mechanical row.

---

## Assignment

Nick + PJ **and** the bid clerk (John). Queue must not sit if Nick/PJ are out. Handoff is not role-gated — whoever has the page can Complete.

| UI | Bind |
|----|------|
| Pursue? | `assignment.pursue` — `false` + Complete → Outcome `no_bid` |
| Captain | `assignment.captainUserId` ← `GET /lookups/bidding/captains` (`App_Users` `role=captain`). Team optional — **still show them**. Pick captain first; backend fills `assignment.teamId` when they have a crew |
| Team | `assignment.teamId` — filled from the captain’s crew. Still shown; changing the team fills captain if empty |
| AE / clerk | `assignment.assistantEstimator`, `bidClerk` — clerk copies from the team row; backend fills `bidClerk` when empty. AE picker: `GET /lookups/bidding/contacts?role=assistant_estimator` |
| Takeoff who | `takeoffAssignments` — 1 or 2 people per scope |

Then Complete → Estimating Setup.

`teamId: null` means they have not saved Settings → My team yet. **Still pickable.** Assignment saves `captainUserId`; `teamId` fills later when they have a crew. Do **not** hide the row. Do **not** require them to be currently logged in.

---

## Proposal is **not** this form

Later stage (`proposal`). **Output + calculator** (`process-meta.proposalEditor`).

**Do not re-ask here** (read-only): company, estimate #, bid name · building / project type · impacted SF · state · team / captain / AE / crew.

Calculator (first/mainly on Proposal): schedule/money, wage **rate**, lifts, parking, Mike grid. PLA / CCIP / MBE preference may also live on Setup — same flags, keep in sync. Do not move identity editors back onto Proposal.

---

## Save shape (intake)

```json
{
  "bidName": "Weinberg USP 800 Pharmacy",
  "process": {
    "drawingName": "Weinberg USP 800 Pharmacy",
    "ownerProjectNumber": "C.480.19.1762",
    "mechanicalEngineerProjectNumber": "LW19-330-00",
    "bidKind": "built_to_print",
    "dueDate": "2026-09-04",
    "dueTime": "14:00",
    "projectAddress": { "line1": "800 N Charles St, Baltimore, MD 21201", "city": null, "state": null, "zip": null },
    "owner": { "name": "Johns Hopkins", "email": "a@jhu.edu", "phone": "410-555-0100", "preferredContact": "email" },
    "architect": { "name": "Ford Keely" },
    "mechanicalEngineer": { "name": "WSP" },
    "relatedBidId": null,
    "documentLinks": [{ "url": "https://…", "label": "Owner set", "source": "owner", "checkAddenda": true }],
    "whoElseBidding": { "researched": true, "notes": "Called Clark — two other mechanicals" },
    "invitations": [{
      "receivedAt": "2026-08-20",
      "contact": { "name": "Pat", "email": "pat@mech.com", "phone": "301-555-0100", "preferredContact": "phone" },
      "links": [{ "url": "https://…", "label": "Invite set", "source": "inviter" }],
      "attachmentIds": [101],
      "addenda": [{ "number": "2", "receivedAt": "2026-08-22", "attachmentIds": [204], "notes": null }],
      "inviteBody": "Hi — please bid Weinberg USP 800…",
      "notes": null
    }],
    "contractTiers": [
      { "sortOrder": 0, "role": "owner", "company": "Johns Hopkins", "hasTheJob": true, "invitedUs": false, "isPaying": true },
      { "sortOrder": 1, "role": "gc", "company": "Clark", "hasTheJob": null, "invitedUs": false, "isPaying": false },
      { "sortOrder": 2, "role": "mechanical", "company": "Bowers", "hasTheJob": null, "invitedUs": true, "isPaying": false },
      { "sortOrder": 3, "role": "us", "company": "Goel", "hasTheJob": false, "invitedUs": false, "isPaying": false }
    ]
  }
}
```

Arrays **replace**. To add a second invitation, send the full `invitations` array.

---

## Do not

- Create a second bid for a second invitation
- Let the clerk freely rename the job (`drawingName` always wins)
- Show `budgetOnly` as its own control
- Fall back to a global size list (unrelated — spec sheet)
- Ask the inviter who else is bidding
- Build Division / Project type dropdowns (not locked — use `workType`)
- Hide unit on spec sheet when size/thick are blank (unrelated)
- Require / show linked job (`jobId`) on intake
- Put the pasted invitation email in `notes` — that field is clerk notes; use `inviteBody`

---

## Later (not this page)

Drawing sheet catalog (floor / area / date per `M101`). Planning jobs with no ITB. Engineer error history.
