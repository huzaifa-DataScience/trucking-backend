## Frontend: Roles & Permissions (RBAC)

This document describes how the frontend should use **roles** and **permissions** that now come from the backend.

It builds on `FRONTEND_AUTH.md` and `FRONTEND_API_GUIDE.md` and only covers what changed.

---

### 1. Auth responses (what changed)

All existing endpoints are the same, but the `user` object now includes **permissions**.

#### `POST /auth/login` and `POST /auth/register`

**Response:**

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "email": "user@example.com",
    "role": "admin",
    "permissions": [
      "tickets:read",
      "tickets:export",
      "job_dashboard:read",
      "material_dashboard:read",
      "hauler_dashboard:read",
      "forensic:read",
      "admin:users",
      "admin:create_user"
    ]
  }
}
```

#### `GET /auth/profile`

**Response:** same `user` shape as login (including `permissions`).

Frontend can rely on:

- `user.role` – high–level role: `'user' | 'admin'`
- `user.permissions` – fine–grained capabilities

---

### 2. TypeScript types (frontend)

Extend the existing types from `FRONTEND_AUTH.md` like this:

```ts
export interface AuthUser {
  id: number;
  email: string;
  role: 'user' | 'admin';
  permissions: string[];
}

export interface LoginResponse {
  access_token: string;
  user: AuthUser;
}
```

When reading from `localStorage` or your store, make sure `permissions` is preserved.

---

### 3. Meaning of permissions

Current permission names (seeded in the DB; see `scripts/README-RBAC.md`):

| Permission             | Intended UI capability                           |
|------------------------|--------------------------------------------------|
| `tickets:read`         | Can view ticket grids and ticket detail          |
| `tickets:export`       | Can see and use **Export to Excel** actions      |
| `job_dashboard:read`   | Can access the Job dashboard tab                 |
| `material_dashboard:read` | Can access the Material dashboard tab        |
| `hauler_dashboard:read`  | Can access the Hauler dashboard tab          |
| `forensic:read`        | Can access forensic tabs (late submission, etc.) |
| `admin:users`          | Can view and manage users in the Admin panel     |
| `admin:create_user`    | Can access “Create User” actions in Admin panel  |

The backend maps:

- **role = `user`** → a subset (read/export/dashboard/forensic)
- **role = `admin`** → all of the above

The exact mapping is controlled server–side; frontend should just **read what comes back**.

---

### 4. How frontend should use them

#### 4.1. Basic rule

- Continue to use `user.role === 'admin'` for simple admin vs user checks where appropriate.
- For specific buttons, tabs, or pages, prefer **permissions**:

```ts
function can(user: AuthUser | null, perm: string): boolean {
  return !!user && user.permissions.includes(perm);
}
```

Examples:

- Show **Export** button only when:

```ts
if (can(user, 'tickets:export')) {
  // render export button
}
```

- Show **Forensic** menu/tab only when:

```ts
if (can(user, 'forensic:read')) {
  // render forensic tab / link
}
```

- Show **Admin → Users** screen only when:

```ts
if (can(user, 'admin:users')) {
  // render admin users route
}
```

#### 4.2. Route guards (if you have them)

If your frontend has a central router guard (e.g. in Next.js middleware / React router / Vue router):

- Use `user` from your auth store.
- For admin routes:

```ts
// simple role check (existing behaviour)
if (user?.role !== 'admin') redirectTo('/login');
```

- For permission–scoped routes:

```ts
if (!can(user, 'admin:users')) redirectTo('/not-authorized');
```

---

### 5. Backwards compatibility

- Existing login/signup flows still work; the only change is that `user` now has a `permissions` array.
- If the frontend ignores `permissions`, behaviour is the same as before.
- You can gradually adopt permissions in the UI (e.g. start with Admin panel, then forensic, etc.).

