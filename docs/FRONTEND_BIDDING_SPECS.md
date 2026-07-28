# Bidding Specs — Frontend Handoff (complete)

**Who this is for:** Frontend engineers. Assume **no** prior knowledge of Excel Specs, Mike, or Trimble.  
**Status:** Backend is **live** (JWT).  
**Last updated:** 2026-07-22  

**Related**

| Doc | Use for |
|-----|---------|
| [FRONTEND_AUTH.md](./FRONTEND_AUTH.md) | Login + Bearer token |
| [BIDDING_FRONTEND_API.md](./BIDDING_FRONTEND_API.md) | Bid create/list/Base Bid (not Specs math) |
| [frontend-trimble-api.md](./frontend-trimble-api.md) | Optional Trimble project browser (not required for Specs happy path) |

**API host:** same as the rest of the dashboard (e.g. `http://localhost:3005`).  
**Auth on every Specs call:**

```http
Authorization: Bearer <access_token>
Content-Type: application/json
```

---

## 1. What is “Specs”? (read this first)

Estimators used an Excel workbook tab called **Specs Plumb**. That tab answers:

> For each pipe size × insulation type: how much do we **estimate**, how much already **received** on the job, how much **remains**, and which **catalog item / unit price** should we use?

We are building that **same screen on the website**, inside an existing bid:

```text
/bidding/[id]/specs
```

Add a wizard step named **Specs** on the bid (next to Base Bid / Labor / etc.).

### What Specs is NOT

- Not the Base Bid calculator / proposal PDF  
- Not a global admin page (except optional catalog price tools)  
- Not something you calculate in the browser — **backend returns the numbers**

### Glossary (use these words in the UI)

| Term | Meaning |
|------|---------|
| **Bid** | One estimate (`/bids/:id`). Specs data is stored **per bid**. |
| **Mike file** | Takeoff export (CSV/XLSX) from the takeoff tool. Contains many rows: system, size, thickness, quantity, hours, material text. |
| **Mike rows** | Those rows stored on the bid after upload (`POST .../mike-rows`). |
| **Spec line** | One row on the Specs grid (like one Excel Specs Plumb row). |
| **Qty Estimated** | Sum of Mike quantities for that size × thickness × material. |
| **Qty Received** | Sum of material already received on the job (from Trimble/StructShare line items). |
| **Qty Remain** | `Estimated − Received`. |
| **Trimble / StructShare project** | Job materials system. Our SQL already mirrors projects + line items. Used only for **Received**. |
| **trimbleProjectId** | Numeric StructShare project id on the bid. **Auto-filled from the bid’s job** when possible. |
| **Insulation** | Material phrase on the Spec line (e.g. `Fiberglass with ASJ`). Drives Mike match + catalog keyword. |
| **Structshare Item** | Cheapest matching catalog product name + unit price for that size/thick/keyword. |
| **Lookups** | Dropdown master lists (systems, materials, areas) from `GET /lookups/bidding/...`. |

---

## 2. Where the numbers come from (3 sources)

```
┌─────────────────┐
│  Mike file      │──► Qty Estimated, Production/Hour, auto Spec lines
└─────────────────┘

┌─────────────────┐
│  Trimble SQL    │──► Qty Received  (via bid.trimbleProjectId)
│  (auto from job)│
└─────────────────┘

┌─────────────────┐
│  Item catalog   │──► Structshare Item name + unit price
│  + lookups      │──► dropdown options (System / Insulation / Area)
└─────────────────┘
```

**Frontend never:**

- Sums Mike rows for estimated qty  
- Parses Trimble item names for received  
- Picks MIN catalog price with custom logic  

**Frontend only:** upload Mike → call APIs → render response → let user edit dropdown fields → PATCH → re-render response.

---

## 3. Product flow you must build (DEFAULT)

User’s job is basically: **upload Mike**. Everything else is automatic or optional edit.

```
Open bid → Specs step
    │
    ├─► Trimble / Job link
    │     Prefer: Mike metadata auto-links jobId (see §6)
    │     Else: ask user to set Job on the bid
    │     Then backend matches JobNumber → Trimble (Recv)
    │
    ├─► PRIMARY BUTTON: [ Upload Mike file ]
    │     1) Parse file → { rows, meta: { jobNumberHint, projectLabel } }
    │     2) POST /bids/:id/mike-rows   { rows, jobNumberHint, projectLabel }
    │     3) Read jobLink from response — toast / prompt Job if not_found|no_hint
    │     4) POST /bids/:id/spec-lines/auto-from-mike   { replace: true }
    │     5) Show returned lines (or GET /bids/:id/spec-lines)
    │     One spinner: "Building Specs…"
    │
    └─► RESULT = Specs grid (this is the Specs “report”)
          User may edit cells via DROPDOWNS (see §5)
          Each edit → PATCH line → replace that row from response
```

