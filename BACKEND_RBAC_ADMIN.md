# Backend: Admin RBAC (permissions management)

The frontend **consumes** `user.permissions: string[]` on login and `GET /auth/profile`. Bidding summary is gated on `bidding:summary` (see `BIDDING_FRONTEND_API.md` §6).

The admin **Settings** page and **User detail** modal are wired to the endpoints below. Until they exist, the UI shows a “backend not ready” state and admins can still use role `admin` (full access).

---

## Permission keys (bidding — new)

| Key | Purpose |
|-----|---------|
| `bidding:read` | List + open bid sheets |
| `bidding:write` | Create / PATCH bids |
| `bidding:summary` | MIKE/PJ totals, labor build-up, per-system $ on results rail |

**Legacy behavior (frontend):** If a user has **no** `bidding:*` keys, all bidding UI including summary is allowed until you start assigning bidding permissions.

---

## Required endpoints

### 1. User permissions (per user)

**Extend existing admin user APIs:**

```http
GET /admin/users/:id
```

Response `user` must include:

```json
{
  "id": 1,
  "email": "estimator@example.com",
  "role": "user",
  "status": "active",
  "permissions": ["bidding:read", "bidding:write"],
  "createdAt": "...",
  "lastLoginAt": "..."
}
```

```http
PATCH /admin/users/:id
Content-Type: application/json

{
  "permissions": ["bidding:read", "bidding:write", "bidding:summary"]
}
```

- Validate keys against an allow-list (same as JWT issuance).
- `role: admin` should continue to imply all permissions server-side (or return full set on profile).
- Optional: include `permissions` on `GET /admin/users` list items to avoid an extra fetch.

### 2. Default permissions for new / approved users

Used on **Admin → Settings → Access control (Bidding)**.

```http
GET /admin/settings/rbac-user-defaults
```

```json
{
  "permissions": ["bidding:read", "bidding:write"]
}
```

```http
PATCH /admin/settings/rbac-user-defaults
Content-Type: application/json

{
  "permissions": ["bidding:read", "bidding:write"]
}
```

Apply these when:

- A user registers (`status: pending`), and/or
- Admin approves a user (`POST /admin/users/:id/approve`).

### 3. Permission catalog (optional)

If the backend owns the canonical list:

```http
GET /admin/permissions
```

```json
{
  "permissions": [
    {
      "key": "bidding:summary",
      "label": "View bid totals",
      "description": "...",
      "group": "bidding"
    }
  ]
}
```

If omitted, the frontend uses the static catalog in `src/lib/auth/permission-catalog.ts`.

---

## Auth / guards

- All `/admin/settings/rbac-*` and permission PATCH routes: **JWT + `role === admin`** (same as other `/admin/*`).
- There is no separate `super_admin` role in the frontend today; **`admin`** is the super-user for settings.

---

## JWT refresh

After changing a user’s permissions, they need a **new token** (re-login or `GET /auth/profile` returning updated `permissions`) for the bid sheet rail to reflect changes.

---

## Suggested default roles (backend seed)

| Persona | Permissions |
|---------|-------------|
| Estimator (full) | `bidding:read`, `bidding:write`, `bidding:summary` |
| Data entry (no $) | `bidding:read`, `bidding:write` |
| Viewer | `bidding:read`, `bidding:summary` |

---

## Frontend files

| File | Role |
|------|------|
| `src/lib/auth/permissions.ts` | `hasPermission()` |
| `src/lib/auth/permission-catalog.ts` | Labels for admin UI |
| `src/components/admin/BiddingRbacSettings.tsx` | Settings card |
| `src/components/admin/UserDetailModal.tsx` | Per-user bidding toggles |
| `src/lib/api/endpoints/admin.ts` | API client |
