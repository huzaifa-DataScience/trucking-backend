# 21 Oct 2026 — FE handoff

**Give this file to FE.** Backend items below are already on this API. The screens are still yours.

---

## Already on the API

### Recap upload

`POST /bids/:id/attachments` accepts CSV and Excel (`.csv`, `.xls`, `.xlsx`), including when the browser sends the file as `application/vnd.ms-excel`. JPEG, PNG, WebP, PDF, Word, and ZIP are unchanged.

The comparison rows are still scope, A, B, diff, var, final, status. The API stores the recap. It does not turn the spreadsheet into that grid.

### One contact list

`GET /lookups/bidding/parties?role=gc` and `role=mechanical_contractor` both read `invite_contact`. Each item’s `role` is the role you asked for (`gc` or `mechanical_contractor`), so a filter on that field still matches.

Rows with no email and no phone are left out. Inactive rows are left out.

Add or correct a contact:

`POST /lookups/bidding/parties`

```json
{ "company": "R&R Mechanical LLC", "contactName": "Devon Price", "email": "dprice@example.com", "phone": "(202) 555-0100" }
```

Company or contact name is required. Email or phone is required.

`PATCH /lookups/bidding/parties/:id` with the same fields. `"inactive": true` hides the person from search.

### Bidding clients table

Each bid on `GET /bids` and `GET /bids/:id` includes `biddingClientRows`:

```json
[
  {
    "kind": "mechanical",
    "company": "R&R Mechanical LLC",
    "contactName": "Devon Price",
    "email": "dprice@example.com",
    "phone": "(202) 555-0100",
    "baseBid": 125000
  }
]
```

`kind` is `gc`, `mechanical`, or `invitation`. `baseBid` is that contractor’s `bidPrice`. `biddingClients` (the name list) is unchanged.

### Project status

The list item already has `boardStatus`: `not_started`, `bidding`, `bid_submitted`, `won`, `lost`, `no_bid`, `on_hold`, `cancelled`. Labels: Not Started, Bidding, Bid Submitted, Won, Lost, No Bid, On Hold, Cancelled. `processStage` and `outcomeStatus` are unchanged.

---

## Screens to build

- **Estimates list.** Add a Status column bound to `boardStatus`. On the open bid, show the same label at the top.
- **Intake.** Keep General contractors and Mechanical contractors. Remove the extra invitation / mechanical blocks that repeat the same company. When the company changes, replace contact, email, and phone from the selected person. Do not leave the previous contact in the box.
- **Bidding clients.** Render `biddingClientRows` as the table: type, company, contact, email, phone, base bid. A GC or mechanical saved on the bid is already a row. Do not make the user add that company a second time.
- **Contractors.** One screen to add and edit a company contact (`POST` / `PATCH` above). Mark inactive people with `inactive: true`. A person with no email and no phone is not in search; add them here when they write in.
- **Takeoff comparison.** Recap files can be uploaded now. Lay the two files out in the comparison panel. The server grid is still quantity A against quantity B.

---

## Not in this pass

Togal and Bluebeam are still waiting on PJ. Gino’s second estimates filter was not clear on the call; wait for the note he sends in chat before changing how the date, captain, and work-type filters combine.
