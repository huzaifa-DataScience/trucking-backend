# Bidding Specs — Frontend Handoff (complete)

**Who this is for:** Frontend engineers. Assume **no** prior knowledge of Excel Specs, Mike, or Trimble.  
**Status:** Backend is **live** (JWT).  
**Last updated:** 2026-08-13  

**Where this screen lives:** **Specs tab** on the bid — `/bidding/[id]?tab=specs`. Old `/bidding/[id]/specs` = same tab. Bid chrome / other tabs: **[BIDDING_FRONTEND_API.md §0](./BIDDING_FRONTEND_API.md)**. **Do not** ship Specs as a chrome-less separate app. Do **not** rebuild the grid — only wrap it in the bid tabs.

**Structshare (2026-08-09):** No cheapest / vendor pick. Collective item list (`structshareOptions`) with **vendor names stripped**. Recv + Hrs @ Recv use the **same attribute search pool**.  

**Mike Rules panel (2026-08-10):** Estimator-facing Mike stacking rules for a Specs **Rules** button / sub-tab — **[FRONTEND_MIKE_RULES.md](./FRONTEND_MIKE_RULES.md)** (Mike only; Trimble later).

**Related**

| Doc | Use for |
|-----|---------|
| [FRONTEND_AUTH.md](./FRONTEND_AUTH.md) | Login + Bearer token |
| [BIDDING_FRONTEND_API.md](./BIDDING_FRONTEND_API.md) | **§0 shell** + bid create/list/Base Bid. Specs is a **tab**, not a new product. |
| **[FRONTEND_MIKE_RULES.md](./FRONTEND_MIKE_RULES.md)** | **Rules UI copy** — Mike Qty Est / stack / regenerate (panel or sub-tab) |
| [FRONTEND_PRODUCTION_REPORT.md](./FRONTEND_PRODUCTION_REPORT.md) | **Production report** — commodity hours vs Connecteam (tab next to Specs) |
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

Screens:

```text
/bidding                       ← bid list (hub)
/bidding/[id]?tab=specs        ← Specs tab (this doc)
/bidding/[id]/specs            ← alias — same tab
/bidding/[id]?tab=production   ← Production tab
/estimation-files              ← library: ONE takeoff file per bid (uploads append)
/estimation-files/[fileId]     ← view that takeoff’s rows
/production                    ← Production list: GET /production-reports (1 row per bid)
```

Add nav **Estimation files** + **Production** (global lists). Specs stays **on the bid tab**. From Specs, jump to Production tab — not a new site section.

### ⚠️ Multi CSV upload = ONE physical Mike takeoff (mandatory)

| | |
|--|--|
| **Truth** | Plumbing + HVAC + duct CSVs **append into one** `Bid_MikeFile` |
| **Name / job** | **User sets** takeoff display name + Job at upload (never auto `COMBINED TAKEOFF`) |
| **Library / Specs list** | **One** takeoff row per bid — show `fileName` the user chose |
| **Upload** | `POST /bids/:id/mike-files` **appends** rows into the one takeoff and **auto-regenerates Spec lines** (`specsRegenerated` in response) |

`GET /bids/:id/mike-files` → `files.length === 1`, `calcMerge.mode === "single_file"`.

### What Specs is NOT

- Not the Base Bid calculator / proposal PDF  
- Not something you calculate in the browser — **backend returns the numbers**

### Glossary (use these words in the UI)

