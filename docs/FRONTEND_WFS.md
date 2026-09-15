# WFS — Frontend Handoff (Dashboard Pro Loans v44)

**Give this file to FE.**  
**Last updated:** 2026-09-13  
**Paint:** Mohamed’s **Dashboard Pro Loans v44**. One page. Do not invent a second layout.

WFS = company financial health. **Not** Siteline, **not** Clearstory, **not** Home `GET /dashboard`, **not** Estimates.

JWT on every call. **Sidebar + page: `role === 'super_admin'` only.** Hide for `admin` (IT) and every other role. Do not use `wfs:read` to show the tab to admin — they will not have it, and `/wfs/*` returns **403**. Knobs: `wfs:write`. **No Snapshot button.** History is automatic (weekly cron).

**Do not re-derive money.** Backend already applied v44 formulas.

---

## Screen (match the Excel)

| Block | Field |
|-------|--------|
| Title | `title` + `subtitle` + `asOf` |
| History filter | `historyFilter` — chips from `presets` + optional From/To. Re-GET with `range` or `from`/`to` |
| Cadence note | `cadence` only — **no Snapshot button** |
| 5 KPI chips | `kpis.*` — `value` + `delta` / `deltaPct` vs last auto-saved history row |
| Company table | `companies[]` — columns below, in this order |
| GROUP TOTAL | `totals` |
| G3 property box | `property` |
| AR / AP aging by company | `aging[]` (table, not a chart) |
| **6 Excel charts (2×3)** | `charts` — same titles/types as v44. Scroll: 2 more under the first four |

Click AR/AP total → `GET /wfs/aging?company=goel&side=ar`.  
Click Bank → `GET /wfs/cash`.  
Settings / PJ knobs → `GET` + `PATCH /wfs/static`.

`ourEntityId`: `1` Goel, `2` Goel DC, `3` DCB. Others `null`.

---

## Company table columns (v44 A–L)

| Col | JSON | Formula (already done) |
|-----|------|------------------------|
| A Bank | `bank` | Plaid operating + Fidelity |
| B P-Notes | `pnotes` | static |
| C LOC | `locLimit` | static |
| D Borrowing | `borrowing` | LOC drawn, or G3 mortgages |
| E Avail Credit | `availCredit` | `LOC===0 ? 0 : LOC − Borrowing` |
| F Other Loans | `otherLoans` | Goel equipment loan |
| G Total Debt | `totalDebt` | P-Notes + Borrowing + Other Loans |
| H AR | `ar` | Foundation `SUM(Total)` — `null` if no AR |
| I AP | `ap` | same |
| J Net AR–AP | `netArAp` | AR − AP |
| K Avail Cash | `availCash` | **= Bank** (unused LOC is not added) |
| L Equity | `equity` | Net − Total Debt + Bank (+ G3 property) |

KPI **Available Cash** = `totals.availCash` = sum of Bank, **not** Bank + unused LOC.

---

## APIs

### `GET /wfs/status`

`{ foundation, plaid, missing[], asOf }` — banner if a DB is down.

### `GET /wfs/dashboard`

Query (charts only — table / KPIs stay live):

```http
GET /wfs/dashboard
GET /wfs/dashboard?range=3m
GET /wfs/dashboard?range=6m
GET /wfs/dashboard?range=12m
GET /wfs/dashboard?range=all
GET /wfs/dashboard?from=2026-08-01&to=2026-09-13
```

Default `range=12m`. `from`/`to` (`YYYY-MM-DD`) override and set `historyFilter.range` to `custom`. Paint chips from `historyFilter.presets` — do not invent extra ranges.

