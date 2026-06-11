# Base Bid — Complete Field & Formula Reference (Frontend)

This documents **every cell** on the Excel **Base Bid** tab: which cells are **inputs** (the user types/selects them → you build form fields) and which are **calculated** (Excel formulas → **the backend computes these; the frontend must NOT recalculate them**, just display what the API returns).

> **Golden rule:** inputs are sent to the backend (`PATCH /bids/:id`), calculated values come back from `POST /bids/:id/calculate`. Never reimplement a formula in the browser — if a number is missing from the API, tell backend to add it (see §6).

Legend for **Backend status**:
- ✅ **Returned** — already in the `/calculate` `computed` payload.
- 🟡 **Computed internally** — backend calculates it as part of the math but does **not** yet expose it as its own field.
- 🔴 **Not yet** — backend does not compute/expose it (needs work if the UI must show it).

---

## 1. Inputs (build form fields for these)

These are user-entered. They are stored in `baseBid` / `systems` (see `BIDDING_FRONTEND_API.md`).

### Header / project
| Cell | Label | Input type | API field |
|------|-------|-----------|-----------|
| B1 | BID Estimate # | text | `estimateNumber` |
| D1 | Bid Name | text | `bidName` |
| B2 | Bid Date | date | `bidDate` |
| D2 | Company Bidding | dropdown (our-entities) | `ourEntityId` |
| F2 | Team | dropdown (`/lookups/bidding/teams`) | `teamName` |
| C3 | Assistant Estimator | text | `assistantEstimator` |
| D4 | Margin | percent (e.g. 0.25) | `marginPercent` |
| H3 | PLA | Yes/No | `pla` |

### Location / schedule
| Cell | Label | Input | API field |
|------|-------|-------|-----------|
| B5 | What State is this project in? | dropdown (`/states`) | `projectState` |
| D5–D7 | Project Type | dropdown (`/project-types`) | `projectType` |
| F4 | Hours per day | number | `hoursPerDay` |
| F5 | Days per week | number | `daysPerWeek` |
| E7 | GSF of Building | number | `gsfOfBuilding` |
| B12 | Duration of Project – Months | number | `durationMonths` |
| B13 | Start in # of months from bid | number | `startInMonths` |
| G7 | Number of personnel | number | (used in crew math) |

### Wage / flags
| Cell | Label | Input | API field |
|------|-------|-------|-----------|
| B8/C8/D8 | Wage rate (scale) | dropdown (`/wage-rates`, `displayLabel`) | `wageRateLabel` |
| F8 | Does O/CCIP cover WC? | Yes/No | `ccipCoversWc` |
| F12 | Citizen Project | Yes/No | `citizenProject` |
| F13 | Apprenticeable job | Yes/No | `apprenticeable` |
| G5 | MBE or preference | dropdown (`/preferences`) | `preference` |

### Material escalation & tax
| Cell | Label | Input | API field |
|------|-------|-------|-----------|
| H10 | Escalation on materials per Year | percent (0.04) | `materialEscalationPerYear` |
| H12 | Sales Tax Applicable | Yes/No | `salesTaxApplicable` |

### Lifts
| Cell | Label | Input | API field |
|------|-------|-------|-----------|
| J4 | Lifts (needed?) | Yes/No | `liftsNeeded` |
| J5 | % of people on Lifts we provide | percent | `liftPercentage` |
| J6 | Lift cost average rental per 4 weeks | number | `liftCostPer4Weeks` |

### Parking
| Cell | Label | Input | API field |
|------|-------|-------|-----------|
| J9 | Parking | Yes/No | `parking` |
| J10 | % of people that will park | percent | `parkingPeoplePercent` |
| J11 | Parking Cost per Day – we reimburse | number | `parkingCostPerDay` |

### System grid (one column per system: Duct1 B, Duct2 C, Hydronic1 D, Hydronic2 E, Plumbing1 F, Plumbing2 G, VRF H, Equipment I)
| Row | Label | Input | API field (per `systems[]` item) |
|-----|-------|-------|------------------|
| 17 | MIKE Estimate # | number | `mikeEstimateNumber` |
| 18 | Materials without escalation | number | `materials` |
| 19 | Labor Hours | number | `laborHours` |
| 20 | TOTAL PRICE per MIKE | number | `mikeTotalPrice` |
| 21 | Quantity (LF/SF) | number | `quantity` |
| 23 | Who was used | Yes/No | `used` |

---

## 2. Lookup-derived cells (auto-filled from a dropdown selection)

When the user picks a **Team**, **Wage rate**, or **State**, these cells auto-populate. The frontend should populate them from the corresponding lookup API response — **no math**, just a lookup by the selected value.

