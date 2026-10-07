# Project Financials — FE handoff

**Give this file to FE.** One module, one doc.  
**Last updated:** 2026-10-04

Awarded-job book (Excel *Project Financials*). **Not bidding. Not WFS. Not Siteline-only aging.**

JWT on every route (`Authorization: Bearer <access_token>`). Same login as the rest of the app.

**Do not re-derive money.** Paint the numbers. Do not invent overhead %, net, or Excel contact columns.

This sheet is also PJ’s **error-finding board** (Tuesday review). See **Error finding** below — FIX / NOT IN SITELINE are required UI, not optional.

---

## Screens (two)

| Screen | Excel | API |
|--------|--------|-----|
| **1. Summary** | `Summary` sheet (one row per PM + totals) | `GET /project-financials/summary` |
| **2. Job book** | Dave / Insulation / Closed sheets (same columns) | `GET /project-financials/jobs` |
| **3. BOM** | `Tracking Info BOM` | `GET /project-financials/bom` (same payload as `/jobs` — paint `bom`) |
| Job drawer / page | same row | `GET /project-financials/jobs/:jobNumber` |

Do **not** build Five Week, Siteline Billing, Siteline AR, AP Contacts, or Startups as this module. Line-item grid stays on `/trimble/line-items` (use `bom.trimble.projectIds[0]`).

Filters on both screens: company, PM, search, Active / All, **alerts (FIX / NOT IN SITELINE)**.

---

## Filters

Load once:

```
GET /project-financials/filters
GET /project-financials/meta
```

```json
{
  "companies": [
    { "entityId": 1, "company": "GOEL" },
    { "entityId": 2, "company": "GOEL DC" },
    { "entityId": 3, "company": "DCB" }
  ],
  "views": ["active", "all"],
  "alerts": ["fix", "not_in_siteline", "any"],
  "pms": ["Christian Crampton", "Dave Rosowski"]
}
```

`meta` has the same `companies` + `views` (no `pms`). Use `filters` for the PM dropdown.

Query on summary + jobs (all optional):

| Query | Default | Notes |
|-------|---------|--------|
| `entityId` | all | `1` / `2` / `3` only |
| `pm` | all | substring, case-insensitive |
| `search` | all | job #, name, customer, PM, company |
| `view` | `active` | `active` = Siteline `ACTIVE`. `all` = inactive + CS-only + SL-only |
| `alert` | all | `fix` · `not_in_siteline` · `any` (PJ Tuesday queue) |

```
GET /project-financials/summary?entityId=3&pm=Dave&view=active
GET /project-financials/jobs?alert=fix
GET /project-financials/jobs?alert=any
```

---

## Error finding (Excel → API)

Excel *Difference Error* and the RED columns are how PJ catches PM mistakes **before** Tuesday. Same rules as the sheet. **Do not re-derive.**

### In the API — must paint

Excel formula (Dave / Insulation job book, *Difference Error*):

`Siteline === 0` → `"NOT IN SITELINE"`  
`Siteline !== Revised` → `"FIX"`  
else blank.

| Excel | API | Paint |
|-------|-----|--------|
| Difference Error = `NOT IN SITELINE` | `recon.sitelineClearstory === 'not_in_siteline'` and `recon.alerts[]` `{ code: "NOT_IN_SITELINE", label: "NOT IN SITELINE" }` | Red chip + red row |
| Difference Error = `FIX` | `recon.sitelineClearstory === 'fix'` and `alerts[]` `{ code: "FIX", label: "FIX" }` | Red chip + red row |
| Difference Error blank | `sitelineClearstory === 'ok'`, `alerts: []` | no chip |
| Difference $ | `recon.difference` / `contract.difference` (revised − Siteline) | show $; red if not ~0 |
| Over / Under Billings | `recon.overUnderBillings` (`billed − cost.total`) | number; `null` if no Foundation — show “—” |
| Cash flow / billings vs expense | `cost.cashFlow` | same dollars as over/under when Foundation is up |

Tolerance is **$0.01** (backend). FE does not compare revised vs Siteline again.

**Summary / job-book header**

| Chip | Bind | Click |
|------|------|--------|
| FIX | `alerts.fix` | `?alert=fix` |
| NOT IN SITELINE | `alerts.notInSiteline` | `?alert=not_in_siteline` |
| All errors | `alerts.fix + alerts.notInSiteline` | `?alert=any` |

Per-PM: `fixCount` / `notInSitelineCount` on each summary row. Click PM → jobs `?pm=<name>&alert=any`.

Example job with a contract error:

```json
{
  "recon": {
    "sitelineClearstory": "fix",
    "difference": 1000,
    "overUnderBillings": 24500,
    "alerts": [{ "code": "FIX", "label": "FIX" }]
  }
}
```

### Excel-only — do **not** invent

These RED / FIX columns exist on the sheet. They are **not** in this API (`missing` / `notWired` includes `startup_budgets`). Hide them.