### Secondary actions (not the happy path)

| Action | When |
|--------|------|
| **Regenerate Specs** | Mike already uploaded; rebuild lines (`auto-from-mike` + confirm replace) |
| **+ Add line** | Manual extra row |
| **Delete line** | Confirm |
| **Re-upload Mike** | Confirm replace of Mike + regenerate |
| **Edit catalog price** | Optional; then refetch Spec lines |

---

## 4. Screen layout

```
┌──────────────────────────────────────────────────────────────────┐
│ Bid shell (existing): estimate #, name, status, wizard steps     │
├──────────────────────────────────────────────────────────────────┤
│ SETUP STRIP                                                      │
│  Materials: Linked · project 42524     (or warning if not)       │
│  Mike: 151 rows imported                                         │
│  [ Upload Mike file ]   [ Regenerate Specs ]   [ + Add line ]    │
├──────────────────────────────────────────────────────────────────┤
│ SPECS GRID (main area — Excel-like table)                        │
│  Editable columns use dropdowns from lookups                     │
│  Qty / codes / Structshare are read-only                         │
└──────────────────────────────────────────────────────────────────┘
```

**Empty state (before first Mike upload):**

> Upload a Mike takeoff file to build the Specs sheet.

Do not push users to hand-build every line.

---

## 5. Grid columns — editable vs read-only

Excel Specs Plumb used **dropdowns from master lists**. Do the same on the website: users change values **from available data**, not random free text (except notes).

### 5.1 Editable (user can change — use combobox / select)

| UI column | Field name | Options source | Notes |
|-----------|------------|----------------|-------|
| Type | `type` | `Plumbing`, `HVAC`, `Duct` | Simple fixed list |
| System | `systemName` | `GET /lookups/bidding/spec-systems` → `systemName` | Required |
| Area | `areaName` | `GET /lookups/bidding/spec-areas` → `areaName` | Often `All` |
| Insulation | `insulation` | `GET /lookups/bidding/spec-materials` → `description` | Must match list or qty/structshare break |
| Size | `size` | number (optional size list later) | Required |
| Thickness | `thickness` | number | Required |
| Weight | `weight` | optional string / size-like list | Duct |
| Facing | `facing` | `GET /lookups/bidding/spec-facings` → `value` / `label` | Combobox; allow empty (clear). Do **not** show the word “Facing” as the cell value — that is placeholder only |
| Jacket / Layers / Notes | `addJacket`, `layers`, `extraNotes` | free text OK | Optional |

**On change:** debounce ~500ms →

```http
PATCH /bids/:id/spec-lines/:lineId
{ "insulation": "Fiberglass with ASJ", "size": 2 }
```

Use the **full enriched line** in the response to update that row (qty/codes will change).

### 5.2 Read-only (never let the user type these)

| UI column | Response field | Comes from |
|-----------|----------------|------------|
| Code | `code` | System lookup |
| Area Code | `areaCode` | Area lookup |
| Material Code | `materialCode` | Material lookup |
| Unit | `unit` | System lookup |
| Production / Hour | `productionPerHour` | Mike |
| Qty Estimated | `qtyEstimated` | Mike |
| Qty Received | `qtyReceived` | Trimble line items |
| Qty Remain | `qtyRemain` | Est − Recv |
| Structshare Item | `structshareItem` | Catalog MIN price pick |
| Unit price | `structshareUnitPrice` | Catalog |

Format quantities to **2 decimal places** for display. Keep full precision when sending `size` / `thickness` on PATCH.

### 5.3 Visual rules

- `qtyRemain < 0` → warning style (over-received)  
- `qtyEstimated === 0` after edit → hint “No Mike match for this size/insulation”  
- `structshareItem === null` → show “—”  
- `trimbleProjectId == null` → Received column stays 0; soft banner  

### 5.4 Material match system (backend — not a duct-only hack)