| Cell | Formula (Excel) | Meaning | Source API | Backend |
|------|-----------------|---------|-----------|---------|
| A4 | `XLOOKUP(Team, Team_list, Captain)` | Captain name | `/lookups/bidding/teams` → `captain` | 🟡 (lookup) |
| C4 | `XLOOKUP(Team, Team_list, Bid_Clerk)` | Bid Clerk | teams → `bidClerk` | 🟡 |
| B16 | `XLOOKUP(Team, Team_list, Duct_1)` | Duct 1 person | teams → `duct1` | 🟡 |
| C16 | `XLOOKUP(Team, Team_list, Duct_2)` | Duct 2 person | teams → `duct2` | 🟡 |
| D16 | `XLOOKUP(Team, Team_list, Hydronic_1)` | Hydronic 1 | teams → `hydronic1` | 🟡 |
| E16 | `XLOOKUP(Team, Team_list, Hydronic_2)` | Hydronic 2 | teams → `hydronic2` | 🟡 |
| F16 | `XLOOKUP(Team, Team_list, Plumbing_1)` | Plumbing 1 | teams → `plumbing1` | 🟡 |
| G16 | `XLOOKUP(Team, Team_list, Plumbing_2)` | Plumbing 2 | teams → `plumbing2` | 🟡 |
| F9 | `XLOOKUP(Wage_Rate, …, Wage_Rate)` | Selected wage ($30) | `/wage-rates` → `wage` | ✅ via wage-rate |
| F10 | `XLOOKUP(Wage_Rate, …, Wage_Rate_Fringe)` | Fringe ($7.29) | wage-rates → `fringe` | ✅ |
| F11 | `=F9+F10` | Wage + Fringe total ($37.29) | wage-rates → `total` | ✅ |
| H13 | `XLOOKUP(Project_State, Rate_State, Sales_Tax_by_state)` | State sales-tax % (0.06) | `/states` → `salesTaxRate` | ✅ `labor.salesTaxPercent` |

> The wage-rate dropdown list itself (cells **M5:S17** on this tab — year, wage, fringe, total, "as of" date, display string) is seeded in `Bid_WageRates`; serve it via `/lookups/bidding/wage-rates`. Cells **P5:P17** (`=N+O`) and **S5:S17** (`CONCATENATE(...)`) just build the total and the display label — already produced by the API (`total`, `displayLabel`).

---

## 3. Calculated cells — the labor-rate build-up (left block, C10:D13)

This is the **per-hour labor rate** the whole bid is built on.

| Cell | Label | Formula | Result | Plain English | Backend |
|------|-------|---------|--------|---------------|---------|
| D10 | TOTAL BIDDING LABOR RATE | `=labor_rate` | 51.70 | Burdened composite wage/hr | 🟡 (input `laborRateCompositePerHour`; auto-derive pending) |
| D11 | PARKING PER HOUR | `=IF(Parking="Yes", Parking_cost/Hours_per_day, 0)` | 3.125 | Parking $/day ÷ hours/day | ✅ `labor.parkingPerHour` |
| D12 | LIFT PER HOUR | `=IF(Lifts_Needed="Yes", Total_Lift/Total_Hours, 0)` | — | Total lift cost ÷ total hours | ✅ `labor.liftsPerHour` |
| D13 | TOTAL LABOR PER HR WITH PARKING & LIFTS | `=D10+D11+D12` | 54.825 | Labor + parking + lifts | 🟡 (sum of the three) |

### Supporting values used above
| Cell | Label | Formula | Result | Meaning | Backend |
|------|-------|---------|--------|---------|---------|
| H7 | Number of personnel (avg) | `=ROUND(J19/B12/(1950/12),2)` | 1.5 | Avg crew size = total hrs ÷ months ÷ (1950/12) | 🟡 `averageNoPeople` |
| H8 | (man-hours/period) | `=ROUND(B12*1950/12*H7,0)` | 488 | Duration × monthly hrs × crew | 🔴 |
| J7 | Total for lifts on this project | `=Lift_percentage*Lift_cost*Project_Months*(4.4/4)*Average_no_people` | 1815 | Total lift rental cost | 🟡 (used to derive D12) |
| H11 | Total escalation (year work begins) | `=(YEAR(B11)-YEAR(B2))*H10` | — | Years out × escalation/yr | ✅ `labor.materialEscalationFactor` |
| B10 | When work begins | `=EDATE(B2,B13)` | bid date + start months | Work start date | 🔴 |
| B11 | When work ends | `=EDATE(B10,B12-1)` | start + duration | Work end date | 🔴 |

---

## 4. Calculated cells — per-system "cost per hour" build-up (rows 24–33)

