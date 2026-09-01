# Stage 1 — Intake + Assignment

**Give this file to FE** (with [FRONTEND_SPEC_SHEET.md](./FRONTEND_SPEC_SHEET.md) for Setup).  
**Last updated:** 2026-08-25  
**Source:** PJ + Amr (2026-08-20) + spec catch-up (2026-08-23). Locked pairs only.  
**Chrome / handoff:** [BIDDING_FRONTEND_API.md §0](./BIDDING_FRONTEND_API.md)  
**Enums:** `GET /lookups/bidding/process-meta` → `bidKinds`, `tierRoles`, `intakeEditor`

25 Aug extras: label **Engineer of Record — mechanical** (not “ME project”). Invitation **company first**, then contacts. Typeahead `GET /lookups/bidding/parties?role=&q=`. Activity = who / what / when.

Incomplete **save** is OK. **Complete & Hand Off** from Intake is gated — read `workflow.canComplete` / `completeBlockedReason`. Bid clerk on Intake. Estimator is **not** on this page.

---

## Screens

| Stage | Who | Save | Hand off |
|-------|-----|------|----------|
| `intake` | Bid clerk (John) | `PATCH /bids/:id` `{ process }` | `POST /bids/:id/handoff` `{ "action": "complete" }` → Assignment |
| `assignment` | **Nick + PJ** | same | Complete → Setup. `assignment.pursue === false` → Outcome tab with `no_bid` |

New bid stays tiny (`estimateNumber`, `ourEntityId`). Then this form.

---

## Intake fields

| UI | Bind | PJ rule |
|----|------|---------|
| Bid / estimate # | header `estimateNumber` | Already on create |
| Bid name | header `bidName` **and** `process.drawingName` | **Locked to the drawing name.** If `drawingName` is set, header `bidName` is overwritten. Clerk cannot keep a nickname. |
| Address | `process.projectAddress` | From drawings. City + state when known. |
| Due date / time | `process.dueDate`, `process.dueTime` | |
| Invitation received | `process.invitations[].receivedAt` | Required when known. **Many vendors → many rows, one bid.** |
| Invitation contact | `process.invitations[].contact` | **Company first**, then that company's people. Email/phone fill from the pick. Typeahead: `GET /lookups/bidding/parties?role=invite_contact&q=`. |
| Inviter drawing links | `process.invitations[].links` | That inviter’s set. |
| Addenda from this inviter | `process.invitations[].addenda` | `{ number, receivedAt, attachmentIds, notes }` — which of the three sent addendum 2/3. |
| Who else is bidding? | `process.whoElseBidding` | If `invitations.length < 2`, `researched: true` is required to hand off. Call GC/architect/ME. **Do not ask the inviter.** |
| Owner / federal links | `process.documentLinks` | **More than one.** Public owner/federal set + extras. |
| Docs | `POST /bids/:id/attachments` `label=invitation\|drawings\|specifications\|addenda` | Put ids on `invitations[].attachmentIds`. |
| Bid type | `process.bidKind` | **Mandatory.** `built_to_print` / `design_build` / `design_assist` / `budget` / `unknown`. Labels in `process-meta.bidKindLabels`. |
| Budget | *(do not show a checkbox)* | Budget **is** `bidKind: "budget"`. `budgetOnly` is derived — hide it. |
| Related / rebid | `process.relatedBidId` | Click through to the prior bid. Same job coming back ≠ a new project. |
| Owner / architect / ME | `process.owner`, `.architect`, `.mechanicalEngineer` | From the title block. Typeahead: `GET /lookups/bidding/parties?role=owner\|architect\|mechanical&q=`. New names save on the bid; PATCH upserts the directory. |
| Owner or architect # | `process.ownerProjectNumber` | Title-block number. **Duplicate key.** |
| Engineer of Record — mechanical | `process.mechanicalEngineerProjectNumber` | Title-block number. **Not** “ME project”. **Duplicate key.** |
| Work type | `process.workType` | Insulation / demo / … — this is the locked “kind of work.” Do **not** invent Division / Project type. |
| Contract chain | `process.contractTiers` | Sketch ~5 layers now. See below. |
| GCs / mechanicals | `process.generalContractors`, `process.mechanicals` | Same opportunity. `hasTheJob` / `stillBidding` on each. |

`inviteContact` + `invitationReceivedAt` still exist. Backend mirrors `invitations[0]`. Prefer `invitations[]`.

Activity: `GET /bids/:id/activity` — show **who** (`userEmail`), **what** (`summary` + `changedFields`), **when** (`createdAt`). Not just “a change occurred”.

### Party directory

```
GET /lookups/bidding/parties?role=owner|architect|mechanical|invite_contact&q=
```

Past owner / architect / mechanical / invite contacts (deduped). `q` matches name, company, email. Invalid / missing `role` → `[]`. No `POST` — PATCH on the bid upserts. 404/error on FE → empty list + free text is still OK.

```json
[{ "id": 12, "name": "WSP", "company": "WSP", "contactName": null, "email": "a@wsp.com", "phone": null, "role": "mechanical" }]
```

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

Nick + PJ (not the clerk).

| UI | Bind |
|----|------|
| Pursue? | `assignment.pursue` — `false` + Complete → Outcome `no_bid` |
| Team | `assignment.teamId` ← `GET /lookups/bidding/teams` (team 1 / 2 / 3 today) |
| Captain / AE / clerk | `assignment.captain`, `assistantEstimator`, `bidClerk` — copy from the team row after pick |
| Takeoff who | `takeoffAssignments` — 1 or 2 people per scope |

Then Complete → Estimating Setup.

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
    "projectAddress": { "line1": "…", "city": "Baltimore", "state": "MD", "zip": null },
    "owner": { "name": "Johns Hopkins" },
    "architect": { "name": "Ford Keely" },
    "mechanicalEngineer": { "name": "WSP" },
    "relatedBidId": null,
    "documentLinks": [{ "url": "https://…", "label": "Owner set", "source": "owner" }],
    "whoElseBidding": { "researched": true, "notes": "Called Clark — two other mechanicals" },
    "invitations": [{
      "receivedAt": "2026-08-20",
      "contact": { "name": "Pat", "email": "pat@mech.com", "phone": null },
      "links": [{ "url": "https://…", "label": "Invite set", "source": "inviter" }],
      "attachmentIds": [101],
      "addenda": [{ "number": "2", "receivedAt": "2026-08-22", "attachmentIds": [204], "notes": null }],
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

---

## Later (not this page)

Drawing sheet catalog (floor / area / date per `M101`). Planning jobs with no ITB. Engineer error history.
