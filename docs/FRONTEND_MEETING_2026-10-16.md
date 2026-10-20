# 16 Oct 2026 — FE handoff

**Give this file to FE.** One meeting. Backend in the first half is already on this API. The second half is still a screen change.

Deploy this API before testing the address book. An older server that still queries `role=gc` as its own list will return no rows.

---

## 1. One address book for GC and mechanical

`GET /lookups/bidding/parties?role=gc&q=&page=1&pageSize=10`  
`GET /lookups/bidding/parties?role=mechanical_contractor&q=`

Both read the same `invite_contact` list. Owner, architect, mechanical engineer, and insulation stay their own roles.

Search matches name, company, contact name, and email. `pageSize` max is 50, default 10.

```json
{
  "items": [
    {
      "id": 1,
      "name": "Brian Chamberlain",
      "company": "Denver-Elek, Inc.",
      "contactName": "Brian Chamberlain",
      "email": "bchamberlain@denver-elek.com",
      "phone": "(443) 505-6102",
      "role": "invite_contact"
    }
  ],
  "total": 1,
  "page": 1,
  "pageSize": 10
}
```

On pick, write four fields and leave them separate:

| Form field | From |
|------------|------|
| Company | `company` |
| Contact | `contactName`, else `name` |
| Email | `email` |
| Phone | `phone` |

Do not copy the person name into the company box. Title in the book is the contact. Subtitle is `company` and `email`.

---

## 2. CSV upload

`POST /bids/:id/attachments` accepts `text/csv`, `application/csv`, and a file whose name ends in `.csv`. JPEG, PNG, WebP, PDF, Word, and ZIP are unchanged. Field name is still `file`.

---

## 3. Drawing set name

`drawingCategory` on upload and on `PATCH /bids/:id/attachments/:attachmentId` is any label, 1–40 characters.

`sd`, `dd`, `cd`, `ifb`, `ifp`, `ifc`, `ifr` still work. `50% DD` is valid. Blank clears it. Longer than 40, or a control character, returns 400: `drawingCategory must be 1–40 characters`.

The bid-level `process.drawingCategory` is still the built-in enum. Only the attachment label is free text.

---

## 4. Estimator due dates

When `assignment.internalEstimateDue` is saved, the API copies that date onto each `takeoffAssignments[].dueAt` that is empty or still equal to the previous internal due.

A `dueAt` the user set to a different day is left alone. The screen can keep showing both dates. It does not need to copy them itself.

---

## 5. Due reminder email

No screen change. Weekdays at 8:15am New York, the API emails the takeoff person when `dueAt` is 5, 4, or 3 days away. One mail per person per bid. The person must have a login email.

---

## 6. Bidding clients on the estimates list

Each item from `GET /bids` and `GET /bids/:id` includes:

```json
"biddingClients": ["Denver-Elek, Inc.", "Brian Chamberlain", "Panacea", "Kody Klugh"]
```

Unique company and contact from `process.invitations`, `process.generalContractors`, and `process.mechanicals`.

Filter (exact company or person):

`GET /bids?biddingClient=Denver-Elek,%20Inc.`  
`GET /bids/export?biddingClient=Denver-Elek,%20Inc.`

`clientCompanyName` is unchanged. It still filters `companyInfo.companyName`.

---

## Screens still to build

### Bidding clients (was “Contract chain”)

Rename the heading to **Bidding clients**. Show invitation contacts plus `generalContractors` and `mechanicals` in that section. Search both from the one list in section 1.

Do not copy invitations into `contractTiers`. Tiers stay the owner / GC / mechanical layers.

### Folder upload

Add a folder button (`webkitdirectory` on the file input). The API already stores the relative path, for example `Drawings/A1.pdf`, on `fileName`. Multiple files are already accepted.

### Drawing tabs

Hide phases that have no files. Let the user add and rename a set. Save that name as the attachment `drawingCategory` (max 40). Built-in `sd` / `dd` / `cd` tabs stay.

### Mike CSV

`POST /bids/:id/mike-files` does not require `jobId`. Stop blocking upload on `GET /lookups/jobs`. Send `jobId` only when the user picked a won job. `jobNumberHint` can still be sent from the file header.

The comparison panel stays the server rows: scope, A, B, diff, var, final, status. Lay that out like their recap spreadsheet. The API does not parse the recap into that layout until a sample Mike file is provided.

Refrigerant piping showing under plumbing also waits on that sample file.

### Post-bid

List every saved `generalContractors` and `mechanicals` row (company, contact, email, phone). Add a mailto that includes the address and a subject. Those fields are already on the bid.

### Estimates list and dashboard

Add a bidding-client filter bound to `biddingClient` / `biddingClients`.

The captain multi-select already works from the top filter. The dashboard is still one shared list with a Team column. A per-team dashboard is a layout change.

Auto-selecting the logged-in captain on the list is a screen default. The API sets `captainUserId` only when the person creating the bid has the captain role.

### @mention

The mention list is users who have logins. An estimator without an account will not appear.

---

## Not in this pass

Goel mailbox mirror, full calendar sync, Bluebeam, and O-drive sync are waiting on access. Togal moving a project into the captain’s folder is already in the API. If a project stays in the wrong folder, send the bid id.