Columns repeat per system pair: **B/C** = system 1, **D/E** = system 2, **F/G** = system 3, **H** = VRF, **I** = Equipment, **J** = MIKE totals column. Each shows the same 10-row recipe.

| Row | Label | Formula (col B shown) | Meaning | Backend |
|-----|-------|----------------------|---------|---------|
| 24 | Labor per hour | `=Total_Wage - Parking_Per_Hour` → 51.70 | Composite labor rate (parking stripped out, re-added below) | 🟡 per-system 🔴 |
| 25 | Parking per hour | `=IF(Parking="Yes",Parking_Per_Hour,"")` → 3.125 | Parking $/hr | ✅ (value) / 🔴 per-system |
| 26 | Lifts per hour | `=IF(Lifts_Needed="Yes",Lifts_Per_Hour,"")` | Lift $/hr | ✅ (value) / 🔴 per-system |
| 27 | Materials/hour w escal+tax | `=materials/laborHours` → 14.30 | Material $ per labor hour | 🔴 |
| 28 | Material Escalation | `=row27 * Material_Escalation` | Escalation $/hr | 🟡 (factor only) |
| 29 | Material Sales Tax | `=(row27+row28) * Sales_tax_percent` → 0.858 | Tax $/hr | 🟡 (rate only) |
| 30 | **Total Cost per hour** | `=SUM(B24:C29)` → 69.99 | All per-hour costs | 🔴 per-system |
| 31 | Margin | `=row30/(1-Margin) - row30` → 23.33 | Margin $/hr | 🟡 aggregate only (`marginPerHour`) |
| 32 | Cost per hour with Margin | `=row30+row31` → 93.32 | Sell rate $/hr | 🟡 aggregate (`costPerHourPj`) |
| 33 | Cost based on math above | `=(row30*laborHours)/(1-Margin)` → 21,324.93 | Per-system bid price | 🔴 per-system |

> **J column (MIKE totals)** repeats the same rows on the combined totals: `J24`=51.70, `J27`=17.34 (blended materials/hr), `J30`=73.21 (total cost/hr), `J31`=24.40 (margin), `J32`=97.61 (sell rate/hr), `J33`=48,000 (rounded price). These mirror the aggregate fields the backend returns (see §6).

---

## 5. Calculated cells — system subtotal table & final prices (rows 36–49)

Columns: **C** Duct, **D** Hydronic, **E** Plumbing, **F** VRF, **G** Equipment, **H** Totals, **I** Cost per hour.

| Cell(s) | Label | Formula | Result | Meaning | Backend |
|---------|-------|---------|--------|---------|---------|
| C37:G37 | Labor Hours | `=IF(used,B19,C19)` etc. | per system | Hours per system | 🔴 per-system |
| H37 | Total Labor Hours | `=SUM(C37:G37)` | 487.59 | All labor hours | ✅ `labor.totalHours` |
| C38:H38 | Labor cost per hour | `=Wage_Rate_Composite` | 51.70 | Composite rate | 🟡 |
| C39:H39 | Parking per hour | `=Parking_Per_Hour` | 3.125 | | ✅ |
| C40:H40 | Lifts per hour | `=Lifts_Per_Hour` | — | | ✅ |
| C41:G41 | Labor Total (no Margin) | `=hours*SUM(38:40)` | 12,528.61 / 14,203.51 | Labor $ per system | 🔴 per-system |
| H41 | Labor Total (all) | `=shared` | 26,732.12 | | 🟡 (inside subtotal) |
| C42:G42 | Materials (no escal/profit) | `=IF(used,B18,C18)` | 3,268.95 / 5,187.54 | Materials per system | 🔴 per-system |
| H42 | Materials total | `=SUM(C42:G42)` | 8,456.49 | | 🟡 |
| C43:H43 | Material Escalation | `=materials*Material_Escalation` | — | Escalation $ | 🟡 (factor) |
| C44:H44 | Material Sales Tax | `=(materials+escal)*Sales_tax_percent` | 196.14 / 311.25 | Tax $ | 🟡 (rate) |
| C45:G45 | **Subtotal** | `=SUM(41:44)` | 15,993.70 / 19,702.31 | Per-system subtotal | 🔴 per-system |
| H45 | Subtotal (all) | `=SUM(H41:H44)` | 35,696.00 | Combined subtotal | 🟡 (`subtotalSum` internal) |
| I45 | Cost per hour | `=ROUNDUP(H45/H37,2)` | 73.21 | Cost/hr before margin | ✅ `costPerHourBeforeMargin` |
| C46/H46 | Margin | `=Margin` / `=I46*J19` | 0.25 / 11,902.07 | Margin % and $ | ✅ (percent) |
| I46 | Margin per hour | `=ROUNDUP(-I45 + I45/(1-Margin),2)` | 24.41 | Margin $/hr | ✅ `marginPerHour` |
| I47 | PJ cost per hour | `=I45+I46` | 97.62 | Sell rate $/hr | ✅ `costPerHourPj` |
| **H47** | **Bid Price – PJ Calculation** | `=ROUNDUP(I47*H37,-2)` | **47,600** | **Final PJ price** | ✅ `pjEstimate` |
| **H48** | **Bid Price – MIKE Calculation** | `=J20` | **43,837.68** | **Final MIKE price** | ✅ `mikeEstimate` |
| I48 | MIKE cost per hour | `=H48/H37` | 89.91 | MIKE sell rate $/hr | ✅ `costPerHourMike` |
| H49/A49 | FINAL PRICE | (chosen of PJ/MIKE) | — | Final number presented | 🔴 (UI picks) |

