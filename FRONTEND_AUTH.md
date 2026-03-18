# Frontend: Login, Signup & Authentication Process

This document describes how the frontend should implement **login**, **signup (register)**, and use the API with JWT authentication and **admin access**.

---

## Overview

| Step | What the frontend does |
|------|-------------------------|
| 1 | User logs in (`POST /auth/login`) or signs up (`POST /auth/register`). |
| 2 | Backend returns `access_token` and `user`. Frontend stores the token and user. |
| 3 | On every other API request, frontend sends `Authorization: Bearer <access_token>`. |
| 4 | On 401, frontend clears token/user and redirects to login. |
| 5 | Optional: call `GET /auth/profile` to refresh current user or check role (e.g. admin). |
| 6 | Use `user.role === 'admin'` to show admin-only UI and call admin-only endpoints. |

---

## 1. Login

**Endpoint:** `POST /auth/login`  
**Public:** no token required.

**Request:**

```http
POST /auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "your-password"
}
```

**Success (200):** The `user` object includes `status` (e.g. `"active"`). Login only succeeds for active users, so the value will always be `"active"` here.

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "email": "user@example.com",
    "role": "admin",
    "status": "active",
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

**Error (401 Unauthorized):** Invalid email or password.

```json
{
  "statusCode": 401,
  "message": "Invalid email or password"
}
```

**Validation errors (400):** e.g. missing email, password too short.

```json
{
  "statusCode": 400,
  "message": ["email must be an email", "password must be longer than or equal to 6 characters"],
  "error": "Bad Request"
}
```

---

## 2. Signup (Register)

**Endpoint:** `POST /auth/register`  
**Public:** no token required.

Signup currently collects only email/password. New users get role `user`. Whether they can log in immediately depends on backend config:

- **With admin approval (default):** `user.status` is `pending`; they must wait until an admin approves. Login will return 401 with “Your account is pending admin approval” until then.
- **Without approval:** Backend can set `REQUIRE_SIGNUP_APPROVAL=false`; then new users get `status: 'active'` and can log in right after signup.

### 2.1 Request body

```http
POST /auth/register
Content-Type: application/json

{
  "email": "alice@example.com",
  "password": "secret123",
  "confirmPassword": "secret123"
}
```

| Field | Type | Required | Notes |
|-------|------|----------|--------|
| `email` | string | Yes | Valid email; must be unique. |
| `password` | string | Yes | Minimum 6 characters. |
| `confirmPassword` | string | No | If sent, must equal `password`. |

- **Validation:** Backend returns **400** with a `message` array if any required field is missing or invalid (e.g. email format, password length, phone format).
- **Status:** Check `user.status` and the `message` in the response. If `status === 'pending'`, show “pending admin approval” and block full access until an admin approves (user will get 401 on login until then). If `status === 'active'`, the user can use the app immediately.

### 2.2 Success (201 Created)

Same shape as login: `access_token` and `user` (including profile fields and `permissions`).

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": 2,
    "email": "alice@example.com",
    "role": "user",
    "status": "pending",
    "permissions": [
      "tickets:read",
      "tickets:export",
      "job_dashboard:read",
      "material_dashboard:read",
      "hauler_dashboard:read",
      "forensic:read"
    ]
  },
  "message": "Account created successfully. Your account is pending admin approval."
}
```

- `displayName` is optional from the backend (e.g. `firstName + ' ' + lastName`).
- `status` is one of: `pending` | `active` | `inactive` | `rejected`. Use it to show “Pending approval” when `pending`, or allow full access when `active`. Backend can be configured so new signups get `active` immediately (no approval); see backend `REQUIRE_SIGNUP_APPROVAL` in `.env`.

### 2.3 Errors

**409 Conflict** – Email already registered:

```json
{
  "statusCode": 409,
  "message": "An account with this email already exists"
}
```

**400 Bad Request** – Validation failed (missing/invalid fields or `confirmPassword` ≠ `password`):

```json
{
  "statusCode": 400,
  "message": [
    "firstName should not be empty",
    "phone must be a valid phone number"
  ],
  "error": "Bad Request"
}
```

After a successful register, use the same flow as login: store `access_token` and `user`, then send the token on all subsequent requests. If `user.status !== 'active'`, show a “pending approval” message and restrict access as needed.

---

## 3. TypeScript types (for frontend)

```ts
// Use these in your app (e.g. auth store or API layer)
// NOTE: user includes `permissions` and profile fields (see FRONTEND_RBAC.md).

export type UserStatus = 'pending' | 'active' | 'inactive' | 'rejected';

export interface AuthUser {
  id: number;
  email: string;
  role: 'user' | 'admin';
  status: UserStatus;
  permissions: string[];
}