| Excel | Why missing |
|-------|-------------|
| Job # red = wage scale | no scale flag on Siteline/Clearstory/Foundation join |
| Estimate minus actual (RED = worse than estimate) | needs Project startup budget |
| % labor hrs / labor $ / material vs actual | same |
| Total cost savings or overrun (RED) | same |
| % overrun on labor (Scheduling / Ops) | same |
| Estimated margin % **RED=FIX** | needs startup + Excel OH % — we do not invent 13% |
| Scope reduction “not in Extracker” | manual Excel note |
| Trimble ordered − received | **`bom.trimble.orderedMinusReceived`** |

---

## 1. Summary

```
GET /project-financials/summary
```

```ts
{
  asOf: string;            // ISO — footer “as of”
  missing: string[];       // banner if includes "foundation_job_cost"
  alerts: { fix: number; notInSiteline: number }; // header chips — click → ?alert=
  rows: SummaryRow[];      // one per PM
  totals: SummaryRow;      // pm === "Total" — paint as last row
}

type SummaryRow = {
  pm: string;
  activeBillings: number;
  backlog: number;
  ar: number;
  atp: number;
  atpPctOfBillings: number | null;
  openJobs: number;
  activeJobs: number;
  retentionOnly: number;
  totalCost: number;
  cashFlow: number | null;
  fixCount: number;
  notInSitelineCount: number;
  overhead: null;
  billingsVsExpense: null;
  net: null;
  pctNet: null;
  netWith75Atp: null;
};
```

### Columns (this order)

| Paint | Bind | Hide if null |
|-------|------|----------------|
| PM | `pm` | |
| Active billings | `activeBillings` | |
| Backlog | `backlog` | |
| AR | `ar` | |
| Approved to Proceed | `atp` | |
| % ATP → billings | `atpPctOfBillings` | yes |
| Open jobs | `openJobs` | |
| Active jobs | `activeJobs` | |
| Retention only | `retentionOnly` | |
| Total cost | `totalCost` | |
| Cash flow | `cashFlow` | yes |
| FIX | `fixCount` | |
| NOT IN SITELINE | `notInSitelineCount` | |
| Overhead / Net / % Net / Billings vs expense / Net w/ 75% ATP | those five | **always hide** (always `null`) |

Money = number (dollars). `%` fields are ratios (`0.25` = 25%) — format in UI.

Click a PM row → job book with `?pm=<name>`.

---

## 2. Job book

```
GET /project-financials/jobs
```

```ts
{
  asOf: string;
  missing: string[];
  alerts: { fix: number; notInSiteline: number };
  jobs: JobRow[];
}
```

### Identity

| Paint | Bind |
|-------|------|
| Job # | `jobNumber` |
| Name | `name` |
| Customer | `customer` |
| City / State | `city` / `state` |
| Company | `company` (`entityId` for filter only) |
| PM | `pm` (tooltip `pmEmail`) |
| Status | `status` |

`status`: `active` · `inactive` · `siteline_only` · `clearstory_only`.

Red job # = wage scale — **not in API**. Do not invent.

### Contract (Clearstory + Siteline)

| Paint | Bind |
|-------|------|
| Contract | `contract.amount` |
| Approved COs | `contract.approvedCos` |
| ATP | `contract.atp` |
| In review | `contract.inReview` |
| Placeholder | `contract.placeholder` |
| Revised | `contract.revised` |
| Siteline contract | `contract.siteline` |
| Difference | `contract.difference` / `recon.difference` |

### Errors

Full rules + Excel map: **Error finding** above. Bind `recon.*`. Red when `recon.alerts.length > 0`.

### Billing (Siteline)

| Paint | Bind |
|-------|------|
| Billed | `billing.billed` |
| Retainage | `billing.retainage` |
| Backlog | `billing.backlog` |
| AR | `billing.ar` |
| % billed | `billing.pctBilled` |
| % complete | `billing.percentComplete` |
| Retention only | `billing.retentionOnly` (bool — chip, not a $) |

### Cost (Foundation)

| Paint | Bind |
|-------|------|
| LAB MAT SUB EQU BUR INS OTH DIS | `cost.lab` … `cost.dis` |
| Total cost | `cost.total` |
| Labor hours | `cost.labHours` |
| Labor rate | `cost.laborRate` |
| LAB + BUR | `cost.laborWithBurden` |
| Cash flow | `cost.cashFlow` (`billed − total`) |

If `sources.foundation === false`, show cost cells as empty / “—”, not `$0` (zeros mean “Foundation said zero”).

### Sources (debug / footer, not a column)

```ts
sources: { siteline: boolean; clearstory: boolean; refJob: boolean; foundation: boolean; trimble: boolean }
```

---

## 3. BOM (`Tracking Info BOM`)

```
GET /project-financials/bom
GET /project-financials/jobs
```

Same `jobs[]`. Paint `job.bom`. Job picker = `jobNumber` + `name`. `missing` includes `trimble_bom` if Trimble table is down.