| Term | Meaning |
|------|---------|
| **Bid** | One estimate (`/bids/:id`). Specs data is stored **per bid**. |
| **Mike / estimation file** | Takeoff export (CSV/XLSX). Stored in a **global library**; each file belongs to one bid. |
| **Estimation files page** | `GET /estimation-files` → list all; open → `GET /estimation-files/:fileId` (meta + rows). |
| **Spec line** | One row on the Specs grid (like one Excel Specs Plumb row). |
| **Qty Estimated** | Sum of Mike quantities for that size × thickness × material. |
| **Qty Received** | Sum of material already received on the job (from Trimble/StructShare line items). |
| **Qty Remain** | `Estimated − Received`. |
| **Trimble / StructShare project** | Job materials system. Our SQL already mirrors projects + line items. Used only for **Received**. |
| **trimbleProjectId** | Numeric StructShare project id on the bid. **Auto-filled from the bid’s job** when possible. |
| **Insulation** | Material phrase on the Spec line (e.g. `Fiberglass with ASJ`). Drives Mike match + catalog keyword. |
| **Structshare options** | Catalog **item** matches for Spec attrs (`structshareOptions[]`). Product text only — **no vendor** in `itemName`. Not a pick / not cheapest. |
| **Structshare Item / unit price** | Always `null` — do not show a single recommended SKU or price. |
| **Hours estimated (Mike)** | `hoursEstimated` — Σ Mike hours for that Spec commodity stack. |
| **Hours from received** | `hoursEstimatedFromReceived` — received qty ÷ production/hour (roll uses Recv SF). “How many hours should we be at?” |
| **Production report** | Job-level commodity BOM + Connecteam actual → green/red. List: `GET /production-reports` (1 row/bid). Detail: `GET /bids/:id/production-report`. |
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
│  Item catalog   │──► Structshare **options list** (item text, no vendor)
│  + lookups      │──► dropdown options (System / Insulation / Area)
└─────────────────┘
```

**One search pool (backend):** Spec thick / wt / facing / material keyword →  
Trimble **Recv** (quantity) + Hrs @ Recv + roll SF/summary **and** catalog `structshareOptions`.  
Not price-ranked; not “pick Johns Manville”.

**Frontend never:**

- Sums Mike rows for estimated qty  
- Parses Trimble item names for received  
- Picks MIN catalog price / recommends a vendor  

**Frontend only:** upload Mike → call APIs → render response → let user edit dropdown fields → PATCH → re-render response.

---

## 3. Product flow you must build (DEFAULT)

### A) Global Estimation files (primary library)

```
/estimation-files
    │
    ├─► GET /estimation-files          → table of ALL takeoffs (every bid)
    │     columns: fileName, estimate #, bid name, rows, uploaded
    │     search: ?q=  filter: ?bidId=
    │
    ├─► Click a row → /estimation-files/[fileId]
    │     GET /estimation-files/:fileId  → meta + bid + rows (view)
    │
    ├─► [ Delete ]  DELETE /estimation-files/:fileId
    └─► [ Open Specs on bid ]  → /bidding/[bidId]?tab=specs
```

**Upload Mike here nahi** — no “Upload onto bid” / bid picker on this page.  
Upload = Specs page only (`/bidding/[bidId]/specs`) where bid is already known.

### B) Specs on a bid (one Mike takeoff)

```
Open bid → **Specs tab**
    │
    ├─► Trimble / Job link (Mike meta / Job picker — see §6)
    ├─► ONE estimation takeoff on this bid (upload more CSVs → append)
    ├─► [ Regenerate Specs ] → POST .../auto-from-mike { replace: true }
    ├─► Specs grid (edit via dropdowns — §5)
    └─► [ Production ] → GET /bids/:id/production-report
```

**Do not** render “ESTIMATION FILES (3)” with per-CSV VIEWER/Activate.  
Show: **user takeoff name** · N rows + Upload more / Regenerate / viewer for that one file.

After uploading CSVs → Specs **auto-rebuild** on each upload with rows. Manual **Regenerate Specs** still available if needed.

### Secondary actions

| Action | When |
|--------|------|
| **Open takeoff** | View Mike rows for the one file |
| **Delete takeoff** | Removes the whole combined Mike file + rows |
| **Regenerate Specs** | Rebuild Spec lines from the takeoff |
| **+ Add / Delete Spec line** | Manual Specs edits |

---

## 4. Screen layout

**Global list** `/estimation-files`:

```
┌──────────────────────────────────────────────────────────────────┐
│ Estimation files                    [ Upload ]  search [____]    │
├──────────────────────────────────────────────────────────────────┤
│ File            Estimate #   Bid name        Rows   Uploaded     │
│ mike.CSV        E-21055      Morgan State…   1516   Aug 2  ●     │
│ 21055 DUCT.csv  E-21055      Morgan State…    406   Aug 1        │
│ …                                                                │
└──────────────────────────────────────────────────────────────────┘
  click row → open file