Mike phrases (e.g. `2 .75# Ductwrap`) rarely match List Spec phrases 1:1. Backend resolves via **helpermap**:

1. Exact Spec phrase → keyword / base  
2. Else longest `rawPrefix` hit  
3. Else longest **keyword** fuzzy match (`ductwrap` ≡ `duct wrap`)  
4. Else known family tokens  

Then Structshare uses a **match mode** from the material **base** (not hard-coded product names):

| Mode | When (base examples) | Catalog size rule |
|------|----------------------|-------------------|
| `pipe` | Fiberglass, Cal Sil, Armaflex, … | `size1 = Spec size`, `size2 = thickness` |
| `roll` | Duct Wrap, Pipe and Tank Wrap | `size1 = thickness` only (roll width ignored) |

API enriched lines include `catalogMatchMode`: `"pipe"` | `"roll"`.

**Adding a new family later:** put it on helpermap (phrase + keyword + base). If catalog sizing isn’t pipe IPS×thick, add that base to the backend `MATCH_MODE_BY_BASE` registry (one line). Prefer List Spec phrases in the Insulation dropdown so resolve stays exact.

Density (`0.75` / `3/4#`) and facing hints are parsed from the Mike/Spec text when Weight/Facing fields are empty.

---

## 6. Trimble / Job link (auto from Mike when possible)

**What Recv needs:** bid `jobId` → auto `trimbleProjectId` → Trimble line items.

**Auto from Mike upload:** Mike row 1 is metadata like `Estimate,21190,IMD4724 - …`. Frontend must send that with the rows:

```http
POST /bids/:id/mike-rows
{
  "rows": [ ... ],
  "jobNumberHint": "21190",
  "projectLabel": "IMD4724 - University of Maryland…"
}
```

Response includes:

```json
{
  "imported": 1516,
  "jobId": 417,
  "trimbleProjectId": 12345,
  "jobLink": {
    "status": "auto_linked",
    "jobId": 417,
    "trimbleProjectId": 12345,
    "matchedJobNumber": "21190",
    "message": "Job 21190 linked from Mike file — Received will load from Trimble."
  }
}
```

| `jobLink.status` | UI |
|------------------|-----|
| `auto_linked` | Success toast / green status — Recv can load |
| `already_set` | Bid already had a job — leave as-is |
| `not_found` | Banner + **ask user to pick Job** on bid (number in file didn’t match `Ref_Jobs`) |
| `no_hint` | Banner + **ask user to pick Job** (parser didn’t send hints) |

**Do not** put a Trimble project picker on Specs happy path. Job picker only when auto-link failed.

Optional override: `PATCH /bids/:id` `{ "jobId": 391 }` or `{ "trimbleProjectId": 123 }`.

---

## 7. Mike upload (your main feature)

### 7.0 Why you saw: `No usable rows in file. Need size / thickness / quantity columns.`

That error is from the **frontend CSV parser**, not the Nest API.

Real Mike exports (see repo sample **`mike.CSV`**) look like this:

| Row | Content |
|-----|---------|
| **1** | Metadata only: `Estimate,21190,IMD4724 - …` — **NOT headers** |
| **2** | Real headers: `Area, …, System-and-Type, Thickness, Size, Quantity, …` |
| **3+** | Data rows |

If the parser treats **row 1** as headers, it never finds `Size` / `Thickness` / `Quantity` → exactly that error.

**Fix:** skip metadata; detect the header row as the first row that contains all three of `Size`, `Thickness`, `Quantity` (case-insensitive). Then map:

| CSV header | → API field |
|------------|-------------|
| `System-and-Type` | `systemAndType` |
| `Thickness` | `thickness` |
| `Size` | `size` |
| `Quantity` | `quantity` |
| `Hours` | `hours` |
| First `Material` column (numeric) | `materialCost` (optional) |
| Insulation text (often blank-named column after `Spec`, e.g. `2 6# FSK w/Aluminum`) | `materialPhrase` |

Reference parser (run locally / copy into frontend):

```bash
node scripts/parse-mike-csv.js mike.CSV
# → OK parsed 1516 rows
```

Source: [`scripts/parse-mike-csv.js`](../scripts/parse-mike-csv.js)

### 7.1 UX

1. User picks CSV or XLSX Mike export.  
2. Show progress while parsing.  
3. Call APIs (see below).  
4. Replace Specs grid with result.  
5. If Spec lines already exist, confirm: “Replace existing Spec lines?”

