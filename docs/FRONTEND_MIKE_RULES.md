# Mike rules — Specs UI panel (frontend)

**Who:** Frontend — show these in a **Rules** button / side panel / Specs sub-tab.  
**Scope (now):** **Mike only** (Qty Est, Hours Mike, PPH, auto-from-mike stacking).  
**Not in this doc yet:** Trimble Recv / Structshare / Production green-red (later).  
**Last updated:** 2026-08-10  

**How to use:** Copy the list below into the UI. Titles = accordion / list headers. Bodies = panel copy. Do **not** recompute Mike math in the browser — backend already applies these.

---

## Suggested UI

| Element | Suggestion |
|---------|------------|
| Entry | Specs page: **Rules** button or **Rules** sub-tab next to Specs grid |
| Layout | Accordion or simple stacked cards; Mike section only for now |
| Tone | Estimator language — no helpermap / SQL jargon |
| After regenerate | Optional tip: “Regenerate Specs after new Mike upload so stacks refresh” |

---

## Rules to show (Mike)

### 1. One takeoff per bid
All Mike CSVs on a bid (Duct + HVAC + Plumbing, etc.) are **one physical takeoff**. Uploads **append** into that takeoff — they do not create separate Specs worlds. Qty Est / Hours use **every** Mike row on the bid.

### 2. Two match modes
Every Spec line is either:

| Mode | Typical materials | How Mike qty / hours stack |
|------|-------------------|----------------------------|
| **Pipe** | Fiberglass, Foamglas, Armaflex / Flex Tubing, … | Same **size × thickness × material family** → **add** |
| **Roll** | Duct Wrap (fiberglass duct wrap), Pipe & Tank Wrap | Same **thickness × material family × weight × facing** → **add**; **size is ignored** |

API field: `catalogMatchMode` = `"pipe"` \| `"roll"`.

### 3. Roll stacking (important)
If the line is **roll** (Duct Wrap / wrap family — often Trimble unit **Roll**):

- **Add** Mike rows that share thickness + insulation family + density (wt) + facing (e.g. FSK).
- Different duct **sizes** (6, 8, 112, …) on Mike **merge into one Spec line**.
- You should **not** see many Spec rows with the same thick/wt/facing and different sizes each repeating the same Qty Est — that means Specs need **Regenerate**.

### 4. Pipe stacking
If the line is **pipe**:

- **Add** Mike rows with the same **pipe size**, **thickness**, and **material family**.
- Facing (ASJ, PVC, …) is shown on the Spec line; Est qty still comes from Mike size × thick × family match.

### 5. Qty Estimated
`qtyEstimated` = **sum of Mike quantities** in that Spec stack (rules 3 or 4).  
Frontend does not sum raw Mike rows — display the API value.

### 6. Hours (Mike) & Production / Hour
- `hoursEstimated` = **sum of Mike hours** in the same stack.  
- `productionPerHour` = **Σ qty ÷ Σ hours** for that stack (not a single Mike row’s productivity).  
- If hours are 0 → PPH is empty / “—”.

### 7. Material phrases from Mike
Mike text is often short or coded (e.g. `2 .75# Ductwrap`, `2 3# FSK`, `FoamGlas w/ ASJ`, bare `Fiberglass`). Backend maps these to Spec insulation + family:

| Mike-style phrase | Treated as |
|-------------------|------------|
| `… Ductwrap` / duct wrap | **FIBERGLASS DUCT WRAP** (roll) |
| `2 3# FSK` (density + FSK, no “duct” word) | **Duct Wrap** roll (same family) |
| Bare `Fiberglass` | **Fiberglass with ASJ** (pipe) |
| `FoamGlas w/ ASJ` | **Foamglas** + facing **ASJ** (not Fiberglass) |
| `FoamGlas w/ PVC` / Aluminum / … | Matching Foamglas Spec + facing |
| Flex / Armaflex family | Flex Tubing / Armaflex Spec phrases |

Wrong mapping → Qty Est **0** (“No Mike match”). Fix insulation/size/thick or **Regenerate** after uploads.

### 8. Weight & facing on rolls
For **roll** lines, density (**wt**, e.g. `0.75`, `3`) and **facing** (e.g. FSK) are part of the stack key:

- `2"` thick + `0.75#` + FSK → one Spec line  
- `2"` thick + `3#` + FSK → **different** Spec line  
- Do not merge different wt/facing into one roll line.

### 9. Type order (Duct → HVAC → Plumbing)
Auto-from-Mike Spec lines sort by discipline/type when possible: **Duct**, then HVAC-related, then **Plumbing**. Letter codes on Mike (e.g. `D` / `P`) drive type; HVAC takeoff rows that use `P` show as Plumbing type.

