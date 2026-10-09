# Estimating and proposal — FE development guide

7 Oct meeting (Mike, Rhal, John, Gino) plus the printed proposal. Backend for both is done. This is the screen work.

The full drawing set stays on the bid. Togal is only the markup tool. This sheet replaces Proposify: no Proposify login, API key, or “send via Proposify” button.

---

## Estimates list

Hide **Current progress**, **Outcome**, **Record**, and **Turn in**.

Rename the **Estimate #** header to **Project #**. The value is still `estimateNumber` (the IDC / IMD number). Search by that number or by name already works.

---

## Files

Show `fileName`, not the label `drawings`. A zip of drawings, specs, or addenda is unpacked on the server. Each file inside keeps its folder path, for example `Mechanical/M-101.pdf`.

`POST /bids/:id/attachments`

- One file: field `file`. Response is the attachment plus `togal`, same as before.
- A folder: field `files` (many). Set each file’s name to its relative path. Same `label` on the request (`drawings`, `specifications`, or `addenda`).
- One contractor zip: field `file`, same labels. The server unpacks it.

More than one saved file comes back as `{ "attachments": [ ... ], "togal": { "sent", "message" } }`.

On the list, group by the folder in `fileName`. **Drawings** shows `label=drawings` that were uploaded on Intake, so the team does not go back to Intake to find them. **Specs / manuals** shows `label=specifications`. Preview and download use the existing download path.

VRF and equipment slots stay empty until the captain fills them. Do not require them when John or Nick is on Assignment.

---

## Mechanical contractors

On Intake, a summary table of `process.mechanicals` (and GCs the same way): company, contact, email, `bidPrice`. Each contractor can have a different price. That price is the current one. Do not add a column for an older DD / CD price.

The number on the invitation control is how many invitations were added. It is not the contractor count. The table is the contractor list.

Company search still uses the existing contact lookup. If a name is missing, the contact row is incomplete. Send that name; do not add a second company list.

---

## Assignment

Show the technical review on Assignment as well as Handoff: `technicalReview.preparedBy`, `reviewedBy`, `reviewDate`, `approvedForTakeoff`, `comments`. Nick or PJ reviews before they assign. Same fields. Saving is the same process PATCH.

---

## Internal bid list

Per scope, `takeoffAssignments[].status` is `done` or `none` (no scope). `completed` stays as it is. Rhal marks these here instead of a separate email sheet.

A bell when takeoff comes back is the existing notification area. No new email.

---

## Proposal sheet

Stay on the Proposal tab of `/bidding/:id`. No new page.

Live contract: `GET /lookups/bidding/process-meta` → `proposalEditor`.  
The sheet is `process.proposalSheet` on the bid. Save it with the existing `PATCH /bids/:id` body `{ "process": { "proposalSheet": { ... } } }`.

### What the team decides

| Choice | Where |
|--------|--------|
| Show quantities on this copy, or only the lump prices | `copies[].showQuantities` |
| This recipient’s price | `copies[].prices` and `copies[].alternatePrices`. Leave a price null to use the sheet price. |
| Extra notes for this job | `specialNotes` (editable, max 8,000 characters) |

Do not apply a fixed markup such as +20%. The team types the number.

### Pages to render

Use the bid’s our-entity for the letterhead. Print the MBE / NAICS page only for DCB (`proposalEditor.sheet.certPage`).

1. **Cover.** Read-only: estimate number, bid name, our company, estimator. Editable cover lines are on the sheet: `revision`, `proposalDate`, `drawings`, `specifications`, `wageScale`, `addenda`, `mechanicalDesigner`.
2. **Breakdown.** One row per `proposalEditor.sheet.buckets`. Systems text, optional quantity, price. Then the lump total. Then alternates, labeled not in the price above.
3. **Boilerplate.** Always print `proposalEditor.sheet.boilerplate`. Do not store those four lines.
4. **Special notes.** `specialNotes`, only when the team wrote something.
5. **Exception report.** Every row in `proposalEditor.sheet.exceptions`. `included: true` marks Included. `false` marks Not Included. `null` is still blank.

Footer on the inner pages: bid name, recipient company, page number.

### Sheet

`lines` always has these buckets, in this order: `ductwork`, `hvac_piping`, `plumbing`, `hvac_equipment`, `plumbing_equipment`.

```json
{
  "revision": "0",
  "proposalDate": "2026-09-28",
  "drawings": "CORE & SHELL ISSUE FOR PERMIT 5/28/26",
  "specifications": "ON THE PLANS",
  "wageScale": "NONE",
  "addenda": "NONE",
  "mechanicalDesigner": "DLB ASSOC.",
  "specialNotes": null,
  "lines": [
    { "bucket": "ductwork", "systems": "Supply Air, Return Air, Outside Air.", "quantity": "1200 SF", "price": 78000 }
  ],
  "alternates": [
    { "description": "Hard round runouts", "quantity": null, "price": 31800 }
  ],
  "exceptions": [
    { "key": "sound_lagging", "included": false }
  ],
  "copies": []
}
```

A PATCH that sends `lines` replaces that array. Sending one bucket is enough: the server puts the other buckets back empty. Unknown buckets and unknown exception keys are dropped. `exceptions` you omit stay unmarked (`included: null`).

### Copies

One copy is one company the proposal goes to.

```json
{
  "id": "clark",
  "toName": "George Rizk",
  "toCompany": "Clark Construction",
  "toEmail": "george.rizk@clarkconstruction.com",
  "toPhone": null,
  "toAddress": "145 West Ostend Street, Baltimore, MD",
  "showQuantities": false,
  "prices": { "ductwork": 50100 },
  "alternatePrices": [null]
}
```

`alternatePrices[i]` matches `alternates[i]`. Null uses that alternate’s own price.

Printed bucket price: `copies[].prices[bucket]` when it is a number, otherwise `lines[].price`.  
Lump total: sum of those five bucket prices. Alternates are not in the total.

`showQuantities` is null until the team chooses. Hide the quantity column unless it is `true`. Still save `lines[].quantity` on the sheet.

Add a copy with a new `id`. Sending `copies` replaces the whole list, same as other process arrays.

### Save

`PATCH /bids/:id`

```json
{ "process": { "proposalSheet": { "specialNotes": "No equipment.", "copies": [] } } }
```

Same `canEdit` / `403 BID_TEAM_LOCKED` as any other process edit. Toast `message`. Do not leave the bid.
