# Access control — Frontend Handoff

**Give this file to FE.** Admin Settings → Access control + widen `user.role`.  
**Last updated:** 2026-09-01  
**Auth (already live — do not rip):** [FRONTEND_AUTH.md](./FRONTEND_AUTH.md)

Login, register, profile, token, 401, and `user.status` are **unchanged**. Same `AuthUser` object: `id`, `email`, `role`, `status`, `permissions`. This doc only:

1. Widens `role` from `'user' | 'admin'` to 8 ids (`super_admin` still uses the admin panel).
2. Adds Admin → Settings → Access control (matrix APIs).
3. Tells you when to use `permissions[]` for tabs.

Do **not** invent extra App roles (takeoff slots, field, ops/AR, owner/GC/mechanical). Those are not login roles.

Permissions are **per role**, not per user. A user’s `permissions[]` always come from `user.role`. To change one person, change their **role**. To change what a role can do, save the **matrix**.

---

## Lock this

| Thing | Rule |
|-------|------|
| Who sees Admin layout | Same as today: `role === 'admin'`, **plus** `super_admin`. Do not require `admin:rbac` for the whole admin app |
| Workspace chrome | `admin` and `super_admin` see **every** workspace (Ops, Bidding, Mike, Siteline, Clearstory, Workforce, Admin). **Do not** hide those items on missing permission keys |
| Super admin | Nick, PJ. Role id `super_admin`. Always every key. **No checkboxes.** FE must not PATCH this role |
| Matrix save | `PATCH /admin/rbac/roles/:roleName` — one role at a time |
| User picker | `PATCH /admin/users/:id` `{ "role": "captain" }` — **do not** send `permissions` |
| New signup default | `PATCH /admin/settings/rbac-user-defaults` `{ "role": "assistant_estimator" }` — **do not** send a permission list |
| After matrix save | That role’s users must **log in again** (permissions live in JWT) |
| Bidding fallback | If `permissions` has **no** `bidding:*` key, show **all** bidding UI including totals (old tokens). Once any `bidding:*` is present, gate normally |

---

## Roles (user picker + matrix columns)

Use `GET /admin/rbac` → `roles[]` for labels. Do not hardcode if the GET already has them.

| `id` | Label | Who |
|------|--------|-----|
| `super_admin` | Super admin | Nick, PJ — locked, not a matrix column |
| `admin` | Admin | IT |
| `bid_clerk` | Bid clerk | John — intake |
| `captain` | Captain | Wilder / Bil / Mike |
| `assistant_estimator` | Assistant estimator | Hassan, etc. |
| `project_manager` | Project manager | PMs |
| `operations_manager` | Operations manager | OMs |
| `user` | Legacy user | Old accounts; treat like AE + trucking dashboards |

Widen the TypeScript union on the existing `AuthUser` from [FRONTEND_AUTH.md](./FRONTEND_AUTH.md). Login JSON is the same shape; `role` can now be any of these 8 strings. Keep storing `user` in localStorage as you already do.

```ts
export type AppRoleId =
  | 'super_admin'
  | 'admin'
  | 'bid_clerk'
  | 'captain'
  | 'assistant_estimator'
  | 'project_manager'
  | 'operations_manager'
  | 'user';
```

---

## Permission keys (matrix rows)

Use `GET /admin/rbac` → `permissions[]` (or `GET /admin/permissions`). Group by `group`. Do not hardcode labels if the GET has them.

| Key | UI |
|-----|-----|
| `bidding:read` | Bidding list + open bid |
| `bidding:write` | Create / edit bids, intake, spec sheet |
| `bidding:summary` | MIKE / PJ $ on the results rail |
| `tickets:read` | Ticket grids |
| `tickets:export` | Export to Excel |
| `job_dashboard:read` | Job dashboard |
| `material_dashboard:read` | Material dashboard |
| `hauler_dashboard:read` | Hauler dashboard |
| `forensic:read` | Forensic |
| `siteline:read` | Siteline |
| `clearstory:read` | Clearstory |
| `trimble:read` | Trimble |
| `connecteam:read` | Workforce view |
| `connecteam:write` | Workforce writes |
| `admin:users` | Admin → Users |
| `admin:create_user` | Create user |
| `admin:rbac` | Admin → Access control |

```ts
function can(user: { permissions: string[] } | null, key: string): boolean {
  return !!user?.permissions.includes(key);
}

function canBidding(user: { permissions: string[] } | null, key: 'bidding:read' | 'bidding:write' | 'bidding:summary'): boolean {
  if (!user) return false;
  const hasAnyBidding = user.permissions.some((p) => p.startsWith('bidding:'));
  if (!hasAnyBidding) return true; // legacy JWT
  return user.permissions.includes(key);
}
```

