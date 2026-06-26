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
    "firstName": "Jane",
    "lastName": "Doe",
    "email": "jane@goelservices.com",
    "employeeId": "12345",
    "isArchived": false
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

## 4. Read APIs (lists & reports)

All list endpoints support pagination where noted. Response field names are **camelCase** (TypeORM entities).

### 4.1 Users

```
GET /connecteam/users?search=&page=1&pageSize=50&includeArchived=false
```

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
      "appUserId": 42
    }
  ]
}
```

### 4.2 Jobs

```
GET /connecteam/jobs?search=&page=1&pageSize=50&includeDeleted=false
```

Key fields: `jobId` (Connecteam string id), `code`, `normalizedJobNumber`, `title`, `refJobId`, `companyLabel`, `gpsAddress`.

**Job detail tab:** `GET /connecteam/time-activities?jobId=<jobId>` and `GET /connecteam/scheduled-shifts?jobId=<jobId>`.

Or via our job: find Connecteam job where `refJobId === job.id` or `normalizedJobNumber` matches.

### 4.3 Time clocks

```
GET /connecteam/time-clocks?includeArchived=false
```

```json
{ "timeClocks": [{ "timeClockId": 123, "name": "Field Crew", "isArchived": false }] }
```

Store default `timeClockId` in app settings or pick the first non-archived clock.

### 4.4 Time activities (worked hours)

```
GET /connecteam/time-activities?timeClockId=&userId=&jobId=&page=1&pageSize=50
```

Row fields: `timeClockId`, `shiftId`, `userId`, `jobId`, `startTimestamp`, `endTimestamp` (Unix **seconds**, often string), `durationMinutes`, `employeeNote`, `managerNote`, `recordSource` (`sync` | `native`).

**Open shift:** `endTimestamp === null` means user is clocked in.

### 4.5 Schedulers & scheduled shifts

```
GET /connecteam/schedulers
GET /connecteam/scheduled-shifts?schedulerId=&jobId=&userId=&page=1&pageSize=50
```

`assignedUserIdsJson` is a JSON string array of Connecteam user ids, e.g. `"[9170357,9170358]"` — `JSON.parse` on the client.

Timestamps: `startTime`, `endTime` = Unix seconds.

### 4.6 Forms & submissions

```
GET /connecteam/forms?search=&page=1&pageSize=50
GET /connecteam/form-submissions?formId=&userId=&page=1&pageSize=50
```

`summaryJson` on submissions is a JSON string of answers.

### 4.7 Time off

```
GET /connecteam/time-off?userId=&status=pending&page=1&pageSize=50
```

`status`: `pending` | `approved` | `denied`. Dates: `startDate`, `endDate` as `YYYY-MM-DD`.

### 4.8 Tasks

```
GET /connecteam/task-boards
GET /connecteam/tasks?taskBoardId=&status=&search=&page=1&pageSize=50
```

`userIdsJson` — JSON string array of assigned user ids.

### 4.9 Conversations (team chats / channels)

```
GET /connecteam/conversations?search=&type=&page=1&pageSize=50
```

Types from Connecteam: typically `team`, `channel`. **Private DMs are not listed** by Connecteam’s API.

### 4.10 Reports

```
GET /connecteam/reports/hours-by-job?jobId=&normalizedJobNumber=&limit=50
GET /connecteam/reports/hours-by-user?userId=&limit=50
```

```json
{ "rows": [{ "jobId": "...", "normalizedJobNumber": "02768", "totalHours": 120.5, "shiftCount": 45 }] }
```

---

## 5. Write APIs

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

**List conversations** — §4.9.

**Messages:**

```
GET /connecteam/conversations/:conversationId/messages?page=1&pageSize=50
```

```json
{
  "page": 1,
  "pageSize": 50,
  "total": 12,
  "source": "local",
  "messages": [
    {
      "messageId": "1",
      "conversationId": "conv-abc",
      "userId": 9170357,
      "appUserId": 42,
      "body": "Heading to site",
      "sentAt": "2026-06-20T15:00:00.000Z",
      "recordSource": "native"
    }
  ]
}
```

`source`: `local` (SQL) or `connecteam` (live API fallback when SQL empty).

**Send:**

```
POST /connecteam/conversations/:conversationId/messages
```

```json
{ "body": "On my way", "userId": 9170357 }
```

**Create app-native channel (optional):**

```
POST /connecteam/conversations
```

```json
{ "title": "Job 2768 Crew", "type": "team" }
```

Returns `conversationId` like `app-<uuid>`.

#### Chat limitations (important)

| Topic | Detail |
|-------|--------|
| Connecteam history | Full message history is **not** pre-synced to SQL yet |
| Connecteam Expert plan | Chat API may require Connecteam Expert — server env dependent |
| Private DMs | Not in conversation list; Connecteam API limitation |
| Real-time | No WebSocket today — **poll** `GET .../messages` every 15–30s or on focus |
| Connecteam send | Server pushes to Connecteam only when `CONNECTEAM_WRITE_THROUGH=true` |

Plan UI for **team/channel chats** first; treat DMs as out of scope until backend adds private-message support.

---

## 6. Recommended UI structure

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

## 7. Data conventions

| Topic | Rule |
|-------|------|
| Timestamps | Unix **seconds** (not ms). API may return as string for large ints. |
| IDs | Connecteam ids are strings (`jobId`, `shiftId`). Native app ids: `app-<uuid>`. |
| `recordSource` | `sync` = from Connecteam mirror; `native` = created on our site |
| JSON columns | `assignedUserIdsJson`, `userIdsJson`, `summaryJson` — parse on client |
| Timezones | IANA, e.g. `America/Los_Angeles` |

---

## 8. Error handling

| HTTP | Meaning |
|------|---------|
| `401` | Missing/invalid JWT |
| `403` | Wrong user (e.g. clock-in for someone else) or non-admin on admin route |
| `404` | Time clock, shift, form, conversation not found |
| `400` | Validation / business rule (already clocked in, etc.) |

Show Connecteam link errors clearly: “Ask admin to link your email to workforce roster.”

---

## 9. What frontend should NOT do

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

## 12. Open questions / future backend work

- Full Connecteam **message history sync** + chat webhooks (for reliable chat without polling Connecteam).
- WebSocket or SSE for live chat notifications.
- Form field definitions API (currently name-only in mirror).
- Offline punch queue contract for PWA.

Coordinate with backend before building chat-heavy or form-builder UIs.