```ts
{
  title: string;
  subtitle: string;
  asOf: string | null;
  cadence: 'Monthly — Mon. After 2nd Fri.';
  nextSnapshotDate: string;          // ignore
  historyFilter: {
    range: '3m' | '6m' | '12m' | 'all' | 'custom';
    from: string | null;
    to: string | null;
    presets: { id: '3m' | '6m' | '12m' | 'all'; label: string }[];
  };
  comparedTo: { asOf; totalEquity; availableCash; ar; ap; netArAp } | null;
  sources: { foundation: boolean; plaid: boolean; missing: string[] };
  kpis: {
    totalEquity: { value: number; delta: number | null; deltaPct: number | null };
    availableCash: { value: number; delta: number | null; deltaPct: number | null };
    totalAr: { value: number; delta: number | null; deltaPct: number | null };
    totalAp: { value: number; delta: number | null; deltaPct: number | null };
    netArAp: { value: number; delta: number | null; deltaPct: number | null };
  };
  charts: {
    equityCash: { date: string; label: string; totalEquity: number; availableCash: number }[];
    arVsAp: { key: string; label: string; ar: number; ap: number }[];
    equityByCompany: { date: string; label: string; goel: number; dcb: number; goelDc: number; other: number }[];
    arAging: { key: string; label: string; current: number; d31: number; d61: number; d90: number; retainage: number; total: number }[];
    aging: { companyKey; label; type: 'ar' | 'ap'; current; d31; d61; d90; retainage; total }[];
    cashMix: { key: string; label: string; availCash: number }[];
    arByCompany: { date: string; label: string; goel: number; dcb: number; goelDc: number }[];
    apByCompany: { date: string; label: string; goel: number; dcb: number; goelDc: number }[];
  };
  companies: {
    key: 'goel' | 'dcb' | 'goel_dc' | 'ati' | 'g3' | 'dmv_demo' | 'dmv_insul';
    label: string;
    ourEntityId: number | null;
    kind: 'arap' | 'cash' | 'property';
    bank: number; pnotes: number; locLimit: number; borrowing: number;
    availCredit: number; otherLoans: number; totalDebt: number;
    ar: number | null; ap: number | null; netArAp: number | null;
    availCash: number; equity: number;
  }[];
  totals: { bank; pnotes; locLimit; borrowing; availCredit; otherLoans; totalDebt; ar; ap; netArAp; availCash; equity };
  aging: { companyKey; label; type: 'ar' | 'ap'; current; d31; d61; d90; retainage; total }[];
  property: { value; evaluationDate; debt; cashHeld; netEquity; shareOfGroupEquity };
}
```

`aging[]` is the lower-right box (Goel AR, Goel AP, DCB AR, …).

### Charts — Excel 2×3 (v44 rows 32 / 49 / 66)

Same titles, same types. X on trends = `label` (`Aug-26`). Oldest first.

Also on the page (FE already paints these — do not leave empty):

| Title | JSON | Type |
|-------|------|------|
| Available Cash Mix — Latest Snapshot | `charts.cashMix` | pie / doughnut — `availCash` per company (live Bank) |
| AR Aging by Company | `charts.arAging` **or** `charts.aging` | stacked — `arAging` is AR-only; `aging` is the same rows as the aging box (AR+AP) |

```
[ equityCash        dual line    ] [ arVsAp      grouped bar ]
[ equityByCompany   stacked bar  ] [ arAging     stacked bar ]
[ arByCompany       3-line       ] [ apByCompany 3-line      ]
```

| Excel title | JSON | Type | Series |
|-------------|------|------|--------|
| Total Equity vs Available Cash — Trend (last 12 months) | `charts.equityCash` | dual **line** | `totalEquity`, `availableCash` |
| AR vs AP by Company — Latest Snapshot | `charts.arVsAp` | grouped **bar** | `ar`, `ap` — Goel / DCB / Goel DC |
| Equity by Company — Trend (last 8 months, ties to Total Equity) | `charts.equityByCompany` | **stacked** bar | `goel` + `dcb` + `goelDc` + `other` = group equity |
| AR Aging by Company (0–30 → 91+ / Retainage) | `charts.arAging` | **stacked** bar | `current` (0–30), `d31`, `d61`, `d90` (91+), `retainage` |
| AR by Company — Trend (last 12 months) | `charts.arByCompany` | 3 **line** | `goel`, `dcb`, `goelDc` |
| AP by Company — Trend (last 12 months) | `charts.apByCompany` | 3 **line** | `goel`, `dcb`, `goelDc` |

`aging[]` is the table under G3 property. `charts.arAging` is the graph.

Trend points = history rows inside `historyFilter.from`–`to`. Seeded Excel dates + auto Monday save. Filter change = new GET. `arVsAp` / `arAging` stay live (not filtered).

KPI chip Δ = live minus last history row (`comparedTo`). Green/red on `delta`. Hide Δ when `delta === null`.

Do **not** call `POST /wfs/snapshot`. Removed.

### `GET /wfs/aging?company=goel&side=ar|ap`

Invoice / vendor lines.

### `GET /wfs/cash`

Plaid rows. `companyKey` when we know the legal name.

### `GET /wfs/static` · `PATCH /wfs/static`

```http
PATCH /wfs/static
{ "items": [{ "id": 1, "amount": 4600000 }] }
```

Optional: `label`, `asOfDate` (`YYYY-MM-DD` or `null`). Do not POST new kinds. Kinds: `loc_limit`, `loc_drawn`, `pnote`, `mortgage`, `equipment_loan`, `property_value`, `extra_cash`.

---

## Do not

- Call Siteline `/siteline/aging-report` for this page
- Rebuild Excel formulas
- Rebuild chart math — use `charts.*` as-is
- Show the tab to `admin` or anyone who is not `super_admin`

Sidebar: **WFS**. Not Estimates. Not Home.
