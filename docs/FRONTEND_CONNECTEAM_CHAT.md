# Workforce Live Chat — Frontend Handoff

**Purpose:** Build **live team chat** on our website using our backend only. The browser **never** calls Connecteam (`api.connecteam.com`).

**Related docs:** [FRONTEND_CONNECTEAM.md](./FRONTEND_CONNECTEAM.md) (full workforce module) · [FRONTEND_AUTH.md](./FRONTEND_AUTH.md) · [FRONTEND_RBAC.md](./FRONTEND_RBAC.md)

**Base URL:** Same API host as the rest of the app (e.g. `http://localhost:3000` in dev).

**Auth:** JWT on every endpoint:

```
Authorization: Bearer <access_token>
```

---

## 1. How live chat works (read this first)

Connecteam does **not** offer a WebSocket or browser streaming API for third-party apps. Their “live” mechanism is an **HTTP webhook** that pushes events to **our server** when someone sends/edits/deletes a message in the Connecteam app.

Our backend stores those events in SQL. Your frontend reads from **our REST API**.

```
┌─────────────────┐     webhook (HTTP POST)      ┌──────────────────┐
│  Connecteam app │ ───────────────────────────► │  Our backend     │
│  (mobile/web)   │   message_created, etc.      │  SQL mirror      │
└─────────────────┘                              └────────┬─────────┘
                                                          │
┌─────────────────┐     REST (JWT)                        │
│  Our website    │ ◄───────────────────────────────────┘
│  (your UI)      │   GET conversations / messages
└─────────────────┘   POST send message
```

**Messages sent from our website** are saved in SQL immediately. If `CONNECTEAM_WRITE_THROUGH=true` on the server, the backend also forwards them to Connecteam so mobile app users see them too.

**Bottom line for frontend:** Live chat on the website = **Socket.IO** on `/connecteam-chat` (preferred) or **poll our REST API** (fallback). You do not integrate Connecteam webhooks directly.

---

## 1.1 Bidirectional sync (Connecteam ↔ our site)

**Goal:** Messages typed in Connecteam app appear on our website, and messages sent on our website appear in Connecteam.

| Direction | Mechanism | Server config |
|-----------|-----------|---------------|
| **Connecteam → our site** | Chat webhook → SQL | `CONNECTEAM_WEBHOOK_PUBLIC_URL`, `CONNECTEAM_WEBHOOK_SECRET`, register webhook |
| **Our site → Connecteam** | Write-through on `POST .../messages` | `CONNECTEAM_WRITE_THROUGH=true`, `CONNECTEAM_CHAT_PUBLISHER_ID` |

```
Connecteam app ──webhook──► Our SQL ◄──POST send── Our website
                ◄──write-through── (outbound)
```

**Check if sync is ready (any authenticated user):**

```
GET /connecteam/chat/sync-status
```

```json
{
  "bidirectionalReady": true,
  "inbound": {
    "ready": true,
    "apiKeyConfigured": true,
    "webhookUrlConfigured": true,
    "webhookSecretConfigured": true,
    "steps": ["..."]
  },
  "outbound": {
    "ready": true,
    "writeThroughEnabled": true,
    "publisherIdConfigured": true,
    "steps": ["..."]
  },
  "history": {
    "backfillAvailable": false,
    "note": "Only messages after webhook is live are mirrored inbound."
  }
}
```

Also included on `GET /connecteam/status` as `chatSync`.

**Ops setup (one time on production server):**

1. `.env`:
   ```env
   CONNECTEAM_API_KEY=...
   CONNECTEAM_WEBHOOK_PUBLIC_URL=https://api.yoursite.com/connecteam/webhooks/inbound
   CONNECTEAM_WEBHOOK_SECRET=<long-random-string>
   CONNECTEAM_WRITE_THROUGH=true
   CONNECTEAM_CHAT_PUBLISHER_ID=<custom-publisher-id>
   ```
2. Connecteam UI → **Settings → Feed settings** → create **Custom Publisher** → copy id into `CONNECTEAM_CHAT_PUBLISHER_ID`
3. `npm run connecteam-migrate`
4. Admin: `POST /connecteam/webhooks/register-chat`
5. Ask Connecteam support to enable **chat webhooks (Beta)** on your company