### 7.2 API sequence (same button)

```text
POST /bids/:id/mike-rows
Body: {
  "rows": [ /* MikeRowInput */ ],
  "jobNumberHint": "21190",
  "projectLabel": "IMD4724 - University of Maryland…"
}
→ {
  "bidId": 14,
  "imported": 1516,
  "jobId": 417,
  "trimbleProjectId": 12345,
  "jobLink": { "status": "auto_linked", "message": "…", … }
}

POST /bids/:id/spec-lines/auto-from-mike
Body: { "replace": true }
→ { "bidId": 14, "created": 52, "lines": [ /* SpecLine[] enriched */ ] }
```

If `jobLink.status` is `not_found` or `no_hint`, show banner and let user pick Job on the bid (`PATCH /bids/:id { "jobId" }`), then refresh Specs.
Use `lines` from the second call to render the grid immediately (or `GET /bids/:id/spec-lines`).

### 7.3 `MikeRowInput` shape (after correct parse)

```jsonc
{
  "excelRowNumber": 3,
  "systemAndType": "D EXH O     Exhaust                REC",
  "thickness": 2,
  "size": 44,
  "quantity": 693.84,
  "hours": 206.51,
  "materialCost": 4630.3,
  "materialPhrase": "2 6# FSK w/Aluminum",
  "materialBase": null
}
```

`POST mike-rows` is a **full replace**. `{ "rows": [] }` clears Mike data.

`GET /bids/:id/mike-rows` — show count in the setup strip.

---

## 8. Spec lines API

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/bids/:id/spec-lines` | List + computed fields |
| POST | `/bids/:id/spec-lines` | Add one line |
| PATCH | `/bids/:id/spec-lines/:lineId` | Update editable fields |
| DELETE | `/bids/:id/spec-lines/:lineId` | Delete → `{ "ok": true }` |
| POST | `/bids/:id/spec-lines/auto-from-mike` | Build lines from Mike |

### Create (manual add)

Required: `systemName`, `insulation`, `size`, `thickness`.

```jsonc
POST /bids/13/spec-lines
{
  "type": "Plumbing",
  "systemName": "Domestic Cold Water",
  "areaName": "All",
  "insulation": "Fiberglass with ASJ",
  "size": 1,
  "thickness": 1
}
```

### Example enriched line (what you render)

```jsonc
{
  "id": 55,
  "bidId": 13,
  "sortOrder": 1,
  "type": "Plumbing",
  "systemName": "Domestic Cold Water",
  "areaName": "All",
  "insulation": "Fiberglass with ASJ",
  "size": 1,
  "thickness": 1,
  "weight": null,
  "facing": null,
  "addJacket": null,
  "layers": null,
  "extraNotes": null,
  "trimbleProjectId": 42524,
  "code": "DCW",
  "areaCode": "XX",
  "materialCode": "FGA",
  "unit": "LF",
  "materialBase": "Fiberglass",
  "keyword": "fiberglass",
  "qtyEstimated": 404.38,
  "productionPerHour": 9.817431415392086,
  "qtyReceived": 36,
  "qtyRemain": 368.38,
  "structshareItem": "01\" (1-3/8\") X 1\" (135) ASJ John Manville ...",
  "structshareUnitPrice": 1.1
}
```

### Auto-from-Mike notes

- Default `replace: true` wipes previous Spec lines.  
- Without Mike rows → **400**.  
- Groups Mike by size × thickness × material base; labels are best-effort — user fixes via dropdowns.

---

## 9. Lookups (load once per Specs page)

| Method | Path | Use in UI |
|--------|------|-----------|
| GET | `/lookups/bidding/spec-systems` | System dropdown (`systemName`, also shows `code`/`unit` as hint) |
| GET | `/lookups/bidding/spec-materials` | Insulation dropdown (`description`) |
| GET | `/lookups/bidding/spec-areas` | Area dropdown (`areaName`) |
| GET | `/lookups/bidding/spec-facings` | Facing dropdown (`value` / `label`: ASJ, FSK, PSK, …) |
| GET | `/lookups/bidding/helper-map` | **Do not show** in normal UI (backend uses it) |
| GET | `/lookups/bidding/item-catalog?search=&size1=&size2=&limit=` | Price admin / search |
| PATCH | `/lookups/bidding/item-catalog/:id` | `{ "price": 1.25 }` then refetch Spec lines |

```jsonc
// systems
[{ "id": 1, "systemName": "Domestic Cold Water", "code": "DCW", "unit": "LF", "sortOrder": 0, "isActive": true }]