### MIKE totals column (J18:J20) — combine the system grid
| Cell | Formula | Result | Meaning | Backend |
|------|---------|--------|---------|---------|
| J18 | `=Σ materials (used systems) + VRF + Equip` | 8,456.49 | Total materials | 🟡 |
| J19 | `=Σ labor hours (used systems)` | 487.59 | Total labor hours | ✅ `labor.totalHours` |
| J20 | `=Σ TOTAL PRICE per MIKE` | 43,837.68 | MIKE total price | ✅ `mikeEstimate` |
| B22:G22 | `=IF(used, quantity_a, quantity_b)` | per system | Chosen quantity | 🔴 |

### Top-of-sheet output mirrors (display only)
| Cell | Formula | Result | Backend |
|------|---------|--------|---------|
| H1 | `=H48` (MIKE Estimate) | 43,837.68 | ✅ `mikeEstimate` |
| J1 | `=PJ_Estimate` | 47,600 | ✅ `pjEstimate` |
| H2 | `=I48` (MIKE cost/hr) | 89.91 | ✅ `costPerHourMike` |
| J2 | `=I47` (PJ cost/hr) | 97.62 | ✅ `costPerHourPj` |

---

## 6. Backend status summary — what `/calculate` returns today

`POST /bids/:id/calculate` currently returns these keys in `computed`:

```jsonc
{
  "baseBid.mikeEstimate": 43837.68,      // H48 / J20
  "baseBid.pjEstimate": 47600,           // H47
  "baseBid.costPerHourMike": 89.91,      // I48
  "baseBid.costPerHourPj": 97.62,        // I47
  "baseBid.marginPercent": 0.25,         // D4
  "baseBid.costPerHourBeforeMargin": 73.21, // I45
  "baseBid.marginPerHour": 24.41,        // I46
  "labor.totalHours": 487.59,            // H37 / J19
  "labor.parkingPerHour": 3.125,         // D11
  "labor.liftsPerHour": 0,               // D12
  "labor.materialEscalationFactor": 0,   // H11 (Material_Escalation)
  "labor.salesTaxPercent": 0.06,         // H13
  "insights.completionPercent": 70
}
```

### ✅ Fully covered (display straight from the API)
Final PJ & MIKE prices, both cost-per-hour figures, total labor hours, parking/hr, lifts/hr, sales-tax %, margin %, margin/hr, cost/hr before margin.

### 🟡 / 🔴 NOT yet returned — needed only if the UI shows the itemized table
The **per-system breakdown** (rows 24–33 and 37–45 for each individual system column) is computed *internally* but not exposed, and a few intermediates aren't returned:
- Per-system: labor total, materials, escalation $, tax $, **subtotal**, total cost/hr, cost/hr with margin, per-system price.
- Labor-rate build-up: `D13` (total labor rate w/ parking+lifts), composite `51.70` as a field.
- Schedule: work begin/end dates (B10/B11), avg personnel (H7), total lift cost (J7).
- Materials/hour (row 27), per-system quantity (B22).

**If the frontend needs to render the full Excel-style itemized table,** request that backend extend `/calculate` to return a `systems[]` array (each with `laborTotal`, `materials`, `materialEscalation`, `materialSalesTax`, `subtotal`, `costPerHour`, `costPerHourWithMargin`, `price`) plus the labor-rate build-up. Until then, the UI can show only the totals above. Do **not** compute these in the browser.

---

## 7. Quick rules for the frontend
1. **Inputs** (§1) → form fields → save via `PATCH /bids/:id`.
2. **Lookup-derived** (§2) → fill from the relevant `/lookups/bidding/*` response on selection.
3. **Everything in §3–§5** → display-only; values come from `/calculate`. Never recompute.
4. If a calculated value you need is 🟡/🔴 (not in the payload), **ask backend to expose it** — see §6.
5. Empty system columns (not "used") return blank/`""` in Excel — render them as empty, not `0`.