**Frontend:** After send, check `connecteam.sent` in the response. If `false`, message is on our site only — show ops that outbound sync is not configured.

**Not synced:** Old message history before webhook went live; `app-*` native-only channels.

---

## 2. Real-time options (all available paths)

| Option | How it works | Latency | Status | When to use |
|--------|----------------|---------|--------|-------------|
| **C. Our WebSocket (Socket.IO)** | Backend pushes after webhook or send | Near instant | ✅ **Recommended** | Default for live inbox + thread |
| **B. Optimistic send + WS** | Show own message after `POST`; rely on WS for inbound | Instant send + receive | ✅ **Best UX** | Production chat |
| **A. HTTP polling** | `GET` inbox + thread every N seconds | ~5–30s delay | Fallback | If WS blocked by proxy |
| **D. Connecteam WebSocket** | Direct browser ↔ Connecteam | — | ❌ **Does not exist** | Do not plan for this |
| **E. Connecteam webhook in browser** | Frontend receives Connecteam POST | — | ❌ **Wrong layer** | Webhooks are server-to-server only |

### Recommended approach (v1 — WebSocket)

1. On chat screen mount: load conversation list + open thread via REST.
2. Connect Socket.IO to namespace `/connecteam-chat` with JWT (see §2.1).
3. On `chat.message` / `chat.conversation_updated`: merge inbox (sort by `lastMessageAtIso` desc) and append/update thread.
4. On send: `POST` message → append from response (optimistic or server-confirmed); WS will also fire for other tabs/users.
5. On disconnect: optional light poll (30s) as fallback until reconnect.

### 2.1 Socket.IO client (official)

```typescript
import { io, Socket } from 'socket.io-client';

const socket: Socket = io(`${API_ORIGIN}/connecteam-chat`, {
  auth: { token: accessToken }, // same JWT as REST Bearer
  transports: ['websocket', 'polling'],
});

socket.on('chat.message', ({ message, conversation }) => {
  // Upsert conversation at top of inbox (by lastMessageAtIso)
  // If open thread matches conversation.conversationId, append/dedup message
});

socket.on('chat.message_deleted', ({ conversationId, messageId, externalMessageId }) => {
  // Soft-remove from open thread; refresh preview from next conversation_updated if any
});

socket.on('chat.conversation_updated', ({ conversation }) => {
  // Upsert inbox row; re-sort by lastMessageAtIso desc
});
```

**Auth alternatives (any one):** `auth.token`, query `?token=`, or `Authorization: Bearer` handshake header.

**Events (server → client):**

| Event | Payload |
|-------|---------|
| `chat.message` | `{ message, conversation }` — same enriched shapes as REST list/thread |
| `chat.message_deleted` | `{ conversationId, messageId, externalMessageId }` |
| `chat.conversation_updated` | `{ conversation }` — enriched inbox row |

**Proxy note:** TLS terminators / nginx must allow WebSocket upgrade to the API host. Same port as HTTP API (no separate WS port).

### Polling fallback (pseudo-code)

```typescript
// Inbox
const inbox = await fetch('/connecteam/conversations?page=1&pageSize=50', { headers: auth });

// Thread (note: API returns newest first — reverse for chat bubbles)
const thread = await fetch(
  `/connecteam/conversations/${id}/messages?page=1&pageSize=50`,
  { headers: auth },
);
const messagesChronological = [...thread.messages].reverse();

// Send
await fetch(`/connecteam/conversations/${id}/messages`, {
  method: 'POST',
  headers: { ...auth, 'Content-Type': 'application/json' },
  body: JSON.stringify({ body: text }),
});
```

---

## 3. What you can and cannot build

### ✅ Supported in v1

| Feature | Notes |
|---------|--------|
| Team chat inbox | `type: team` — synced from Connecteam + webhook updates |
| Channels | `type: channel` — broadcast-style groups |
| Private DMs | `type: private` — start with `POST /connecteam/conversations/dm/:userId`; thread id is `dm-<userId>` |
| Start a DM from a user picker | `GET /connecteam/users?search=` → `POST /connecteam/conversations/dm/:userId` |
| App-native channels | `conversationId` starts with `app-` — created on our site only |
| Send text messages | `POST .../messages` |
| Create app channel | `POST /connecteam/conversations` (no members) |
| Create real Connecteam group | `POST /connecteam/conversations` with `assignedUserIds` (+ write-through) |
| Show sender names | `senderName`, nested `user` object |
| Attachments (display) | From webhook mirror — show link or `[file: name]` placeholder |
| Deleted messages | Hidden by default; `includeDeleted=true` for admin/debug |
| Edited messages | Webhook `message_updated` updates body in SQL |

