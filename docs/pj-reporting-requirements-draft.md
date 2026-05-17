# PJ reporting requirements (draft — additive)

Living document built incrementally from stakeholder input. **Do not implement from this file until explicitly directed.**

---

## 1. COR log — required columns (v1 narrow export / view)

For COR logs, **only** the following fields are required (all other Clearstory/export columns may be omitted from the UX and from PM-facing tables).

| # | Display name | Notes |
|---|----------------|-------|
| 1 | COR number | |
| 2 | COR date | Clearstory **`coIssueDate`** → mirror **`CoIssueDate`** (nullable until a CO is issued). |
| 3 | Customer CO Number | |
| 4 | Customer Reference Number | |
| 5 | My Job Number | Universal join key to other systems (e.g. Siteline, master project table). |
| 6 | COR Title | |
| 7 | Requested Amount | |
| 8 | Approved CO issued amount | **Display rule**: see §1.d — intentionally **blank** when “In Review + T&M tags” violation (bad data hygiene). Otherwise show `ApprovedCoIssuedAmount`. |
| 9 | Days in review | |
| 10 | Status | |
| 11 | Stage | **Exactly one of three labels** for this report — see §1.e. |
| 12 | Responsible party | See mapping — stored as `BallInCourt` (sourced from Clearstory `ballInCourt` / `responsibleParty` / `responsible` / `ownerReview`). |

### 1.a Typos / wording (cosmetic)

- Earlier note used **“Approved CO issued ammount”** → correct spelling **amount**.
- **“REquested Amount”** → display as **Requested amount** (sentence case is fine in UI).

### 1.b Clearstory mirror mapping (`Clearstory_Cors`)

This codebase already syncs CORs into **`dbo.Clearstory_Cors`**. Rough mapping for PJ’s 12 columns:

| Display name | SQL / entity field | Availability |
|----------------|-------------------|--------------|
| COR number | `CorNumber` | Direct |
| COR date | **`CoIssueDate`** (synced from API `coIssueDate` / `coIssuedDate`) | Direct — **locked as COR issue date** per stakeholder |
| Customer CO Number | `CustomerCoNumber` | Direct |
| Customer Reference Number | `CustomerReferenceNumber` | Direct |
| My Job Number | `JobNumber` (contractor/job # on COR). If they ever mean GC job #, Clearstory also has **`CustomerJobNumber`** — confirm with PJ. | Direct |
| COR Title | `Title` | Direct |
| Requested Amount | `RequestedAmount` | Direct |
| Approved CO issued amount | `ApprovedCoIssuedAmount` | Direct — **stored** value always exists in DB when Clearstory sends it; **UI/export** may omit (show empty) per §1.d when validation fails |
| Days in review | *(none stored)* | **Computed or extended sync** — not a column today. Would need business rules (e.g. days since entering “in review”, or a field inside full Clearstory JSON if it exists — check `Clearstory_ApiPayloads` type `cor` for a matching property). |
| Status | `Status` | Direct |
| Stage | `Stage` | **Values in DB** may be Clearstory-native strings (often snake_case). **Product display** normalizes to exactly three options in §1.e. |
| Responsible party | `BallInCourt` | **Semantic match** — sync maps Clearstory `responsibleParty`, `responsible`, `ownerReview`, etc. into `BallInCourt`. |

### 1.c Gaps / follow-ups

- **Days in review**: agree formula or discover field in Clearstory detail payload and optionally add to mirror.
- **Open vs approved reports**: PJ matrix suggested different column sets per table — current spec is one 12-column set; reconcile if “open log” drops COR number etc.
- **Currency**: mirror uses `decimal(18,2)`; API may return decimals as strings — display rules TBD.

### 1.e Stage — allowed values (stakeholder)

For the COR log, **Stage** is treated as one of **exactly three** business values (display labels):

| # | Stage (display) |
|---|------------------|
| 1 | Approved to proceed |
| 2 | In review |
| 3 | Placeholder |

*(Your note had “Aprroved” — standard spelling **Approved**.)*

**Implementation note:** `Clearstory_Cors.Stage` may store API literals such as `approved_to_proceed`, `in_review`, `placeholder` (and possibly variants). Map **from raw → one of the three labels** for UI/export; rows with other Clearstory stages (if any) need a policy: **exclude from this log**, **bucket to closest label**, or **“Other” row** — **TBD** unless PJ confirms only these three ever appear for scope.

### 1.d Data-quality rule — “In Review” + T&M tags

**Intent:** If a COR is still in **In review** (stage **#2** in §1.e) but already has **T&M tags** (any associated tag / any value — meaning the job has tag activity that shouldn’t align with that stage), the record is **wrong / not updated properly**. The PM should be **informed** (e.g. weekly pack, highlight list, or in-app flag — channel TBD).

**Rule (stakeholder):**

1. **`Stage`** is **In review** (after normalizing raw `Stage` to §1.e).
2. **T&M tags present** for the same COR context — **“any value”** means the condition is true if at least one qualifying tag exists (exact definition **TBD** in engineering: see below).

**UI / export behavior:**

- **Approved CO issued amount** column: show **empty** (no number) when this rule fires, so readers do not trust a dollar amount until the PM fixes Clearstory.
- Optionally add a separate **alert** column later (e.g. “T&M tag while In Review”) — not in the original 12-column list; add only if PJ wants it visible in-grid.

**Engineering follow-ups (not yet defined in Clearstory mirror):**

- How to detect **“has T&M tags”** for a COR: e.g. link from COR → tags in **full COR JSON** (`Clearstory_ApiPayloads`), or join **`Clearstory_Tags`** to COR by `ProjectId` / `JobNumber` with a filter for T&M tag type (confirm field in Clearstory for “TM” vs other tags).
- PM **notification** payload: include COR id, job number, short reason string.

---

## Appendix — sections reserved for future drops

*(Add section 2, 3, … as new inputs arrive.)*