// materials
[{ "id": 1, "description": "Fiberglass with ASJ", "code": "FGA", "sortOrder": 0, "isActive": true }]

// areas
[{ "id": 1, "areaName": "All", "code": "XX", "sortOrder": 0, "isActive": true }]

// catalog
[{ "id": 123, "itemName": "01\" ...", "price": 1.1, "size1": 1, "size2": 1 }]
```

Cache lookups in page state / React Query. Refresh Spec lines after any catalog price change.

---

## 10. Bid fields you need

From existing bid APIs (`GET/POST/PATCH /bids`):

| Field | Specs use |
|-------|-----------|
| `id` | All Specs URLs |
| `jobId` | Enables auto Trimble |
| `trimbleProjectId` | Show link status; drives Received |
| `status` | Prefer edits only when `draft` (UI gate; Specs API currently does not hard-lock) |

Extend your bid TypeScript type with:

```typescript
trimbleProjectId: number | null;
```

---

## 11. TypeScript contracts (copy-paste)

```typescript
export interface SpecSystem {
  id: number;
  systemName: string;
  code: string;
  unit: string;
  sortOrder: number;
  isActive: boolean;
}

export interface SpecMaterial {
  id: number;
  description: string;
  code: string;
  sortOrder: number;
  isActive: boolean;
}

export interface SpecArea {
  id: number;
  areaName: string;
  code: string;
  sortOrder: number;
  isActive: boolean;
}

export interface CatalogItem {
  id: number;
  itemName: string;
  price: number | null;
  size1: number | null;
  size2: number | null;
}

export interface MikeRowInput {
  excelRowNumber?: number;
  systemAndType?: string;
  thickness?: number | null;
  size?: number | null;
  quantity?: number;
  materialCost?: number | null;
  hours?: number | null;
  materialPhrase?: string | null;
  materialBase?: string | null;
}

export interface SpecLineWrite {
  type?: string | null;
  systemName: string;
  areaName?: string | null;
  insulation: string;
  size: number;
  thickness: number;
  weight?: string | null;
  facing?: string | null;
  addJacket?: string | null;
  layers?: string | null;
  extraNotes?: string | null;
  sortOrder?: number;
}

export interface SpecLine extends SpecLineWrite {
  id: number;
  bidId: number;
  sortOrder: number;
  trimbleProjectId?: number | null;
  code: string | null;
  areaCode: string | null;
  materialCode: string | null;
  unit: string | null;
  materialBase: string | null;
  keyword: string | null;
  qtyEstimated: number;
  productionPerHour: number | null;
  qtyReceived: number;
  qtyRemain: number;
  structshareItem: string | null;
  structshareUnitPrice: number | null;
}
```

Suggested API module:

```typescript
// lib/api/endpoints/biddingSpecs.ts
listSpecLines(bidId: number): Promise<SpecLine[]>
createSpecLine(bidId: number, body: SpecLineWrite): Promise<SpecLine>
patchSpecLine(bidId: number, lineId: number, body: Partial<SpecLineWrite>): Promise<SpecLine>
deleteSpecLine(bidId: number, lineId: number): Promise<{ ok: true }>
listMikeRows(bidId: number): Promise<unknown[]>
replaceMikeRows(bidId: number, rows: MikeRowInput[]): Promise<{ bidId: number; imported: number }>
autoFromMike(bidId: number, replace?: boolean): Promise<{ bidId: number; created: number; lines: SpecLine[] }>
getSpecSystems(): Promise<SpecSystem[]>
getSpecMaterials(): Promise<SpecMaterial[]>
getSpecAreas(): Promise<SpecArea[]>
listCatalog(params: { search?: string; size1?: number; size2?: number; limit?: number }): Promise<CatalogItem[]>
patchCatalogPrice(id: number, price: number): Promise<CatalogItem>
```

---

## 12. Suggested file / component split

```text
app/(dashboard)/bidding/[id]/specs/page.tsx

components/bidding/specs/
  SpecsPage.tsx           # load bid + lookups + lines; wire upload
  SpecsSetupStrip.tsx     # Trimble status, Mike count, buttons
  SpecsGrid.tsx           # table
  SpecsLineRow.tsx        # dropdowns + read-only cells
  MikeUploadButton.tsx    # file → parse → mike-rows → auto-from-mike
  CatalogPriceDialog.tsx  # optional