```

**Open file** `/estimation-files/[fileId]`:

```
┌──────────────────────────────────────────────────────────────────┐
│ ← Back to list   mike.CSV · E-21055 · 1516 rows                  │
│ [ Use for Specs ]  [ Delete ]  [ Open Specs on bid ]             │
├──────────────────────────────────────────────────────────────────┤
│ Mike rows grid (read-only): system, size, thick, qty, hours…     │
└──────────────────────────────────────────────────────────────────┘
```

**Bid Specs** `/bidding/[id]?tab=specs` (alias `/bidding/[id]/specs`) — setup strip + Specs grid (calcs merge **all** Mike uploads). Same bid chrome as Estimate.

**Row order (API):** Specs + Production lines are sorted **by TYPE** — Duct → HVAC → Plumbing → other. Render in API order (or group headers by `type` if you want section breaks). Do not re-sort by qty alone.

**Empty library:**

> No estimation files yet. Upload a Mike takeoff to get started.

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
| Facing | `facing` | `GET /lookups/bidding/spec-facings` → `value` / `label` | Combobox **must bind `value={line.facing}`** from Specs GET (e.g. `"FSK"`). Allow empty/clear. Do **not** show the literal word “Facing” as the selected value — that is placeholder only. If empty, backend may fill Facing from the search-pool item text (e.g. FSK in a duct-wrap name). |
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
| Unit (Est) | `unit` | Spec/List system unit (LF/SF) — show next to Qty Est |
| Unit (Trimble) | `trimbleUnit` | Trimble UoM on matched recv items (e.g. `Roll`) — show next to Recv / StructShare. **`null` → "—"**. **Show both columns** — do not pick only one |
| Production / Hour | `productionPerHour` | Mike |
| Hours estimated | `hoursEstimated` | Mike Σ hours for this stack |
| Hours from received | `hoursEstimatedFromReceived` | recv÷PPH (roll: Recv SF÷PPH). `null` if no PPH |
| Qty Estimated | `qtyEstimated` | Mike |
| Qty Received | `qtyReceived` | Trimble line items |
| Qty Remain | `qtyRemain` | Est − Recv |
| Structshare Item | `structshareItem` | Always **`null`** — no cheapest / vendor pick. Use `structshareOptions`. |
| Unit price | `structshareUnitPrice` | Always **`null`** — do not show a single price as “the” answer. |
| Structshare options | `structshareOptions` | **Collective** catalog matches for Spec attrs (thick / wt / facing / material). `itemName` = product text **without vendor** (e.g. `02" X 48" X75' 3/4# FSK DUCT WRAP (300)`). Name-sorted. Price optional/ignored. Max 100. Empty `[]` → “—” |
| SF / roll | `structshareSfPerRoll` | **Roll mode only** (`catalogMatchMode === "roll"`). Else API sends `null` — show “—” or **hide column**. |
| Recv SF | `qtyReceivedSf` | **Roll mode only.** Else `null`. |
| Recv summary | `qtyReceivedSummary` | **Roll mode only.** e.g. `3 rolls of 400 sq ft`. Else `null` — do **not** invent text for LF/EA/pipe rows. |

**Scope (important for FE):** thickness-stack Recv, SF/roll, Recv SF, and Recv summary are **only for roll materials** (Duct Wrap / Pipe & Tank Wrap). All other materials stay **pipe mode**: size×thick Recv, no SF columns, no summary string. Other Trimble units (LF, EA, …) are normal — do not apply the roll scenario to them.

**Structshare + Recv (same search):** Recv / Recv SF / summary / Hrs @ Recv use one attribute search pool (not a vendor). Structshare column = list of matching **items** (vendor names stripped). Do **not** recommend cheapest JM/Knauf/etc.

**Roll stacking (backend, roll mode only):**

| Field | Rule |
|-------|------|
| Insulation + thickness + wt/facing | Must match → Mike qty **adds** into one Spec line |
| Production / Hour | `Σ qty / Σ hours` across stacked rows |
| Size, system, area, other cols | **Ignored** for stacking (different duct sizes still merge) |

- Trimble Recv: keyword + thickness; same thick → rolls add.
- SF per roll = `width″/12 × length′` (48×100 → 400).
- Pipe materials unchanged (still size × thick).

Format quantities to **2 decimal places** for display. Keep full precision when sending `size` / `thickness` on PATCH.

### 5.3 Visual rules

