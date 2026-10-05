# CONS UAT 25 Sep 2026 — FE handoff

Give this to FE. FollowupCRM **Additional details / Sales activities** stay ignored (already live). Do not rebuild those forms.

`GET /lookups/bidding/process-meta` → `estimatesListEditor`, `assignmentEditor`, `intakeEditor.hideBidClerk`, `attachmentMaxBytes`, `attachmentLabels` includes `master-scan`, `drawingCategories` includes `cd`.

---

## FE only (no API wait)

- Estimates: **list default**, hide tiles.
- Title: `bidName` + `estimateNumber`.
- Column **Work stage → Status** (`processStage`).
- Multi-select filters, no cap.
- Estimator filter = teams/captains. **Not** `contacts?role=estimator`.
- Hide ops / reporting / billing for `assistant_estimator`.
- Bid-date order: call `GET /bids?sort=bidDate` (or sort client-side the same way).
- Settings: label slot `bidClerk` as **Assistant Estimator**; hide duplicate Bid clerk.
- Assignment: hide `bidClerk`; show `assistantEstimator` + **technical review**.
- Test-bid cleanup (Micron `IVA 6379`) is ops, not an API.

**Base Bid ($)** on Intake: `process.baseBidPrice`. Proposal shows it read-only. Do not PATCH the Excel `baseBid` object for this.

---

## Backend already live — wire this

| What | API |
|------|-----|
| Drawing number | `process.drawingNumber` on GET/PATCH. List row `drawingNumber`. `GET /bids?search=` matches it. |
| One-keyword search | `search=` also hits architect/owner/ME names, drawing #, and a ProcessJson keyword scan (GCs etc.). |
| Activity copy | `GET /bids/:id/activity` `summary` is e.g. `Changed owner company`. Show who + summary + when. |
| Attachments | **50 MB**. Label `master-scan`. Drawing category `cd`. |
| Takeoff names | PATCH `process.assignment` (captain/team) fills `takeoffAssignments` from that crew. |
| Contacts picker empty | `GET /lookups/bidding/contacts` (no role) or `?role=assistant_estimator`. Aliases: `estimator`, `bid_clerk`, `clerk`. |
| Leave Assignment | `approvedForTakeoff === true` unless No-bid. `workflow.completeBlockedReason`. |

Details: [FRONTEND_BIDDING_DASHBOARD.md](./FRONTEND_BIDDING_DASHBOARD.md), [FRONTEND_INTAKE.md](./FRONTEND_INTAKE.md), [FRONTEND_SPEC_SHEET.md](./FRONTEND_SPEC_SHEET.md), [FRONTEND_AUTH.md](./FRONTEND_AUTH.md).
