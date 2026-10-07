# Personal calendar

Every login has a calendar at **`/calendar`** (sidebar → Dashboard → **My calendar**). It shows everything the app knows about that person, plus events they add themselves.

- **Access:** people see only their own calendar. Admins (`admin`, `super_admin`) can pick anyone from a dropdown, read-only.
- **Storage:** only custom events are stored (`Calendar_Events`). Everything else is read live from existing tables, so it's always current and never needs re-entering.

Setup: `npm run calendar-migrate` (runs `scripts/sql/add-calendar-events.sql`, which is idempotent).

## What appears

| Source | What | From |
|---|---|---|
| **Bid deadlines** | Bid due (with time), target submit, internal estimate and review due, technical review, pre-bid, estimator bid, login, dead and contract dates, submission, proposal versions, addenda, follow-up date and calls, expected award, awarded, project start and completion, sales activities | `Bids` + `Bid_Content.ProcessJson`, for bids the person is **on** (see below) |
| **Takeoff** | The person's own takeoff assignments: assigned date and due date, scope, status, hours | `process.takeoffAssignments[]` where they're the assignee |
| **Shifts** | Published Connecteam scheduled shifts | `Connecteam_ScheduledShifts` |
| **Clocked time** | Connecteam time-clock shifts | `Connecteam_TimeActivities` |
| **Tasks** | Connecteam tasks with a due date | `Connecteam_Tasks` |
| **Time off** | Connecteam time off (rejected and cancelled requests are hidden) | `Connecteam_TimeOffRequests` |
| **My events** | The person's own events, optionally linked to a bid | `Calendar_Events` |

Connecteam items require the person's Connecteam user to be linked (`Connecteam_Users.AppUserId`).

Clicking an item opens its details. For anything tied to a bid, that includes the project: client, stage, outcome, due date, team, captain, **the person's role(s) on it**, and an **Open bid** link.

### "On the bid"

A bid is on someone's calendar if they hold any of these roles:

- **By user id:** captain (`assignment.captainUserId`), creator of the bid, or member of the bid's team (`App_Users.BidTeamId` = `assignment.teamId`).
- **By name:** captain, assistant estimator, bid clerk, takeoff assignee, takeoff person 1–3, technical review preparer or reviewer, submitted by, follow-up owner, PM, or ops.

Most of these fields store free-text names. They're matched with the crew picker's existing rules (`bid-crew.ts`: case and spacing ignored, first + last name, email, known typo aliases). A partial name such as "Mike" alone doesn't match. If someone is missing a bid, check that the name on it matches their login's first and last name.

Archived and deleted bids are excluded.

## API

All endpoints require a JWT.

| Method | Path | Notes |
|---|---|---|
| GET | `/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD[&userId=]` | Range is at most 400 days. `userId` other than your own requires admin (403 otherwise). |
| GET | `/calendar/people` | Admin only. Person picker. |
| GET | `/calendar/bids` | Bids you're on, for linking an event |
| POST | `/calendar/events` | `{ title, allDay, start, end?, location?, description?, bidId? }` |
| PATCH | `/calendar/events/:id` | Owner only. Anyone else gets 404, including admins. |
| DELETE | `/calendar/events/:id` | Owner only |

Dates and times:

- **All-day events:** `start` and `end` are `YYYY-MM-DD`, and `end` is inclusive.
- **Timed events:** ISO instants.
- **Bid times:** these are wall-clock times without a time zone, for example `2026-09-24T14:00`, and are shown as written.

If one source fails, such as a mirror table that doesn't exist yet, the rest still loads. The source is named in `warnings[]`, and the page shows a notice.

Tests: `npm test` (`src/calendar/calendar.spec.ts`) · frontend `npm run test:calendar`.