- `qtyRemain < 0` → warning style (over-received)  
- `qtyEstimated === 0` after edit → hint “No Mike match for this size/insulation”  
- **Structshare column:** render `structshareOptions` (list / chips / popover). Hide `structshareItem` / unit-price cells (always null). Empty options → “—”  
- Do **not** show manufacturer names (JM, Knauf, Owens Corning, …) — API already strips them from `itemName`  
- `trimbleProjectId == null` → Received column stays 0; soft banner  
- **Units:** two read-only cells for every row — `unit` (Est) + `trimbleUnit` (whatever Trimble has: Roll, LF, …). `null` → “—”  
- **Roll-only UI:** show SF/roll, Recv SF, Recv summary **only when** `catalogMatchMode === "roll"` (or those fields non-null). Pipe / other units → omit or “—” — no roll wording.

### 5.3.1 Spec grid — null / 0 / “—” contract (do not treat as Mike bugs)

| Column | API field | Pipe (`catalogMatchMode === "pipe"`) | Roll (`"roll"`) | Empty display |
|--------|-----------|--------------------------------------|-----------------|---------------|
| **Wt** | `weight` | Almost always **`null`** (no density in Mike). **Not missing.** | Density e.g. `"0.75"`, `"3"` | **`null` → "—"** — never leave the input placeholder text **“Wt”** visible as the cell value |
| **Facing** | `facing` | ASJ / PVC / Aluminum / … when set | FSK / … when set | `null` → “—” |
| **Qty Est** | `qtyEstimated` | Mike size×thick×family sum | Mike thick×wt×facing sum | `0` only if no Mike match |
| **Hrs Mike** | `hoursEstimated` | Mike hours sum | Mike hours sum | `0` rare |
| **PPH** | `productionPerHour` | Σqty÷Σhrs | Σqty÷Σhrs | `null` → “—” |
| **Recv** | `qtyReceived` | Trimble only | Trimble only | **`0` is normal** if job not linked / no line-item match — **not** a Mike failure |
| **Hrs @ Recv** | `hoursEstimatedFromReceived` | Recv÷PPH | Recv SF÷PPH | **`0` / null when Recv=0`** — expected |
| **Unit (Trimble)** | `trimbleUnit` | From Recv pool | Often `Roll` | `null` when Recv empty → “—” |
| **SF / roll, Recv SF, Recv summary** | `structshareSfPerRoll`, `qtyReceivedSf`, `qtyReceivedSummary` | Always **`null`** | Filled when Recv hits exist | Pipe: hide or “—” |

**Screenshot check (Fiberglass 0.75×1 ASJ):** Qty Est `24.7`, Hrs Mike `5.45`, PPH set, Facing `ASJ`, Wt `null`, Recv `0`, Hrs@Recv `0` → **Mike OK; Recv zeros = Trimble; Wt blank = correct for pipe.**

### 5.4 Material match system (backend — not a duct-only hack)

Mike phrases (e.g. `2 .75# Ductwrap`) rarely match List Spec phrases 1:1. Backend resolves via **helpermap**:

1. Exact Spec phrase → keyword / base  
2. Else longest `rawPrefix` hit  
3. Else longest **keyword** fuzzy match (`ductwrap` ≡ `duct wrap`)  
4. Else known family tokens  

Then Structshare uses a **match mode** from the material **base** (not hard-coded product names):

| Mode | When (base examples) | Catalog / Recv size rule |
|------|----------------------|--------------------------|
| `pipe` | Fiberglass, Cal Sil, Armaflex, … | `size1 = Spec size`, `size2 = thickness` |
| `roll` | Duct Wrap, Pipe and Tank Wrap | `size1 = thickness` only (roll width ignored); Recv rolls = sum at that thickness; **Recv SF** = each hit × (width/12×length) so 75′/100′ differ; **SF/roll** = modal SF from the **search pool** (not cheapest SKU / not vendor SF/RL label) |

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

## 7. Estimation files / Mike upload (global library)