**Existing FE:** `user.role === 'admin'` still shows the admin panel for IT. Add `|| user.role === 'super_admin'` or Nick/PJ disappear when you set their role. Other roles stay hidden from `/admin/*` (403). Prefer `can(user, 'admin:rbac')` only for the Access control **screen** inside Settings — not as a replacement for the admin layout check.

---

## Screen — Admin → Settings → Access control

Rip the “backend not ready” card.

**1. Default role for new signups**

- Load `GET /admin/settings/rbac-user-defaults` → `{ role, permissions }`
- Dropdown = `roles` where `locked !== true` (never offer `super_admin`)
- Save: `PATCH /admin/settings/rbac-user-defaults` `{ "role": "<id>" }`
- Do **not** PATCH a permission array here. Those checkboxes belong on the matrix.

**2. Role × permission grid**

- Load `GET /admin/rbac`
- Columns = `roles.filter(r => !r.locked)`
- Rows = `permissions`, section headers from `p.group` (Bidding, Trucking, Jobs, Workforce, Admin)
- Checkbox on ⇔ `matrix[roleId].includes(p.key)`
- **Save** per column: `PATCH /admin/rbac/roles/{roleId}` `{ "permissions": ["bidding:read", ...] }` (checked keys only)
- Toast: users with that role must log in again
- `super_admin`: show a note “always all permissions” — no column, or a disabled full-checked column. Never PATCH it (API returns 400)

**3. User detail (existing modal)**

- Role dropdown = same 8 ids (include `super_admin` only if the signed-in user is `super_admin`)
- Show `permissions` **read-only** (from GET user)
- Remove per-user bidding toggles. `PATCH /admin/users/:id` with `permissions` → **400**

---

## APIs

JWT + `admin` or `super_admin`.

```http
GET /admin/rbac
```

```json
{
  "roles": [
    { "id": "captain", "label": "Captain", "note": "Team lead, spec bless, takeoff assign", "locked": false }
  ],
  "permissions": [
    { "key": "bidding:read", "label": "Bidding — view", "description": "List and open bids", "group": "Bidding" }
  ],
  "matrix": {
    "captain": ["bidding:read", "bidding:write", "bidding:summary", "trimble:read"]
  },
  "defaults": {
    "role": "user",
    "permissions": ["bidding:read", "bidding:write", "bidding:summary"]
  }
}
```

`roles[].locked: true` = super admin. `matrix.super_admin` is every key; do not edit.

```http
PATCH /admin/rbac/roles/captain
{ "permissions": ["bidding:read", "bidding:write", "bidding:summary", "trimble:read"] }
→ { "role": "captain", "permissions": ["..."] }
```

```http
GET /admin/permissions
→ { "permissions": [ { "key", "label", "description", "group" } ] }
```

```http
GET /admin/settings/rbac-user-defaults
PATCH /admin/settings/rbac-user-defaults
{ "role": "assistant_estimator" }
```

```http
GET /admin/users
GET /admin/users/:id
→ { "id", "email", "role", "status", "permissions", "createdAt", "lastLoginAt" }

PATCH /admin/users/:id
{ "role": "project_manager", "status": "active" }
```

Login / register / profile already return `user.role` + `user.permissions`.

---

## Seed (so the first paint is not empty)

Backend fills **empty** roles on boot. Super admin is always all keys. Existing `admin` / `user` ticks are **not** overwritten — first time you open the matrix, tick what you want and Save.

| Role | Default ticks (empty role only) |
|------|----------------------------------|
| `bid_clerk` | `bidding:read`, `bidding:write` (no summary $) |
| `captain` / `assistant_estimator` | bidding all three + `trimble:read` |
| `project_manager` | `bidding:read`, `siteline:read`, `clearstory:read` |
| `operations_manager` | `siteline:read`, `clearstory:read`, `connecteam:read`, `connecteam:write` |
| `admin` | **all keys** (same as super_admin at login) |
| `user` (legacy) | bidding all three + trucking dashboards |

---

## Do not

- Per-user permission matrix
- Extra roles: duct1, field, owner, GC, mechanical
- Treat `admin` as Nick/PJ — that is `super_admin`
- Hide bidding when `permissions` is missing `bidding:*` (legacy allow-all)
- Call a backend HTML URL for this screen — this is **your** Settings page