### ❌ Not available (do not promise in UI)

| Limitation | Detail |
|------------|--------|
| Message history before webhook went live | Connecteam has **no GET message-history API** — only messages after webhook registration are mirrored |
| Connecteam WebSocket | Not in their API |
| Upload attachments from our site | `POST` send accepts **text only** today (`body` string) |
| Read receipts / typing indicators | Not exposed |
| System / help-desk messages | Skipped server-side (`helpDesk`, `connecteamTips`, system messages) |

---

## 4. Conversation types & IDs

| `type` | Meaning | In initial `GET /conversations`? | Messages source |
|--------|---------|----------------------------------|-----------------|
| `team` | Group chat | ✅ Yes (after sync) | Webhook + send |
| `channel` | Announcement channel | ✅ Yes | Webhook + send |
| `private` | Direct message (`dm-<userId>`) | Via `POST /conversations/dm/:userId` or webhook | privateMessage + webhook |
| (app-native) | Our website channel | ✅ After `POST /conversations` | Our SQL only* |

\* If write-through enabled, outbound messages may also appear in Connecteam.

| `conversationId` pattern | `recordSource` | Meaning |
|--------------------------|----------------|---------|
| Connecteam numeric/string id | `sync` | From Connecteam mirror |
| `app-<uuid>` | `native` | Created on our website |

| `recordSource` (message) | Meaning |
|--------------------------|---------|
| `sync` | Arrived via Connecteam webhook |
| `native` | Sent from our website `POST` |

---

## 5. Prerequisites (before chat works)

