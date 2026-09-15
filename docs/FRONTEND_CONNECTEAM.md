# Workforce / Connecteam API (Frontend Handoff)

Connecteam workforce data is mirrored to our SQL database. The **frontend never calls Connecteam directly** — only our REST API under `/connecteam/*`.

**Base URL:** Same as the rest of the API (e.g. `http://localhost:3000` in development).

**Authentication:** JWT on all endpoints:

```
Authorization: Bearer <access_token>
```

**Auth reference:** [FRONTEND_AUTH.md](./FRONTEND_AUTH.md) · **Roles:** [FRONTEND_RBAC.md](./FRONTEND_RBAC.md) (`role: "admin"` vs `"user"`)

---

## 1. Big picture

| Layer | What it does |
|-------|----------------|
| Connecteam (optional) | Source during transition; sync pulls data every ~6h |
| Our SQL | Source of truth for the website |
| `/connecteam/*` | Read mirror + write APIs for clock, schedule, PTO, forms, tasks, chat |

**Long-term:** Connecteam can be turned off. Records created on our site use IDs like `app-<uuid>` and keep working.

**Job linking:** Connecteam jobs may have `refJobId` (FK to `Ref_Jobs`) and `normalizedJobNumber` (5-digit job #). Use these to show workforce data on the **Job detail** page.

---

## 2. Check module status (first call)

```
GET /connecteam/status
```

**Response (example):**

```json
{
  "module": "connecteam",
  "ready": true,
  "configured": "true",
  "lastSyncAt": "2026-06-20T12:30:00.000Z",
  "message": "Workforce mirror + write API..."
}
```

- `ready` / `configured` → show Workforce UI or “not configured” banner.
- Do **not** expose `POST /connecteam/sync` to regular users (admin/dev only).

---

## 3. User identity (portal ↔ Connecteam)

Portal users (`App_Users`) are separate from Connecteam roster users (`Connecteam_Users`).

### 3.1 Resolve current user

```
GET /connecteam/users/me
```

```json
{
  "linked": true,
  "connecteamUser": {
    "userId": 9170357,
    "displayName": "Jane Doe",
    "initials": "JD",
    "firstName": "Jane",
    "lastName": "Doe",
    "email": "jane@goelservices.com",
    "employeeId": "12345",
    "phoneNumber": "+1...",
    "userType": "user",
    "profilePictureUrl": "https://...",
    "isArchived": false,
    "appUserId": 42
  }
}
```

If `linked: false`, show “Workforce profile not linked” and block clock-in (or admin link flow).

**Linking rules (backend):**

1. `Connecteam_Users.AppUserId` matches portal user id, **or**
2. Email match (case-insensitive)

### 3.2 Admin: manual link

```
PATCH /connecteam/users/:userId/link-app-user
```

```json
{ "appUserId": 42 }
```

**Auth:** `admin` only.

---

## 4. UI display contract (read first)

**Rule:** Every list/detail row is UI-ready. Use **labels and nested objects** for display. Keep raw IDs only for API writes, filters, and keys — never as the primary visible text.

### 4.0 Standard nested shapes

**`user` (employee)** — on time activities, shifts, PTO, forms, messages, tasks:

```json
{
  "userId": 9170357,
  "displayName": "Jane Doe",
  "initials": "JD",
  "firstName": "Jane",
  "lastName": "Doe",
  "email": "jane@goelservices.com",
  "employeeId": "12345",
  "phoneNumber": null,
  "userType": "user",
  "profilePictureUrl": "https://..."
}
```

**`job` (Connecteam job)** — on time activities, scheduled shifts, jobs list:

```json
{
  "jobId": "job-456",
  "jobLabel": "02768 — Hospital HVAC Rough-in",
  "title": "Hospital HVAC Rough-in",
  "code": "2768",
  "normalizedJobNumber": "02768",
  "companyLabel": "Goel Services",
  "gpsAddress": "123 Main St",
  "refJobId": 42,
  "refJob": {
    "id": 42,
    "jobNumber": "02768",
    "name": "Hospital HVAC",
    "jobAddress": "123 Main St",
    "city": "San Jose",
    "isActive": true
  }
}
```

`refJob` links to our **`Ref_Jobs`** record — use for Job detail navigation (`/jobs/42`).

**Timing** (time activities & scheduled shifts):

| Field | UI use |
|-------|--------|
| `startAt` / `endAt` | ISO 8601 — format with locale (`new Date(startAt)`) |
| `isOpen` | `true` = currently clocked in |
| `durationHours` | Show `"8.5 hrs"` (preferred over raw minutes) |
| `durationMinutes` | Fallback |

**Row labels** (single string for table title column):

| Endpoint | Primary column |
|----------|----------------|
| Time activity | `shiftLabel` |
| Scheduled shift | `shiftLabel` |
| Task | `taskLabel` |
| Conversation | `conversationLabel` |
| Time off | `user.displayName` + `dateRangeLabel` |
| Form submission | `formName` + `submittedByName` |
| Message | `senderName` + `body` |

### 4.1 What to show where (cheat sheet)

| Screen | Show this | Not this |
|--------|-----------|----------|
| Crew list | `displayName`, `email`, `employeeId`, avatar from `profilePictureUrl` / `initials` | `userId` |
| Job picker | `jobLabel`, `companyLabel` | `jobId` |
| Hours table | `user.displayName`, `job.jobLabel`, `startAt`–`endAt`, `durationHours` | raw timestamps |
| Schedule | `shiftLabel`, `assignedUserNames.join(', ')`, `startAt`–`endAt` | `assignedUserIdsJson` |
| PTO inbox | `user.displayName`, `dateRangeLabel`, `status` | `userId` |
| Reports | `jobLabel` / `displayName`, `totalHours` | `totalMinutes` only |

---

## 5. Read APIs (lists & reports)

All list endpoints support pagination where noted. Response field names are **camelCase**.

### 5.1 Users

```
GET /connecteam/users?pageSize=all
GET /connecteam/users?search=&page=1&pageSize=50&includeArchived=false
```

Captain Settings dropdown (and any people picker that cannot page): **`?pageSize=all`** — every non-archived user, `users.length === total`. Numeric `page` / `pageSize` still pages (max 200) for tables.

```json
{
  "page": 1,
  "pageSize": 50,
  "total": 314,
  "users": [
    {
      "userId": 9170357,
      "firstName": "Jane",
      "lastName": "Doe",
      "email": "jane@goelservices.com",
      "phoneNumber": null,
      "userType": "user",
      "employeeId": "12345",
      "isArchived": false,
      "appUserId": 42,
      "displayName": "Jane Doe"
    }
  ]
}
```

### 5.2 Jobs

```
GET /connecteam/jobs?search=&page=1&pageSize=50&includeDeleted=false
```

Each job includes **`jobLabel`** for display (e.g. `"02768 — Hospital HVAC Rough-in"`), plus `title`, `code`, `normalizedJobNumber`, `refJobId`, `companyLabel`, `gpsAddress`.

**Job detail tab:** `GET /connecteam/time-activities?jobId=<jobId>` — rows include nested `job.jobLabel` and `user.displayName`.

### 5.3 Time clocks

```
GET /connecteam/time-clocks?includeArchived=false
```

```json
{ "timeClocks": [{ "timeClockId": 123, "name": "Field Crew", "isArchived": false }] }
```

Store default `timeClockId` in app settings or pick the first non-archived clock.

### 5.4 Time activities (worked hours)

```
GET /connecteam/time-activities?timeClockId=&userId=&jobId=&page=1&pageSize=50
```

**Example row (display fields highlighted):**

```json
{
  "shiftId": "abc-123",
  "userId": 9170357,
  "jobId": "job-456",
  "startTimestamp": "1736924400",
  "endTimestamp": null,
  "durationMinutes": null,
  "user": {
    "userId": 9170357,
    "displayName": "Jane Doe",
    "firstName": "Jane",
    "lastName": "Doe",
    "email": "jane@goelservices.com",
    "employeeId": "12345"
  },
  "job": {
    "jobId": "job-456",
    "jobLabel": "02768 — Hospital HVAC",
    "title": "Hospital HVAC",
    "normalizedJobNumber": "02768",
    "refJobId": 42
  },
  "timeClockName": "Field Crew"
}
```

**Open shift:** `endTimestamp === null` means user is clocked in.

### 5.5 Schedulers & scheduled shifts

```
GET /connecteam/schedulers
GET /connecteam/scheduled-shifts?schedulerId=&jobId=&userId=&page=1&pageSize=50
```

Each shift includes `shiftLabel`, `schedulerName`, `startAt`/`endAt`/`durationHours`, nested `job`, **`assignedUsers`**, and **`assignedUserNames`** (string array for chips).

### 5.6 Forms & submissions

```
GET /connecteam/forms?search=&page=1&pageSize=50
GET /connecteam/form-submissions?formId=&userId=&page=1&pageSize=50
```

Each submission includes `formName`, `submittedByName`, `submittedAtIso`, parsed **`answers`** object (from `summaryJson`), and nested `user`.

### 5.7 Time off

```
GET /connecteam/time-off?userId=&status=pending&page=1&pageSize=50
```

Each row includes `user`, **`dateRangeLabel`** (e.g. `"2026-07-01 → 2026-07-03"`), and optional **`durationLabel`**.

### 5.8 Tasks

```
GET /connecteam/task-boards
GET /connecteam/tasks?taskBoardId=&status=&search=&page=1&pageSize=50
```

Each task includes `taskLabel`, `taskBoardName`, `assignedUsers`, `assignedUserNames`, `startAt`, `dueAt`.

### 5.9 Conversations

```
GET /connecteam/conversations?search=&type=&page=1&pageSize=50
```

Types from Connecteam: typically `team`, `channel`. **Private DMs are not listed** by Connecteam’s API.

Each row includes **`conversationLabel`** and **`typeLabel`**.

### 5.10 Reports

```
GET /connecteam/reports/hours-by-job?jobId=&normalizedJobNumber=&limit=50
GET /connecteam/reports/hours-by-user?userId=&limit=50
```

```json
{
  "rows": [{
    "jobLabel": "02768 — Hospital HVAC",
    "normalizedJobNumber": "02768",
    "companyLabel": "Goel Services",
    "totalHours": 120.5,
    "totalMinutes": 7230,
    "shiftCount": 45,
    "refJob": { "id": 42, "name": "Hospital HVAC", "jobNumber": "02768" }
  }]
}
```

`hours-by-user` rows include `displayName`, `initials`, `employeeId`, **`totalHours`**.

---

## 6. Write APIs

Writes save to **our SQL first**. Optional Connecteam push is server-side (`CONNECTEAM_WRITE_THROUGH`); frontend does not set this.

### 5.1 Permissions summary

| Action | Who |
|--------|-----|
| Clock in / out (self) | Linked user (`userId` must match `/users/me`) |
| Clock in / out (others) | `admin` |
| Manual time entry / patch own hours | Linked user or `admin` |
| Schedule shifts CRUD | `admin` |
| PTO request | Linked user (own `userId`) |
| PTO approve/deny | `admin` |
| Form submit | Linked user (own `userId`) |
| Tasks CRUD | `admin` |
| Chat send | Authenticated; `userId` optional (defaults from link) |
| Create conversation | Any authenticated user |

### 5.2 Clock in / out

**Check open shift first:**

```
GET /connecteam/time-clocks/:timeClockId/open-shift?userId=9170357
```

```json
{ "openShift": { "shiftId": "abc-123", "startTimestamp": "1736924400", "endTimestamp": null } }
```

**Clock in:**

```
POST /connecteam/time-clocks/:timeClockId/clock-in
```

```json
{
  "userId": 9170357,
  "jobId": "optional-connecteam-job-id",
  "timezone": "America/Los_Angeles",
  "timestamp": 1736924400,
  "schedulerShiftId": "optional",
  "locationData": { "latitude": 37.77, "longitude": -122.42 }
}
```

`timestamp` optional (server now). Max ~12h in the past when using Connecteam write-through.

**Clock out:**

```
POST /connecteam/time-clocks/:timeClockId/clock-out
```

```json
{
  "userId": 9170357,
  "timezone": "America/Los_Angeles",
  "timestamp": 1736953200,
  "locationData": {}
}
```

**Response:**

```json
{ "ok": true, "timeActivity": { "shiftId": "...", "endTimestamp": "1736953200", "durationMinutes": 480 } }
```

**Errors:** `400` if already clocked in / no open shift. `403` if wrong user.

### 5.3 Manual time entry (manager corrections)

```
POST /connecteam/time-clocks/:timeClockId/time-activities
```

```json
{
  "userId": 9170357,
  "startTimestamp": 1704110400,
  "endTimestamp": 1704139200,
  "startTimezone": "America/Los_Angeles",
  "endTimezone": "America/Los_Angeles",
  "jobId": "job-123",
  "employeeNote": "Forgot to clock",
  "managerNote": "Approved"
}
```

```
PATCH /connecteam/time-clocks/:timeClockId/time-activities/:shiftId
```

Partial body — any of `startTimestamp`, `endTimestamp`, `jobId`, notes.

### 5.4 Scheduled shifts (admin)

```
POST /connecteam/schedulers/:schedulerId/shifts
```

```json
{
  "startTime": 1704110400,
  "endTime": 1704139200,
  "title": "Job 2768 - Rough-in",
  "jobId": "connecteam-job-id",
  "timezone": "America/Los_Angeles",
  "isPublished": true,
  "isOpenShift": false,
  "assignedUserIds": [9170357, 9170358],
  "locationAddress": "123 Main St"
}
```

```
PATCH /connecteam/schedulers/:schedulerId/shifts/:shiftId
DELETE /connecteam/schedulers/:schedulerId/shifts/:shiftId
```

### 5.5 Time off

**Request (employee):**

```
POST /connecteam/time-off
```

```json
{
  "userId": 9170357,
  "startDate": "2026-07-01",
  "endDate": "2026-07-03",
  "isAllDay": true,
  "employeeNote": "Vacation",
  "timezone": "America/Los_Angeles"
}
```

**Approve/deny (admin):**

```
PATCH /connecteam/time-off/:requestId/status
```

```json
{ "status": "approved", "managerNote": "Enjoy" }
```

### 5.6 Forms

```
POST /connecteam/forms/:formId/submissions
```

```json
{
  "userId": 9170357,
  "answers": { "field_1": "yes", "field_2": "notes here" },
  "status": "submitted"
}
```

Form **definitions** are not fully mirrored (only id + name). For rich form UI, coordinate with backend on which forms to support or build static forms per `formId`.

### 5.7 Tasks (admin)

```
POST /connecteam/task-boards/:taskBoardId/tasks
```

```json
{
  "title": "Submit daily log",
  "status": "open",
  "dueDate": 1704240000,
  "userIds": [9170357],
  "descriptionSummary": "End of day"
}
```

```
PATCH /connecteam/task-boards/:taskBoardId/tasks/:taskId
DELETE /connecteam/task-boards/:taskBoardId/tasks/:taskId
```

### 5.8 Chat

> **Full live-chat handoff (recommended for frontend):** [FRONTEND_CONNECTEAM_CHAT.md](./FRONTEND_CONNECTEAM_CHAT.md) — architecture, polling vs WebSocket options, APIs, UI checklist, limitations.

Chat is **SQL-backed**. Connecteam has **no GET message-history API** — new Connecteam messages arrive via **webhook** into `Connecteam_Messages`. App-native messages (`app-*` conversations) are stored directly.

#### Conversation list (inbox-style)

```
GET /connecteam/conversations?search=&type=&page=1&pageSize=50
GET /connecteam/conversations/:conversationId
```

Each conversation includes:

| Field | UI use |
|-------|--------|
| `conversationLabel` | Row title |
| `lastMessagePreview` | Subtitle / snippet |
| `lastMessageSenderName` | "Jane: …" prefix |
| `lastMessageAtIso` | Sort + "2h ago" |
| `messageCount` | Badge (optional) |
| `type` | `team`, `channel`, `private` |

Sort: most recent `lastMessageAt` first (backend default).

#### Messages thread

```
GET /connecteam/conversations/:conversationId/messages?page=1&pageSize=50&includeDeleted=false
```

Each message includes `senderName`, `user`, `body`, `sentAtIso`, `attachments` (array), `messageType`, `isDeleted`.

**Send:**

```
POST /connecteam/conversations/:conversationId/messages
{ "body": "On my way", "userId": 9170357 }
```

**Create app-native channel:**

```
POST /connecteam/conversations
{ "title": "Job 2768 Crew", "type": "team" }
```

Returns `conversationId` like `app-<uuid>`.

#### Connecteam webhook setup (ops / admin — one time)

1. `.env`:
   ```env
   CONNECTEAM_WEBHOOK_PUBLIC_URL=https://your-api.example.com/connecteam/webhooks/inbound
   CONNECTEAM_WEBHOOK_SECRET=<long-random-string>
   CONNECTEAM_WRITE_THROUGH=true   # optional: also send to Connecteam app
   ```
2. Run migration: `npm run connecteam-migrate`
3. Register webhook (admin JWT):
   ```
   POST /connecteam/webhooks/register-chat
   ```
4. Connecteam must enable **chat webhooks (Beta)** on your company account.

Inbound: `POST /connecteam/webhooks/inbound` (public, `x-webhook-secret` header).

#### Chat UI notes

| Topic | Detail |
|-------|--------|
| History before webhook | **Not available** — only messages after webhook is live are mirrored |
| Private DMs | Appear via webhook even if not in initial conversation sync |
| Real-time | Poll inbox + thread every **15–30s** (no WebSocket yet) |
| Expert plan | Connecteam chat API/webhooks may require Expert tier |
| Display | Use `senderName`, `conversationLabel`, `lastMessagePreview` — never raw IDs |

---

## 7. Recommended UI structure

### 6.1 Top-level **Workforce** workspace

| Screen | APIs |
|--------|------|
| Overview | `/status`, `/reports/hours-by-job`, open shifts |
| My day | `/users/me`, open-shift, clock-in/out |
| Crew roster | `/users` |
| Schedule | `/schedulers`, `/scheduled-shifts` |
| Time off | `/time-off` + POST/PATCH |
| Forms | `/forms`, submissions |
| Tasks | `/task-boards`, `/tasks` |
| Chat | `/conversations`, messages |

### 6.2 **Job detail** tab (“Workforce”)

Filter by Connecteam `jobId` or resolve via `refJobId` / `normalizedJobNumber`:

- Hours summary → `/reports/hours-by-job?normalizedJobNumber=02768`
- Recent punches → `/time-activities?jobId=...`
- Upcoming shifts → `/scheduled-shifts?jobId=...`

### 6.3 Mobile / field worker (priority)

1. `GET /users/me` — must be linked  
2. `GET /time-clocks` — pick clock  
3. `GET open-shift` — show CLOCK IN vs CLOCK OUT button  
4. Optional job picker from `/jobs?search=` before clock-in  
5. Offline queue (future): store punches locally, replay with `timestamp` when online  

---

## 8. Data conventions

| Topic | Rule |
|-------|------|
| Timestamps | Unix **seconds** (not ms). API may return as string for large ints. |
| IDs | Connecteam ids are strings (`jobId`, `shiftId`). Native app ids: `app-<uuid>`. |
| `recordSource` | `sync` = from Connecteam mirror; `native` = created on our site |
| JSON columns | `assignedUserIdsJson`, `userIdsJson`, `summaryJson` — prefer enriched `assignedUsers` / `user` / `formName` when present |
| Timezones | IANA, e.g. `America/Los_Angeles` |

---

## 9. Error handling

| HTTP | Meaning |
|------|---------|
| `401` | Missing/invalid JWT |
| `403` | Wrong user (e.g. clock-in for someone else) or non-admin on admin route |
| `404` | Time clock, shift, form, conversation not found |
| `400` | Validation / business rule (already clocked in, etc.) |

Show Connecteam link errors clearly: “Ask admin to link your email to workforce roster.”

---

## 10. What frontend should NOT do

- Do not call `api.connecteam.com` or embed Connecteam widgets (unless product explicitly wants hybrid).
- Do not store `CONNECTEAM_API_KEY` in the browser.
- Do not assume data is real-time — mirror refreshes on cron; after writes, use the **write response** or re-fetch the affected list.
- Do not build a full Connecteam clone on v1 — focus: clock, schedule view, PTO, job hours, basic team chat.

---

## 10. Backend setup (for dev/staging)

```bash
npm run connecteam-migrate
npm run sync-connecteam-once   # optional: populate mirror
```

Server `.env` (backend only): `CONNECTEAM_API_KEY`, `CONNECTEAM_SYNC_ENABLED`, optional `CONNECTEAM_WRITE_THROUGH`.

---

## 11. Endpoint quick reference

| Method | Path |
|--------|------|
| GET | `/connecteam/status` |
| POST | `/connecteam/sync` |
| GET | `/connecteam/users/me` |
| PATCH | `/connecteam/users/:userId/link-app-user` |
| GET | `/connecteam/users` |
| GET | `/connecteam/jobs` |
| GET | `/connecteam/time-clocks` |
| GET | `/connecteam/time-activities` |
| GET | `/connecteam/time-clocks/:id/open-shift` |
| POST | `/connecteam/time-clocks/:id/clock-in` |
| POST | `/connecteam/time-clocks/:id/clock-out` |
| POST | `/connecteam/time-clocks/:id/time-activities` |
| PATCH | `/connecteam/time-clocks/:id/time-activities/:shiftId` |
| GET | `/connecteam/schedulers` |
| GET | `/connecteam/scheduled-shifts` |
| POST | `/connecteam/schedulers/:id/shifts` |
| PATCH | `/connecteam/schedulers/:id/shifts/:shiftId` |
| DELETE | `/connecteam/schedulers/:id/shifts/:shiftId` |
| GET | `/connecteam/time-off` |
| POST | `/connecteam/time-off` |
| PATCH | `/connecteam/time-off/:requestId/status` |
| GET | `/connecteam/forms` |
| GET | `/connecteam/form-submissions` |
| POST | `/connecteam/forms/:formId/submissions` |
| GET | `/connecteam/task-boards` |
| GET | `/connecteam/tasks` |
| POST | `/connecteam/task-boards/:id/tasks` |
| PATCH | `/connecteam/task-boards/:id/tasks/:taskId` |
| DELETE | `/connecteam/task-boards/:id/tasks/:taskId` |
| GET | `/connecteam/conversations` |
| POST | `/connecteam/conversations` |
| GET | `/connecteam/conversations/:id/messages` |
| POST | `/connecteam/conversations/:id/messages` |
| GET | `/connecteam/reports/hours-by-job` |
| GET | `/connecteam/reports/hours-by-user` |

---

## 12. Future backend work

- WebSocket/SSE for live chat (replace polling)
- Form field definitions API
- Offline punch queue for PWA

Chat mirroring via webhooks is **implemented** — see §5.8 setup.