### 10. Regenerate after Mike changes
After appending Mike files, Specs **auto-rebuild** on upload (`specsRegenerated` in the API response). Manual **Regenerate Specs** is still available if the grid looks stale. Editing dropdowns alone does not re-stack old pipe-split roll rows.

### 11. Zero Qty Est
If `qtyEstimated === 0` after a Spec edit: no Mike rows match that size / thick / material family (or roll wt/facing). Hint: **“No Mike match for this size/insulation”**. Check insulation mapping (rule 7) or regenerate.

### 12. Display precision
Show Mike qty / hours / PPH to **2 decimal places**. Keep full precision on PATCH for `size` / `thickness`.

### 13. Wt / Recv “zeros” — not Mike bugs
- **Wt** on pipe Specs is usually **`null`** (Mike has no density). FE must show **“—”**, never the placeholder label **“Wt”**.
- **Recv / Hrs @ Recv = 0** means Trimble link or catalog match is empty — Qty Est / Hrs Mike can still be correct.
- Full column contract: [FRONTEND_BIDDING_SPECS.md](./FRONTEND_BIDDING_SPECS.md) §5.3.1.

---

## Copy-paste JSON (optional hardcode in FE)

```json
{
  "scope": "mike",
  "title": "Mike rules",
  "updated": "2026-08-10",
  "rules": [
    {
      "id": "one-takeoff",
      "title": "One takeoff per bid",
      "body": "All Mike CSVs on a bid append into one takeoff. Qty Est and Hours use every Mike row on the bid."
    },
    {
      "id": "match-modes",
      "title": "Pipe vs Roll",
      "body": "Pipe materials stack by size × thickness × material family. Roll materials (Duct Wrap) stack by thickness × family × weight × facing — size is ignored."
    },
    {
      "id": "roll-stack",
      "title": "Roll stacking",
      "body": "For roll lines, different duct sizes with the same thick, wt, and facing merge into one Spec line. Many size rows with the same Qty Est means Specs need Regenerate."
    },
    {
      "id": "pipe-stack",
      "title": "Pipe stacking",
      "body": "For pipe lines, Mike quantities add when size, thickness, and material family match."
    },
    {
      "id": "qty-est",
      "title": "Qty Estimated",
      "body": "Qty Estimated is the sum of Mike quantities in that Spec stack. The UI only displays the API value."
    },
    {
      "id": "hours-pph",
      "title": "Hours & Production / Hour",
      "body": "Hours Mike = sum of Mike hours in the stack. Production / Hour = total qty ÷ total hours for that stack."
    },
    {
      "id": "phrase-map",
      "title": "Mike material phrases",
      "body": "Short Mike phrases are mapped automatically (e.g. Ductwrap and 2 3# FSK → Duct Wrap roll; bare Fiberglass → Fiberglass with ASJ; FoamGlas w/ ASJ → Foamglas + ASJ, not Fiberglass)."
    },
    {
      "id": "wt-facing",
      "title": "Weight & facing (rolls)",
      "body": "On roll lines, density (wt) and facing (e.g. FSK) define the stack. Different wt or facing = different Spec lines."
    },
    {
      "id": "type-order",
      "title": "Type order",
      "body": "Auto Spec lines prefer order Duct → HVAC → Plumbing when discipline is known from Mike."
    },
    {
      "id": "regenerate",
      "title": "Regenerate after Mike changes",
      "body": "After new Mike uploads, Regenerate Specs so stacks and insulation labels rebuild."
    },
    {
      "id": "zero-qty",
      "title": "Zero Qty Est",
      "body": "Zero Qty Est means no Mike match for that size/insulation (or roll wt/facing). Check the Spec fields or regenerate."
    },
    {
      "id": "decimals",
      "title": "Decimals",
      "body": "Show qty, hours, and PPH with 2 decimal places."
    },
    {
      "id": "wt-null",
      "title": "Wt on pipe",
      "body": "Pipe Specs usually have no weight (null). Show a dash — never leave the Wt placeholder text in the cell. Roll lines can show density like 0.75 or 3."
    },
    {
      "id": "recv-not-mike",
      "title": "Recv zeros vs Mike",
      "body": "Recv and Hrs @ Recv at 0 mean Trimble has no match yet. If Qty Est and Hrs Mike are filled, Mike is fine — that is not a takeoff bug."
    }
  ]
}
```

---

## Out of scope (do not put in Mike Rules panel yet)

- Trimble Recv sum when unit is Roll / same thickness  
- Recv SF, SF/roll, Recv summary  
- Structshare options / no vendor pick  
- Production report green/red vs Connecteam  

Those land in a later **Trimble / Production rules** panel.

**Full Specs API:** [FRONTEND_BIDDING_SPECS.md](./FRONTEND_BIDDING_SPECS.md)
