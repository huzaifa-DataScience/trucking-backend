# Bid comments — Notes thread

**Give this file to FE.**  
**Last updated:** 2026-09-13

Notes drawer is a **comment thread**, not `process.notes`. Handoff `{ notes }` and activity log stay separate.

JWT. Read = anyone who can open the bid. Post / delete = `canEdit` (same as other writes). Archived bid: GET ok, POST/DELETE **403**.

Names: `firstName` + `lastName` when present. Else email. Do not invent a name.

---

## APIs

```http
GET /bids/:id/comments
→ { "items": [ Comment ] }
```

Oldest first. Soft-deleted hidden.

```http
POST /bids/:id/comments
Content-Type: multipart/form-data
body:   optional string
files:  optional File[]  (field name `files`, max 5, jpeg/png/webp)
```

Need **body or files**. Empty both → **400**.

**@mention**

```http
GET /lookups/bidding/mention-users?q=a
→ [{
  "id": 1,
  "email": "ali@goel.com",
  "handle": "ali",
  "firstName": "Ali",
  "lastName": "Khan",
  "name": "Ali Khan"
}]
```

On `@` key, call this with the letters after `@`. Prefix match on `firstName`, `lastName`, `"First Last"`, email, local part, `handle`. Dropdown label: `firstName` + `lastName`, else `name` / email. Insert `@` + `handle` + space. Also send ids:

```
mentionUserIds: 7,2     (multipart, comma-separated or repeated)
```

Backend also parses `@handle` / `@email` from `body`. Self-mention ignored. Mentioned user gets `GET /dashboard` → `notifications[]` item `kind: "comment_mention"` until they open `GET /bids/:id/comments`. Click → `/bidding/:bidId` Notes drawer.

```http
DELETE /bids/:id/comments/:commentId
```

Author, or `admin` / `super_admin`. Soft delete.

```ts
type Comment = {
  id: number;
  bidId: number;
  body: string | null;
  createdAt: string;          // ISO UTC
  updatedAt: string | null;
  authorUserId: number;
  authorFirstName: string | null;
  authorLastName: string | null;
  authorName: string;         // "First Last" or email
  authorEmail: string | null;
  mentions: {
    userId: number;
    firstName: string | null;
    lastName: string | null;
    name: string;             // "First Last" or email
    email: string;
  }[];
  attachments: {
    id: number;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    downloadPath: string;     // GET this with JWT — existing attachment download
  }[];
};
```

Image preview: `GET {downloadPath}` with Bearer. Not a public URL.

---

## Screen

Top: textarea + image attach + Post → `POST /bids/:id/comments`.  
Bottom: `items` feed — initials from `authorFirstName`/`authorLastName` (else `authorName`), name, time, text, thumbs.

Do **not** PATCH `process.notes` for this drawer. Do **not** POST `/bids/:id/handoff` for chat. Do **not** turn breadcrumbs into a thread.