**Primary FE pages use the global routes.** Bid-scoped routes remain for upload + Specs.

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/estimation-files` | **List all** takeoffs (`?q=` `?bidId=` `?limit=`) |
| GET | `/estimation-files/:fileId` | **Open** takeoff — meta + bid + rows |
| PATCH | `/estimation-files/:fileId` | Rename / set `jobId` / hints |
| DELETE | `/estimation-files/:fileId` | Remove takeoff + rows |
| POST | `/estimation-files/:fileId/activate` | Make active (single-file bids: noop-ish) |
| POST | `/bids/:id/mike-files` | **Upload / append** rows (+ `fileName`, `jobId`) |
| PATCH | `/bids/:id/mike-files/:fileId` | Same as estimation-files PATCH |
| GET | `/bids/:id/mike-files` | Takeoff for one bid |
| GET | `/bids/:id/mike-rows` | All rows on the takeoff |
| POST | `/bids/:id/mike-rows` | Legacy alias of POST mike-files |

`GET /estimation-files` returns a **flat array**:

```jsonc
[
  {
    "id": 3,
    "bidId": 14,
    "fileName": "mike.CSV",
    "rowCount": 1516,
    "isActive": true,
    "createdAt": "2026-08-02T10:00:00.000Z",
    "jobNumberHint": "21190",
    "projectLabel": "IMD4724 - …",
    "estimateNumber": "E-21190",
    "bidName": "University of Maryland…",
    "bidStatus": "draft"
  }
]
```

`GET /estimation-files/:fileId` returns the open/view payload (`file` fields + `bid` + `rows[]`).

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

### 7.1 Upload dialog (Specs page only — required UX)

**Where:** `/bidding/[bidId]/specs` (or Specs tab). Bid = URL — **no bid / “Upload onto bid” dropdown**.

When user picks one or more CSVs, show a **modal before POST**:

| Field | Required | Source / behavior |
|-------|----------|-------------------|
| **Takeoff name** | Yes | Text input — default = first CSV’s file name; user can edit |
| **Job** | Yes (or until linked) | Job picker (`GET /lookups/jobs`) → send `jobId`. Prefill `jobNumberHint` from Mike row 1 if parsed |
| **Files** | Yes | One or many CSVs — all rows append into **one** takeoff on **this** bid |
| **Project label** | Optional | From Mike row 1 col C |

**Do not show:** “Upload onto bid” / estimate picker — job select ≠ bid select; bid is already fixed on Specs.

```text
On Specs for bid 14:
  User selects plumbing.csv + hvac.csv + duct.csv
  → Dialog:
       Takeoff name: [ 21437 HQA takeoff     ]
       Job:          [ 21437- HQA (#451)     ▾ ]
  → POST /bids/14/mike-files { fileName, jobId, rows, … }  (append each CSV)
  → Show "21437 HQA takeoff · 701 rows"
```

Rename / change job later without re-upload:

```http
PATCH /bids/:id/mike-files/:fileId
PATCH /estimation-files/:fileId
{ "fileName": "21437 HQA takeoff", "jobId": 451, "jobNumberHint": "21437" }
```

### 7.2 UX flow

1. Open **Specs on a bid** → upload (name + **Job** only).  
2. Global `/estimation-files` = library list / open / delete / jump to Specs — **not** primary upload.  
3. More CSVs on same Specs → append (same or edited name + job).  
4. Regenerate Specs once after all CSVs are in.  
5. Delete removes the whole takeoff for that bid.

### 7.3 API sequence (upload)

```text
POST /bids/:id/mike-files
Body: {
  "fileName": "21437 HQA takeoff",   // USER-CHOSEN (not COMBINED TAKEOFF)
  "jobId": 451,                      // USER Job picker (preferred)
  "jobNumberHint": "21437",          // from Mike header and/or picker
  "projectLabel": "IMD4724 - …",     // optional
  "rows": [ /* MikeRowInput */ ],
  "activate": true
}
→ {
  "bidId": 14,
  "imported": 234,
  "appended": true,
  "mikeFile": { "id": 13, "fileName": "21437 HQA takeoff", "rowCount": 234, … },
  "jobId": 451,
  "trimbleProjectId": 44760,
  "jobLink": { "status": "auto_linked", "message": "…", … },
  "specsRegenerated": { "created": 42, "lineCount": 42 }
}

# Append more CSVs — same takeoff name + jobId; rows append; Specs auto-rebuild again
POST /bids/:id/mike-files
{ "fileName": "21437 HQA takeoff", "jobId": 451, "rows": [ … ] }
→ mikeFile.rowCount increases (e.g. 701); specsRegenerated.created updates

# Manual rebuild still available (same as upload auto-regen)
POST /bids/:id/spec-lines/auto-from-mike
Body: { "replace": true }
```

| Job field | When to send |
|-----------|----------------|
| `jobId` | User picked a job in the dialog — **preferred** |
| `jobNumberHint` | Always send if known (Mike header / typed job #) — used when `jobId` omitted |

If `jobLink.status` is `not_found` or `no_hint`, keep Job picker open / banner until linked.  
Also: `PATCH /bids/:id { "jobId" }` still works as override.

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

`POST mike-files` / `POST mike-rows` **adds** a file — it does **not** wipe other estimation files. Use `DELETE .../mike-files/:fileId` to remove one.

`GET /bids/:id/mike-files` — drive the list UI.  
`GET /bids/:id/mike-rows` — **all** files’ rows merged. Pass `?fileId=` only for single-file raw viewer.

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
  "trimbleUnit": "LF",
  "materialBase": "Fiberglass",
  "keyword": "fiberglass",
  "catalogMatchMode": "pipe",
  "qtyEstimated": 404.38,
  "productionPerHour": 9.817431415392086,
  "qtyReceived": 36,
  "hoursEstimatedFromReceived": 3.67,
  "qtyRemain": 368.38,
  "structshareItem": null,
  "structshareUnitPrice": null,
  "structshareOptions": [
    { "itemName": "01\" (1-3/8\") X 1\" (135) ASJ Fiberglass Pipe Covering (PC)", "price": 1.1 },
    { "itemName": "01\" X 1\" ASJ Fiberglass Pipe Covering (PC)", "price": 1.25 }
  ],
  "structshareSfPerRoll": null,
  "qtyReceivedSf": null,
  "qtyReceivedSummary": null
}
```

Duct-wrap example (roll — Recv + Structshare from same search; no vendor in names):

```jsonc
{
  "unit": "LF",
  "trimbleUnit": "Roll",
  "catalogMatchMode": "roll",
  "qtyEstimated": 13725.45,
  "qtyReceived": 3,
  "structshareItem": null,
  "structshareUnitPrice": null,
  "structshareOptions": [
    { "itemName": "02\" X 48\" X75' 3/4# FSK DUCT WRAP (300)", "price": 85.54 },
    { "itemName": "01-1/2\" X 48\" X 100' 3/4# FSK DUCT WRAP", "price": 90.0 }
  ],
  "structshareSfPerRoll": 400,
  "qtyReceivedSf": 1200,
  "qtyReceivedSummary": "3 rolls of 400 sq ft"
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
| GET | `/lookups/bidding/spec-systems` | System dropdown (`systemName` + `code`; `kind` = hydronic/plumbing/duct/equipment). `?kind=` filters |
| GET | `/lookups/bidding/spec-materials` | Insulation (`description` + `code` + `family` + `layer`). Spec sheet: `?family=&layer=insulation` — **not** `?kind=` |
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
  kind: 'hydronic' | 'plumbing' | 'duct';
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
  hoursEstimated: number;
  productionPerHour: number | null;
  qtyReceived: number;
  hoursEstimatedFromReceived: number | null;
  qtyRemain: number;
  /** Always null — no cheapest / vendor pick. */
  structshareItem: string | null;
  structshareUnitPrice: number | null;
  /** Collective matches; itemName has vendor branding stripped. price optional. */
  structshareOptions: Array<{ itemName: string; price: number | null }>;
  catalogMatchMode?: 'pipe' | 'roll';
  trimbleUnit?: string | null;
  structshareSfPerRoll?: number | null;
  qtyReceivedSf?: number | null;
  qtyReceivedSummary?: string | null;
}

/** GET /bids/:id/production-report — commodity BOM vs Connecteam actuals.
 *  Full list/detail contract: FRONTEND_PRODUCTION_REPORT.md (hours live under totals, not a flat header). */
export interface ProductionReport {
  bidId: number;
  jobId: number | null;
  jobNumber: string | null;
  trimbleProjectId: number | null;
  mikeFilesMerged: { count: number; fileIds: number[]; fileNames: string[] };
  connecteam: {
    linked: boolean;
    refJobId: number | null;
    jobNumber: string | null;
    normalizedJobNumber: string | null;
    actualHours: number | null;
    actualMinutes: number | null;
    shiftCount: number | null;
    workerCount: number | null;
    averageHoursPerWorker: number | null;
    jobLabel: string | null;
  };
  lines: Array<{
    commodityKey: string;
    type: string | null;
    insulation: string;
    materialBase: string | null;
    catalogMatchMode: string;
    size: number;
    thickness: number;
    weight: string | null;
    facing: string | null;
    qtyEstimated: number;
    hoursEstimated: number;
    productionPerHour: number | null;
    qtyReceived: number;
    qtyReceivedSf: number | null;
    hoursEstimatedFromReceived: number | null;
    qtyRemain: number;
    specLineIds: number[];
  }>;
  totals: {
    hoursEstimatedMike: number;
    hoursEstimatedFromReceived: number;
    actualHours: number | null;
    workerCount: number | null;
    averageHoursPerWorker: number | null;
    /** earned(from received) − actual; positive = under labor */
    varianceHours: number | null;
    status: 'green' | 'red' | 'unknown';
    actualHoursSource: 'connecteam';
  };
}
```

Suggested API module:

```typescript
// lib/api/endpoints/biddingSpecs.ts
listSpecLines(bidId: number): Promise<SpecLine[]>
getProductionReport(bidId: number): Promise<ProductionReport>
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

## Production report (FE)

Full handoff (layout, types, checklist): **[FRONTEND_PRODUCTION_REPORT.md](./FRONTEND_PRODUCTION_REPORT.md)**.

- List: `/production` → **`GET /production-reports`** (1 row per bid — never `/estimation-files`)
- Detail: `/bidding/[id]/production` → `GET /bids/:id/production-report`

---

## 12. Suggested file / component split

```text
app/(dashboard)/bidding/[id]/specs/page.tsx

components/bidding/specs/
  SpecsPage.tsx           # load bid + lookups + lines; wire upload
  SpecsSetupStrip.tsx     # Trimble status, Mike count, buttons
  SpecsGrid.tsx           # table
  SpecsLineRow.tsx        # dropdowns + read-only cells
  EstimationFilesPage.tsx     # GET /estimation-files list + search (library only)
  EstimationFileDetail.tsx    # GET /estimation-files/:id open/view rows
  ProductionListPage.tsx      # GET /production-reports (1 row/bid)
  MikeUploadButton.tsx        # parse → POST /bids/:id/mike-files
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

- [ ] Specs is a **tab** on the bid (`?tab=specs`). Grid unchanged. Chrome from [BIDDING_FRONTEND_API.md §0](./BIDDING_FRONTEND_API.md).  
- [ ] Page loads lookups + existing `spec-lines` + bid (`trimbleProjectId`, Mike count)  
- [ ] Trimble shown as auto status (no required picker)  
- [ ] Global `/estimation-files`: list / open / delete only — **no** “Upload onto bid” picker
- [ ] Upload from **Specs** only: dialog = takeoff name + Job → `POST /bids/:id/mike-files`
- [ ] Open file: `GET /estimation-files/:fileId` shows rows; Delete works
- [ ] Specs / Production merge **all** Mike files on the bid (`auto-from-mike` + enrich)  

- [ ] Grid: System / Insulation / Area are **dropdowns** from lookups  
- [ ] Size/thickness editable; PATCH refreshes qty/codes/`structshareOptions` from response  
- [ ] Qty Est / Recv / Remain / Structshare **list** / codes are **read-only**  
- [ ] Structshare UI uses `structshareOptions` only — no cheapest cell; **no vendor names** in labels  
- [ ] Regenerate + delete + add line work  
- [ ] Smoke (with sample Mike + linked Trimble): Fiberglass ASJ, size 1, thick 1 → about **qtyEst 404.38**, **recv 36**, **remain 368.38**  
- [ ] Catalog price PATCH optional (admin); Specs list does not depend on “cheapest”  

---

## 16. End-to-end call cheat sheet

```text
# Global library
GET    /estimation-files                      ?q=&bidId=&limit=
GET    /estimation-files/:fileId              // open / view
DELETE /estimation-files/:fileId
POST   /estimation-files/:fileId/activate

# Upload (onto a bid)
POST   /bids/:id/mike-files                   { fileName, jobId, jobNumberHint, projectLabel, rows }
PATCH  /bids/:id/mike-files/:fileId           { fileName, jobId, jobNumberHint, projectLabel }
PATCH  /estimation-files/:fileId              { fileName, jobId, … }

# Bid Specs page
GET    /bids/:id
GET    /lookups/bidding/spec-systems|materials|areas|facings
GET    /bids/:id/spec-lines
POST   /bids/:id/spec-lines/auto-from-mike    { replace: true }
PATCH  /bids/:id/spec-lines/:lineId
POST   /bids/:id/spec-lines
DELETE /bids/:id/spec-lines/:lineId
```

---

Questions about column mapping for a specific Mike export file → ask backend with a sample file attached.  
Base Bid / proposal stays in [BIDDING_FRONTEND_API.md](./BIDDING_FRONTEND_API.md).
