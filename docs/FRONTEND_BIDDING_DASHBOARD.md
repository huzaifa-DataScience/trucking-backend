# Role dashboards — Frontend Handoff

**Give this file to FE.**  
**Last updated:** 2026-09-15  
**Chat click-through:** [FRONTEND_CONNECTEAM_CHAT.md](./FRONTEND_CONNECTEAM_CHAT.md)

**Two screens. Do not merge them.**

| Screen | Sidebar | API | What it is |
|--------|---------|-----|------------|
| **Dashboard** | Home / Dashboard | **`GET /dashboard`** | Due / upcoming / assigned + messages. Per role. |
| **Bidding** | Estimates | **`GET /bids`** | The bid **list**. Not widgets. |

Estimates ≠ dashboard. Do not call `GET /dashboard` or `GET /bids/my-plate` on `/bidding`. Do not turn Estimates into “Assignment waiting” / “Post-bid”.

JWT on every call. Do **not** rebuild bidding engines.

---

## Bidding list (`/bidding` · Estimates)

**`GET /bids`.** One table.

**`admin` / `super_admin` / `bid_clerk`:** show **every bid** (every stage / outcome). Admin always `canEdit: true`. Do not hide Edit. Do not filter by `processStage`. Optional `?teamId=2` still works if you want a team-scoped admin view.

**`captain` / `assistant_estimator` / `user`:** after they have a crew (`user.teamId` from **profile**), Estimates is **that team only**. Same for `GET /bids/export`. No team yet → full list. `?teamId=all` shows every bid.

Do **not** put team setup on Estimates. **Settings → My team** — [FRONTEND_AUTH.md](./FRONTEND_AUTH.md) (`GET/PATCH /auth/team`, contacts `GET /lookups/bidding/contacts`).

```
/bidding          GET /bids     ← Estimates list (this page)
/bidding/new      POST /bids
/bidding/[id]?stage=…
```

Query: `status`, `entityId`, `search`, `processStage`, `workType`, `outcome`, `ownerProjectNumber`, `mechanicalEngineerProjectNumber`, `teamId` (`number` or `all`).

**Export:** `GET /bids/export` — same query params as `GET /bids` (including captain auto-team). Returns `.xlsx` (`Content-Disposition: attachment; filename="bids.xlsx"`). Put an Export button on Estimates; pass the current table filters. Do not export from the dashboard widgets.

Row: `dueDate`, `dueTime`, `teamId`, `canEdit`, `isNew`, `takeoffAssigned`, `takeoffReceived`, …

| `canEdit` | Rule |
|-----------|------|
| `admin` / `super_admin` | Always `true` |
| Bid `teamId` is null | Anyone may edit (intake) |
| Bid `teamId` set | Only `user.teamId === row.teamId` |

Team label: `GET /lookups/bidding/teams` + `row.teamId`.  
Captain sets crew in **Settings → My team**: `GET/PATCH /auth/team` (people from `GET /connecteam/users`). Admin can still `PATCH /admin/users/:id` `{ "teamId" }`.

**If Estimates still looks like “Estimating management / Assignment waiting / Post-bid / Empty queue” — that is wrong. Replace with one full bid table.**

---

## Dashboard (separate page — not Estimates)

**`GET /dashboard`** (JWT). Same JSON as `GET /bids/my-plate` — prefer `/dashboard` so it is not mixed with Estimates.

```http
GET /dashboard
Authorization: Bearer <access_token>
```

```json
{
  "role": "captain",
  "plateId": "captain",
  "title": "Captain dashboard",
  "hint": "Your team’s setup / takeoff / proposal. Takeoff sent vs back is on Assigned.",
  "teamId": 2,
  "counts": {
    "due": 1,
    "upcoming": 2,
    "assigned": 8,
    "unreadMessages": 3,
    "notifications": 4
  },
  "groups": [
    {
      "id": "due",
      "title": "Due",
      "columns": [
        { "key": "estimateNumber", "label": "Bid #" },
        { "key": "bidName", "label": "Project" },
        { "key": "dueDate", "label": "Due date" },
        { "key": "dueTime", "label": "Due time" },
        { "key": "teamId", "label": "Team" },
        { "key": "processStage", "label": "Stage" },
        { "key": "isNew", "label": "New" },
        { "key": "canEdit", "label": "Edit" }
      ],
      "rows": []
    },
    { "id": "upcoming", "title": "Upcoming", "columns": [], "rows": [] },
    { "id": "assigned", "title": "Assigned", "columns": [], "rows": [] }
  ],
  "messages": {
    "totalUnread": 3,
    "items": [
      {
        "conversationId": "abc",
        "title": "Mike",
        "type": "private",
        "lastMessageAt": "2026-09-10T12:00:00.000Z",
        "lastMessagePreview": "drawings are in",
        "lastMessageSenderName": "Mike",
        "unreadCount": 2
      }
    ]
  },
  "notifications": [
    { "kind": "message", "title": "Mike", "body": "drawings are in", "conversationId": "abc", "at": "…" },
    { "kind": "due", "title": "Weinberg", "body": "Due 2026-09-10", "bidId": "12", "at": "2026-09-10" },
    { "kind": "new_bid", "title": "Weinberg", "body": "Updated in the last 7 days", "bidId": "12" },
    { "kind": "comment_mention", "title": "Hassan Riaz mentioned you", "body": "see drawings", "bidId": "12", "commentId": 44, "at": "…" }
  ]
}
```

Render `title` / `hint` / `groups[]` / `messages` / `notifications`. Do not re-filter. Empty widgets are OK.

Row click → `/bidding/:id?stage=` + `row.processStage`. Hide Edit when `canEdit === false`. Captain assigned columns include `takeoffAssigned` / `takeoffReceived`.

| `user.role` | Due / upcoming | `assigned` widget |
|-------------|----------------|-------------------|
| `bid_clerk` | Intake with a due date | Intake queue |
| `admin` / `super_admin` | Bids with a due date | All bids |
| `captain` | Team setup / takeoff / proposal | Same + takeoff sent/back |
| `assistant_estimator` / `user` | Team setup + takeoff | Same |
| `project_manager` / `operations_manager` | Awarded jobs | Awarded list |

Captain / AE: `user.teamId` set → that crew. Null → those stages for all teams.

Due = overdue + today. Upcoming = next 7 days.

`messages` = Connecteam unread preview. Not a new inbox. `process-meta.defaults.notifications` stays false.

`kind: "comment_mention"` = someone @mentioned this user on a bid comment. Click `bidId` → Notes drawer. Clears when they `GET /bids/:id/comments`. See [FRONTEND_BID_COMMENTS.md](./FRONTEND_BID_COMMENTS.md).

Login `user.teamId` / `role` / `permissions[]`: [FRONTEND_AUTH.md](./FRONTEND_AUTH.md) · [FRONTEND_RBAC.md](./FRONTEND_RBAC.md). Admin JWT has every permission — do not hide app tabs for admin.

---

## Do not

- Put `GET /dashboard` or `GET /bids/my-plate` on the Estimates / bidding list
- Filter `GET /bids` by role or stage for **admin** (captain/AE *are* team-filtered — that is correct)
- Keep “Assignment waiting” + “Post-bid” as the Estimates page
- Use `GET /bids` as the dashboard
- Call `GET /bids/my-plate` as `GET /bids/:id`
