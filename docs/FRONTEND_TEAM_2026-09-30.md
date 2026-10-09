# 30 Sep 2026 — FE handoff

**Give this file to FE.** One meeting, one doc.  
Live contract: `GET /lookups/bidding/process-meta`.

**Out:** in-app Bluebeam / Revu, in-app PDF editor, in-app chat (Connecteam only). Markup is Togal.ai.

---

## Save 403 → do not go to `/job`

PATCH 403 `{ "code": "BID_TEAM_LOCKED", "message": "Only the assigned team can edit this bid" }` is **not** “logged out of admin”. Stay on `/bidding/:id`. Toast `message`. `canEdit: false` = view-only here, not a redirect.

Named captain (`user.id === assignment.captainUserId`) can edit even without Settings → My team.

---

## Estimates list

`GET /bids`. Columns (`estimatesListEditor`):

| Column | Bind |
|--------|------|
| Estimate # | `estimateNumber` (own column; this **is** the Mike #) |
| Name | `bidName` (own column) |
| Current progress | `processStage` |
| Bid date | `bidDate` |
| Team captain | `captain` |

Hide: `drawingNumber`, `dueDate`, `dueTime`. Estimator filter → **Team captain**.

**AE / `user`:** default `GET /bids?view=internal` (takeoff only). Chrome: Internal bid list + Takeoff (`chromeTabsByRole`). Columns: `#`, name, `internalBidDate`, `takeoffTurnedIn`. `?view=all` = full team table. Hide ops nav (`hideOpsNavFor`).

**Saved filters:** `PATCH /auth/profile { "estimatesFilterKeys": [...] }`. Login / profile echo the array. Empty → `defaultFilterKeys`.

---

## Tabs + pills

Order: Intake → Assignment → **Drawings** → **Specs** → **Handoff** → Takeoff → Proposal → Post-bid → Outcome.

Drawings / Specs are UI tabs (`stage: null`, `fromHub: true`). Handoff **is** `estimating_setup`.

`GET /bids/:id` → `workflow.tabs[].pill` = `complete` | `in_progress` | `todo`. Render that. Do not invent your own.

---

## Intake

- Client date = header `bidDate`. Hide `process.dueDate` / `dueTime`.
- Hub uploads: `label` = `drawings` | `specifications` | `invitation`. Addenda later = `addenda`.
- No size cap. ZIP ok. Max 200 files / bid.
- Base Bid `$` = `process.baseBidPrice`.

**Drawings / Specs:** `GET /bids/:id` `attachments[]`, filter `hubPick` labels. List / select / download. Do **not** re-upload from O-drive. Optional `PATCH .../attachments/:id { "drawingCategory": "ifb" }`.

---

## Assignment / Handoff / Takeoff

- Hide Assignment internal estimate/review dues. Slots: `duct1, duct2, hydronic1, hydronic2, plumbing1, plumbing2`.
- Approve-for-takeoff is **Handoff**, not Assignment (`technicalReview.approvedForTakeoff`).
- `process.internalBidDate` — set on Handoff, **show on Takeoff**. Not client `bidDate`. No minus-N auto.

Takeoff: **one** file drop (`label=takeoff`, `category=takeoff_markup`). Zip / snaps / recap — jo bhi, same box. List `takeoffTurnedIn` = koi bhi takeoff file. **No** zip vs snap vs recap slots. **No** per-scope tick.

Two buckets: `project_documents` (files already on the bid) vs `takeoff_markup` (what comes back from Togal). Takeoff tab = snaps and the color-coded export, not the drawing set.

Markup: upload drawings, specs, and addenda on the bid. The server sends them to Togal. **Open in Togal** (`process.togal.projectUrl`) only to mark up. View and download the originals here, and on the job via `GET /bids/job/:jobId/files`. Snaps and the color-coded export drop on Takeoff (`category=takeoff_markup`). Full FE build: [FRONTEND_TOGAL.md](FRONTEND_TOGAL.md). No in-app PDF editor.

7 Oct estimating meeting and the printed proposal: [FRONTEND_EST.md](FRONTEND_EST.md).

---

## Proposal / Post-bid / Outcome

| Tab | Stage | Bind |
|-----|--------|------|
| Proposal | `proposal` | `baseBid` / `systems` / `computed` plus `process.proposalSheet` (the printed proposal). Identity read-only (`proposalEditor`). Guide: [FRONTEND_EST.md](FRONTEND_EST.md). |
| Post-bid | `post_bid` | `process.intelligence` + GC/mechanical `stillBidding` (`postBidEditor`) |
| Outcome | `result` | `POST /bids/:id/outcome` — `workflow.showAward` / `showLost` |

Do not PATCH `salesActivities`. Do not turn Estimates into a post-bid queue.

---

## Dashboard (not Estimates)

`GET /dashboard` — render `notifications[]`, `messages`, `groups`. Due column / due notifications use **`bidDate`**.

| `kind` | Click |
|--------|--------|
| `assigned` / `due` | `/bidding/:bidId` — only bids this person is on |
| `note` / `comment_mention` | Notes drawer (`commentId`) |

Chat stays on the messages module. Do not copy it into `notifications[]`.

`defaults.notifications` is `true`.