export interface LoginResponse {
  access_token: string;
  user: AuthUser;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  confirmPassword?: string;
}
```

---

## 4. Storing the token and user

- **Token:** Store `access_token` so it can be sent on every API call. Options:
  - **Memory only:** Store in React state / Vue ref / Angular service. Token is lost on refresh (user must log in again).
  - **sessionStorage:** Persists until the tab is closed.
  - **localStorage:** Persists across tabs and restarts. Use only over HTTPS in production.
- **User:** Store `user` (including `id`, `firstName`, `lastName`, `email`, `phone`, `company`, `displayName`, `role`, `status`, `permissions`) in the same place as the token (or derive it from `/auth/profile` after each load).

Example (localStorage):

```ts
function afterLogin(data: LoginResponse) {
  localStorage.setItem('access_token', data.access_token);
  localStorage.setItem('user', JSON.stringify(data.user));
}

function logout() {
  localStorage.removeItem('access_token');
  localStorage.removeItem('user');
}
```

---

## 5. Sending the token on every API request

Attach the token to all requests except login (and any other public endpoints):

```ts
const token = localStorage.getItem('access_token');

fetch(`${API_BASE}/job-dashboard/kpis?startDate=2024-01-01&endDate=2024-12-31`, {
  headers: {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  },
});
```

If the backend returns **401**, clear token and user and redirect to the login page.

---

## 6. Full login flow (example with fetch)

```ts
const API_BASE = 'http://localhost:3000'; // or your backend URL

async function login(email: string, password: string): Promise<LoginResponse> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  const data = await res.json();

  if (!res.ok) {
    if (res.status === 401) throw new Error('Invalid email or password');
    if (res.status === 400) throw new Error(data.message?.join?.(' ') ?? 'Validation failed');
    throw new Error(data.message ?? 'Login failed');
  }

  return data as LoginResponse;
}

// After successful login:
// 1. Save token and user (e.g. localStorage + state)
// 2. Redirect to dashboard (or default route)
```

---

## 7. Getting the current user (profile)

Use this to restore the user after a page reload or to check the latest role.

**Endpoint:** `GET /auth/profile`  
**Protected:** requires `Authorization: Bearer <access_token>`.

**Response (200):** Same `AuthUser` shape as login (includes profile fields and `permissions`).

```json
{
  "id": 1,
  "firstName": "Admin",
  "lastName": "User",
  "email": "user@example.com",
  "phone": "+15551234567",
  "company": "Acme Trucking",
  "displayName": "Admin User",
  "role": "admin",
  "status": "active",
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
```

Example: on app load, if you have a token, call profile to get the current user (and detect invalid/expired token via 401).

```ts
async function getCurrentUser(): Promise<AuthUser | null> {
  const token = localStorage.getItem('access_token');
  if (!token) return null;

  const res = await fetch(`${API_BASE}/auth/profile`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 401) {
    logout();
    return null;
  }

  if (!res.ok) return null;
  return res.json();
}
```

---

## 8. Role-based UI and admin access

- **Admin:** `user.role === 'admin'`. Show admin-only menus and call admin-only endpoints (e.g. `GET /auth/admin`). Only users created as admin (e.g. default seed admin or by backend) have this role; signup always creates `user`.
- **User:** `user.role === 'user'`. Hide admin-only UI; calling admin endpoints will return **403 Forbidden**.

Get the role from the stored `user` object (from login, register, or `GET /auth/profile`). There is no public way to become an admin; admins are created on the backend (e.g. seed or future admin-only user management).

---

## 9. Public routes (no token needed)

These work **without** `Authorization`:

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/` | API info |
| POST | `/auth/login` | Login |
| POST | `/auth/register` | Signup |

All other routes (lookups, dashboards, tickets, profile, admin, etc.) require a valid JWT.

---

## 10. Signup form (frontend)

Build the register form with:

- **Required:** Email, Password, Confirm password (optional).
- **Validation:** Client-side checks for valid email, password length ≥ 6, password match (if confirm is provided). Backend returns 400 with field-level messages if invalid.
- **On success:** Store `access_token` and `user`; if `user.status === 'pending'`, show “Your account is pending admin approval” and restrict app access until `status === 'active'` (e.g. after admin approves and user logs in again).

## 11. Quick checklist for frontend

- [ ] Login form calls `POST /auth/login` with `{ email, password }`.
- [ ] Signup form calls `POST /auth/register` with `{ email, password, confirmPassword? }`; on success, same token/user storage as login.
- [ ] Use `user.status` to show “pending approval” when `status === 'pending'`; only allow full access when `status === 'active'`.
- [ ] On login/register success, store `access_token` and `user` (e.g. localStorage or state).
- [ ] Send `Authorization: Bearer <access_token>` on all non-public API requests.
- [ ] On 401, clear token/user and redirect to login.
- [ ] Optional: on app load, call `GET /auth/profile` to restore user (and handle 401).
- [ ] Use `user.role === 'admin'` to show/hide admin-only UI.
 
### Note on user profile fields

This backend’s `AuthUser` currently includes: `id`, `email`, `role`, `status`, and `permissions`. It does **not** include `firstName`, `lastName`, `phone`, `company`, or `displayName`.

For backend details (env, admin-only routes, adding new protected routes), see **AUTH.md**.  
For the full list of API endpoints, see **FRONTEND_API_GUIDE.md**.