### 5.1 User must be linked

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
    "email": "jane@goelservices.com",
    "appUserId": 42
  }
}
```

If `linked: false`, show: *“Workforce profile not linked — ask admin.”* and disable send (read-only inbox may still work for admins).

Linking is automatic when `Connecteam_Users.AppUserId` matches portal user id **or** email matches (case-insensitive). Admin manual link:

```
PATCH /connecteam/users/:userId/link-app-user
{ "appUserId": 42 }
```
(admin only)

### 5.2 Ops / backend (one-time — not frontend code)

For **incoming** Connecteam messages to appear live:

1. Server env:
   ```env
   CONNECTEAM_WEBHOOK_PUBLIC_URL=https://api.yoursite.com/connecteam/webhooks/inbound
   CONNECTEAM_WEBHOOK_SECRET=<long-random-string>
   CONNECTEAM_WRITE_THROUGH=true   # optional: mirror outbound to Connecteam app
   ```
2. DB migration: `npm run connecteam-migrate`
3. Admin registers webhook: `POST /connecteam/webhooks/register-chat` (JWT admin)
4. Connecteam must enable **chat webhooks (Beta)** on the company account (often Expert plan)

Frontend team: surface a friendly empty state if inbox has only stale sync data and no messages — *“Chat mirroring may not be configured yet.”*

---

## 6. API reference

### 6.1 List conversations (inbox)

```
GET /connecteam/conversations?search=&type=&page=1&pageSize=50&includeDeleted=false
```

| Query | Description |
|-------|-------------|
| `search` | Matches title / preview text |
| `type` | Filter: `team`, `channel`, `private` |
| `page`, `pageSize` | Pagination (default page 1, size 50) |
| `includeDeleted` | `true` = include soft-deleted threads |

**Response:**

```json
{
  "page": 1,
  "pageSize": 50,
  "total": 12,
  "conversations": [
    {
      "conversationId": "abc123",
      "title": "Crew — Job 2768",
      "type": "team",
      "conversationSource": "connecteam",
      "recordSource": "sync",
      "isDeleted": false,
      "lastMessageAt": "2026-06-20T15:30:00.000Z",
      "lastMessagePreview": "On my way",
      "lastMessageSenderName": "Jane Doe",
      "messageCount": 48,
      "conversationLabel": "Crew — Job 2768",
      "typeLabel": "team",
      "lastMessageAtIso": "2026-06-20T15:30:00.000Z"
    }
  ]
}
```

**UI mapping:**

| Field | Use for |
|-------|---------|
| `conversationLabel` | Row title (prefer over raw `title`) |
| `lastMessagePreview` | Subtitle snippet |
| `lastMessageSenderName` | Prefix: `"Jane: On my way"` |
| `lastMessageAtIso` | Sort + relative time (“2h ago”) |
| `messageCount` | Optional badge |
| `type` / `typeLabel` | Icon: team vs channel vs DM |

Default sort: most recent `lastMessageAt` first (backend).

---

### 6.2 Get one conversation

```
GET /connecteam/conversations/:conversationId
```

```json
{
  "conversation": { "...same shape as list item..." }
}
```

Returns `{ "conversation": null }` if not found or deleted.

---

### 6.3 List messages (thread)

```
GET /connecteam/conversations/:conversationId/messages?page=1&pageSize=50&includeDeleted=false
```

**Important:** Messages are ordered **newest first** (`sentAt DESC`). For chat UI, **reverse the array** so oldest is at top.

**Response:**

```json
{
  "page": 1,
  "pageSize": 50,
  "total": 120,
  "source": "local",
  "messages": [
    {
      "messageId": "1001",
      "conversationId": "abc123",
      "userId": 9170357,
      "appUserId": 42,
      "body": "On my way",
      "sentAt": "2026-06-20T15:30:00.000Z",
      "sentAtIso": "2026-06-20T15:30:00.000Z",
      "recordSource": "native",
      "externalMessageId": "ct-msg-99",
      "isDeleted": false,
      "messageType": "text",
      "modifiedAt": null,
      "senderName": "Jane Doe",
      "user": {
        "userId": 9170357,
        "displayName": "Jane Doe",
        "initials": "JD",
        "firstName": "Jane",
        "lastName": "Doe",
        "email": "jane@goelservices.com"
      },
      "attachments": null
    }
  ]
}
```

**Pagination:** For older history, increment `page`. Cap `pageSize` at 200.

**Dedup keys:** Prefer `messageId` for our rows; for webhook rows also check `externalMessageId` when merging poll results.

---

### 6.4 Send message

```
POST /connecteam/conversations/:conversationId/messages
```

**Body:**

```json
{
  "body": "On my way to the site",
  "userId": 9170357
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `body` | Yes | Max 10,000 chars (our API). Connecteam write-through truncates at 1,000. |
| `userId` | No | Defaults to linked Connecteam user from JWT. Non-admin cannot send as someone else. |

**Response:**

```json
{
  "ok": true,
  "message": {
    "messageId": "1002",
    "body": "On my way to the site",
    "senderName": "Jane Doe",
    "sentAtIso": "2026-06-20T15:31:00.000Z",
    "recordSource": "native",
    "user": { "displayName": "Jane Doe" }
  },
  "connecteam": {
    "sent": true,
    "externalMessageId": "ct-msg-99",
    "error": null
  }
}
```

| `connecteam.sent` | Meaning |
|-------------------|---------|
| `true` | Message was forwarded to Connecteam app (team/channel conversations only) |
| `false` | Saved on our site only — check `connecteam.error` or `GET /connecteam/chat/sync-status` |

**UX:** Append `message` to thread immediately after success. Do not wait for next poll.

**Write-through:** Requires `CONNECTEAM_WRITE_THROUGH=true` + `CONNECTEAM_CHAT_PUBLISHER_ID`. Failures are logged server-side; our SQL row is still created.

---

### 6.5 Create a conversation / group

```
POST /connecteam/conversations
```

```json
{
  "title": "Job 2768 Crew",
  "type": "team",
  "assignedUserIds": [8793726, 8835901],
  "adminUserIds": [8793726]
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `title` | Yes | Group title |
| `type` | No | `team` (all can post) or `channel` (admins post). Default `team`. |
| `assignedUserIds` | No | Connecteam user ids to add as members. **If provided + write-through on → a real Connecteam group is created.** |
| `adminUserIds` | No | Subset of members granted admin rights |

**Two modes:**

| Input | Result | `conversationId` | Reaches Connecteam app? |
|-------|--------|------------------|--------------------------|
| No `assignedUserIds` | App-only channel | `app-<uuid>` | No (our site only) |
| `assignedUserIds` + write-through | **Real Connecteam group** | Connecteam id | Yes — members see it in the app |

**Response:**

```json
{
  "ok": true,
  "conversation": {
    "conversationId": "1a2b3c4d-...",
    "title": "Job 2768 Crew",
    "type": "team",
    "recordSource": "sync",
    "conversationLabel": "Job 2768 Crew",
    "messageCount": 0
  },
  "createdByAppUserId": 42,
  "connecteam": { "sent": true, "error": null }
}
```

- `connecteam.sent = true` → real Connecteam group created; members get it in the app.
- `connecteam.sent = false` → app-only channel (check `connecteam.error`; e.g. write-through off).
- Pick members via `GET /connecteam/users?search=` → collect `userId`s → send as `assignedUserIds`.
- Use the returned `conversationId` for `POST .../messages`.

---

### 6.6 Start / send a direct message (1:1)

```
POST /connecteam/conversations/dm/:userId
```

`:userId` is the **Connecteam** user id (from `GET /connecteam/users?search=`). If a DM with that user already exists it is reused; otherwise a new thread is created.

**Body:** same as send message — `{ "body": "Hi Omar" }`.

**Response:**

```json
{
  "ok": true,
  "conversation": {
    "conversationId": "dm-8793726",
    "title": "Omar Campos",
    "type": "private",
    "recordSource": "native",
    "conversationLabel": "Omar Campos"
  },
  "message": { "messageId": "1010", "body": "Hi Omar", "sentAtIso": "..." },
  "connecteam": { "sent": true, "externalMessageId": null, "error": null }
}
```

**Key points:**

- DM threads use the id **`dm-<connecteamUserId>`** — stable per person, both directions land here.
- To keep chatting, use the normal send endpoint with that id: `POST /connecteam/conversations/dm-8793726/messages`.
- Requires `CONNECTEAM_WRITE_THROUGH=true` + `CONNECTEAM_CHAT_PUBLISHER_ID` to reach Connecteam. Without it the message is saved locally and `connecteam.sent` is `false`.
- Connecteam's private-message API returns no message id, so `externalMessageId` is usually `null` — this is **not** a failure; rely on `connecteam.sent`.

**Roster picker flow:** `GET /connecteam/users?search=name` → pick user → `POST /connecteam/conversations/dm/:userId` with first message.

---

## 7. UI screens to build

### 7.1 Chat inbox

- Fetch `GET /connecteam/conversations`
- Row: `conversationLabel`, `lastMessageSenderName` + `lastMessagePreview`, `lastMessageAtIso`
- Filter tabs (optional): All / Teams / Channels / DMs → `type` query param
- Search box → `search` query param
- Poll every 10–15s when screen visible
- Empty state copy if `total === 0`

### 7.2 Message thread

- Header: `conversationLabel`, optional `typeLabel`
- Message list: reversed chronological order
- Bubble alignment: compare `message.userId` or `message.appUserId` to current user from `GET /users/me`
- Show `senderName` in group chats; hide in 1:1 DMs if desired
- Composer: text input + Send → `POST .../messages`
- Scroll: stick to bottom on send; preserve scroll position when loading older pages
- Poll every 10–15s while thread open

### 7.3 New channel (optional v1)

- Form: title → `POST /connecteam/conversations`
- Navigate to new thread

### 7.4 Attachments (display only)

Webhook may store:

```json
"attachments": [
  { "type": "image", "url": "https://...", "fileName": "photo.jpg", "fileSize": 12345 }
]
```

Render:

- `image` + `url` → thumbnail / link
- Otherwise → `[file: photo.jpg]` or use `body` if already formatted that way
- No upload UI in v1

---

## 8. Display rules (never show raw IDs)

| Show | Do not show as primary label |
|------|------------------------------|
| `conversationLabel` | `conversationId` |
| `senderName` or `user.displayName` | `userId` |
| `lastMessagePreview` | — |
| `sentAtIso` formatted | raw `sentAt` unless debugging |

Use `user.initials` for avatars when no `profilePictureUrl`.

---

## 9. Auth & permissions

| Action | Who |
|--------|-----|
| Read conversations/messages | Any authenticated user with JWT |
| Send message | Linked user; `userId` must be self unless `admin` |
| Create app conversation | Any authenticated user |
| Register webhook | `admin` only (ops) |
| Link workforce user | `admin` only |

| HTTP | Meaning |
|------|---------|
| `401` | Missing/invalid JWT |
| `403` | Sending as another user without admin |
| `404` | Conversation not found |
| `400` | Validation (empty body, etc.) |

---

## 10. Connecteam vs our app — user expectations

| Scenario | What user sees |
|----------|----------------|
| Someone chats in **Connecteam mobile app** | Appears on our site via webhook → Socket.IO `chat.message` (~1–2s) |
| Someone chats on **our website** | Immediate in our UI; Connecteam app users see it if write-through on |
| **Before webhook was enabled** | Old messages **never** appear — only new traffic |
| **helpDesk / system tips** | Filtered out server-side — will not appear |
| User not linked | Can browse (if admin) but should not send |

---

## 11. Suggested component state

```typescript
type ChatState = {
  conversations: Conversation[];
  activeConversationId: string | null;
  messages: Message[];           // chronological in UI
  messagesPage: number;
  messagesTotal: number;
  loadingInbox: boolean;
  loadingThread: boolean;
  sending: boolean;
  error: string | null;
  pollTimer: ReturnType<typeof setInterval> | null;
};
```

**Merge strategy on poll:**

1. Build `Map` by `messageId`.
2. Replace/update existing; append new.
3. Re-sort by `sentAtIso` ascending in UI.
4. Update inbox row from latest message in thread or re-fetch inbox.

---

## 12. MVP checklist

- [ ] `GET /connecteam/users/me` gate on send
- [ ] Inbox list with labels + relative times
- [ ] Thread with reversed message order
- [ ] Send message with optimistic UI
- [ ] Poll inbox + thread (10–15s, pause when hidden)
- [ ] Handle `linked: false` and empty inbox states
- [ ] Error toasts for 403/404
- [ ] (Optional) Create `app-*` channel
- [ ] (Optional) Attachment links when `attachments[].url` present

---

## 13. Roadmap (beyond live push)

| Item | Benefit |
|------|---------|
| Attachment upload | Send files from our site |
| Unread counts / last-read cursor | Inbox badges |
| Per-conversation WS rooms | Smaller payloads for huge fleets |

**WebSocket is live.** Use §2.1. Keep a rare poll only if the socket is down.

---

## 14. Endpoint quick reference

| Method | Path | Purpose |
|--------|------|---------|
| WS | `/connecteam-chat` (Socket.IO) | Live `chat.message` / `chat.conversation_updated` / `chat.message_deleted` |
| GET | `/connecteam/chat/sync-status` | Bidirectional sync readiness |
| GET | `/connecteam/users/me` | Link status + workforce profile |
| GET | `/connecteam/conversations` | Inbox |
| GET | `/connecteam/conversations/:id` | Thread header |
| GET | `/connecteam/conversations/:id/messages` | Message list |
| POST | `/connecteam/conversations/:id/messages` | Send text |
| POST | `/connecteam/conversations` | Create app channel, or real Connecteam group with `assignedUserIds` |
| POST | `/connecteam/conversations/dm/:userId` | Start / send a 1:1 direct message |
| GET | `/connecteam/users?search=` | Find a user to DM or add to a group |

---

## 15. What frontend must NOT do

- Do not call `api.connecteam.com` or store `CONNECTEAM_API_KEY` in the browser.
- Do not register Connecteam webhooks from the frontend.
- Do not skip JWT on the Socket.IO handshake — unauthenticated sockets are disconnected.
- Do not show raw Connecteam IDs as the main user-visible text.
- Do not implement “load full history” for pre-webhook era — data does not exist.

---

## 16. FAQ

**Q: Is this “live” chat?**  
A: Yes. Connecteam → our server is webhook push. Our server → browser is **Socket.IO** (`/connecteam-chat`). Poll only as fallback.

**Q: Why are some DMs missing from the inbox?**  
A: Connecteam does not list private conversations in their GET API. They appear when the first webhook event arrives.

**Q: Why is `messages` newest-first?**  
A: Backend default for pagination. Reverse for UI.

**Q: Can we embed Connecteam’s chat widget?**  
A: Out of scope — product goal is our own UI on `/connecteam/*` APIs.

**Q: Max message length?**  
A: 10,000 chars our API; if write-through to Connecteam, keep under 1,000 for compatibility.