| Excel | Bind |
|-------|------|
| GOEL / GOEL DC / DCB material | `bom.companies[]` (`entityId` 1/2/3) → `materialCost` |
| same, labor hours | `bom.companies[].laborHours` |
| Totals | `bom.totals.materialCost` / `laborHours` |
| Contract FROM CLEARSTORY | `bom.clearstory.contract` |
| Approved COs FROM CLEARSTORY | `bom.clearstory.approvedCos` |
| Total contract (contract + COs) | `bom.clearstory.totalContract` |
| Project completion % | `bom.clearstory.completionPct` (Siteline % billed, 0–1) |
| BOM budget (Trimble est/rev total cost) | `bom.trimble.bomBudget` |
| BOM budget % used | `bom.trimble.bomBudgetPct` (`actualCost / bomBudget`) |
| Ordered | `bom.trimble.ordered` |
| Received | `bom.trimble.received` |
| **difference ordered − received** | `bom.trimble.orderedMinusReceived` — flag if ≠ 0 |
| Actual cost | `bom.trimble.actualCost` |
| Trimble labor hours / est hours | `bom.trimble.laborHours` / `estLaborHours` |
| Remaining / % used | `bom.trimble.remaining` / `pctUsed` |
| Material cost vs completion | `bom.vsCompletion.materialVsCompletion` |
| Labor hours vs completion | `bom.vsCompletion.laborVsCompletion` |

If `sources.trimble === false` or `bom.trimble === null`, hide Trimble columns (not `$0`). Foundation company columns: empty “—” when that company’s `materialCost` and `laborHours` are both 0 **and** `sources.foundation === false`.

Line-item grid: `GET /trimble/line-items?projectId=` using `bom.trimble.projectIds[0]`.

---

## 4. One job

```
GET /project-financials/jobs/21038
```

Same `JobRow` object as one element of `jobs[]`.  
404 `{ "statusCode": 401|404, "message": "Job 21038 not found" }` — toast `message`, stay on the book.

URL-encode the job # (`21145%20-%2002`).

---

## JobRow shape (copy this)

```ts
type JobRow = {
  jobNumber: string;
  name: string | null;
  customer: string | null;
  city: string | null;
  state: string | null;
  entityId: number | null;          // 1 | 2 | 3
  company: string | null;           // GOEL | GOEL DC | DCB
  pm: string | null;
  pmEmail: string | null;
  status: 'active' | 'inactive' | 'siteline_only' | 'clearstory_only';
  contract: {
    amount: number;
    approvedCos: number;
    atp: number;
    inReview: number;
    placeholder: number;
    revised: number;
    siteline: number | null;
    difference: number | null;
  };
  billing: {
    billed: number;
    retainage: number;
    backlog: number | null;
    ar: number;
    pctBilled: number | null;
    percentComplete: number | null;
    retentionOnly: boolean;
  };
  cost: {
    lab: number; mat: number; sub: number; equ: number;
    bur: number; ins: number; oth: number; dis: number;
    total: number;
    labHours: number;
    laborRate: number | null;
    laborWithBurden: number;
    cashFlow: number | null;
  };
  recon: {
    sitelineClearstory: 'ok' | 'fix' | 'not_in_siteline';
    difference: number | null;
    overUnderBillings: number | null;
    alerts: { code: 'FIX' | 'NOT_IN_SITELINE'; label: string }[];
  };
  bom: {
    companies: { entityId: number; company: string; materialCost: number; laborHours: number }[];
    totals: { materialCost: number; laborHours: number };
    clearstory: { contract: number; approvedCos: number; totalContract: number; completionPct: number | null };
    trimble: {
      projectIds: number[];
      itemCount: number;
      ordered: number;
      received: number;
      orderedMinusReceived: number;
      actualCost: number;
      laborHours: number;
      estLaborHours: number;
      bomBudget: number;
      remaining: number | null;
      pctUsed: number | null;
      bomBudgetPct: number | null;
    } | null;
    vsCompletion: { materialVsCompletion: number | null; laborVsCompletion: number | null };
  };
  sources: {
    siteline: boolean;
    clearstory: boolean;
    refJob: boolean;
    foundation: boolean;
    trimble: boolean;
  };
};
```

---

## Banner

If `missing` contains `foundation_job_cost`: Foundation DB down — hide cost columns or show “costs unavailable”.  
If `missing` contains `trimble_bom`: hide Trimble BOM columns.  
Other `missing` keys are Excel-only (contacts, five-week, startups) — do not build those pages.

`GET /project-financials/meta` → `wired[]` / `notWired[]` if you want a settings footnote.

---

## Do not

- Call `/siteline/*` or `/clearstory/*` to rebuild this grid.
- Invent DM / ME / OPS / foreman / CIPP / burden / scale / GC-owner-AP contact blobs.
- Invent overhead % or net (always `null`).
- Re-derive FIX / NOT IN SITELINE — use `recon.alerts`.
- POST/PATCH this module — read-only.
- Treat WFS (`/wfs`) as this page. WFS = company cash / AR-AP. This = per-job book.

---

## Auth errors

| HTTP | Meaning |
|------|---------|
| 401 | no / bad JWT → login |
| 404 | unknown `jobNumber` |
| 200 + `missing` | data partial, not an error |