lib/bidding/
  specs-types.ts
  parseMikeFile.ts        # CSV/XLSX → MikeRowInput[]

lib/api/endpoints/biddingSpecs.ts
```

---

## 13. Errors (show these on the frontend)

Every failed API call returns JSON like:

```jsonc
{
  "statusCode": 400,
  "code": "SPECS_NO_MIKE_ROWS",
  "message": "Upload a Mike file first, then generate Spec lines.",
  "details": null
}
```

**UI rule:** toast / banner = `message`. Optionally switch on `code` for special handling.

| `code` | When | UI hint |
|--------|------|---------|
| `SPECS_NO_MIKE_ROWS` | Auto-generate without Mike | Prompt upload |
| `SPECS_MIKE_ROWS_INVALID` | Bad `rows` body | Client bug |
| `SPECS_LINE_INVALID` | Missing system / insulation / size / thickness | Highlight fields |
| `SPECS_LINE_NOT_FOUND` | Bad line id | Refresh grid |
| `SPECS_BID_NOT_FOUND` | Bad bid id | Back to list |
| `SPECS_CATALOG_NOT_FOUND` / `SPECS_CATALOG_PRICE_INVALID` | Catalog edit | Fix dialog |
| `VALIDATION_FAILED` | DTO validation | Use `details.fields` |
| `DB_UNAVAILABLE` | SQL connection / login | “Try again in a moment” (HTTP 503) |
| `UNAUTHORIZED` | JWT missing/expired | Re-login |
| `INTERNAL_ERROR` | Unexpected | Generic retry |

Other edge cases:

| Situation | UI |
|-----------|-----|
| Re-upload with existing Spec lines | Confirm replace |
| No Trimble link | Soft warning; Received = 0 (not a hard error) |
| Unknown insulation | qty 0 / empty Structshare — keep dropdowns |
| Long upload | Disable button; spinner |

---

## 14. What you must NOT implement on the client

1. Mike quantity rollups  
2. Trimble name parsing for Received  
3. Catalog MIN-price selection logic  
4. Sending computed fields (`qtyEstimated`, `code`, …) on PATCH  
5. A mandatory Trimble project picker for the happy path  

---

## 15. Acceptance checklist (QA)

- [ ] Specs step exists on bid at `/bidding/[id]/specs`  
- [ ] Page loads lookups + existing `spec-lines` + bid (`trimbleProjectId`, Mike count)  
- [ ] Trimble shown as auto status (no required picker)  
- [ ] **One** Upload Mike action: `mike-rows` → `auto-from-mike` → grid filled  
- [ ] Grid: System / Insulation / Area are **dropdowns** from lookups  
- [ ] Size/thickness editable; PATCH refreshes qty/codes/structshare from response  
- [ ] Qty Est / Recv / Remain / Structshare / codes are **read-only**  
- [ ] Regenerate + delete + add line work  
- [ ] Smoke (with sample Mike + linked Trimble): Fiberglass ASJ, size 1, thick 1 → about **qtyEst 404.38**, **recv 36**, **remain 368.38**  
- [ ] Catalog price change optional path refreshes Structshare after refetch  

---

## 16. End-to-end call cheat sheet

```text
# Page load
GET  /bids/:id
GET  /lookups/bidding/spec-systems
GET  /lookups/bidding/spec-materials
GET  /lookups/bidding/spec-areas
GET  /lookups/bidding/spec-facings
GET  /bids/:id/mike-rows
GET  /bids/:id/spec-lines

# Happy path
POST /bids/:id/mike-rows                      { rows, jobNumberHint, projectLabel }
POST /bids/:id/spec-lines/auto-from-mike      { replace: true }

# Edit
PATCH /bids/:id/spec-lines/:lineId            { insulation?, size?, ... }

# Optional
POST /bids/:id/spec-lines                     { systemName, insulation, size, thickness, ... }
DELETE /bids/:id/spec-lines/:lineId
PATCH /lookups/bidding/item-catalog/:id       { price }
PATCH /bids/:id                               { trimbleProjectId }   // rare override only
```

---

Questions about column mapping for a specific Mike export file → ask backend with a sample file attached.  
Base Bid / proposal stays in [BIDDING_FRONTEND_API.md](./BIDDING_FRONTEND_API.md).
