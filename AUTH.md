# Authentication & Authorization

## Overview

- **JWT** bearer tokens after login.
- **Global guard**: all routes require a valid JWT unless marked `@Public()`.
- **Roles**: `user` and `admin`. Use `@Roles(Role.Admin)` for admin-only routes.

## Environment

Add to `.env`:

```env
JWT_SECRET=your-secret-at-least-32-chars-long
JWT_EXPIRES_IN=7d
```

**Important:** Set a strong `JWT_SECRET` in production (e.g. 32+ random characters).

## Endpoints

### Login (public)

```http
POST /auth/login
Content-Type: application/json

{
  "email": "admin@example.com",
  "password": "Admin123!"
}
```

**Response:**

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": 1,
    "email": "admin@example.com",
    "role": "admin"
  }
}
```

### Register / Signup (public)

```http
POST /auth/register
Content-Type: application/json

{
  "email": "newuser@example.com",
  "password": "secret123",
  "confirmPassword": "secret123"
}
```

`confirmPassword` is optional; if sent, it must match `password`. New users get role `user` (not admin).

**Response (201):** Same shape as login – `access_token` and `user`.

**Error (409 Conflict):** Email already registered.

**Error (400):** Validation failed or password ≠ confirmPassword.

### Profile (protected)

```http
GET /auth/profile
Authorization: Bearer <access_token>
```

Returns the same `user` shape as login.

### Admin-only (admin role required)

```http
GET /auth/admin
Authorization: Bearer <access_token>
```

Returns `{ "message": "Admin access granted." }` for admin users; `403 Forbidden` for non-admins.

## Admin access (summary)

- **Who is admin?** Only users with `role === 'admin'`. The first admin is created by the seed; additional admins must be created by the backend (e.g. direct DB update or a future admin-only “create user” endpoint).
- **Signup creates `user` only:** `POST /auth/register` always creates a normal user; there is no public way to self-register as admin.
- **Protecting routes:** Use `@UseGuards(RolesGuard)` and `@Roles(Role.Admin)` on any route that only admins should access. The JWT guard runs first (globally), then `RolesGuard` checks `user.role`.
- **Frontend:** Send the JWT on every request; use `GET /auth/profile` or the `user` from login/register to read `user.role` and show or hide admin-only UI. Call admin-only endpoints only when `user.role === 'admin'` (otherwise the API returns 403).

## Default admin (after seed)

Running the seed (`POST /seed` or `npm run seed`) creates the `App_Users` table if missing and an admin user:

- **Email:** `admin@example.com`
- **Password:** `Admin123!`

Change this password in production.

## Frontend usage

1. Call `POST /auth/login` with email and password.
2. Store `access_token` (e.g. in memory or secure storage).
3. Send it on every request: `Authorization: Bearer <access_token>`.
4. On 401, redirect to login.
5. For admin-only UI, call `GET /auth/profile` and check `user.role === 'admin'`.

## Public routes

These do **not** require a token:

- `GET /` – API info
- `POST /auth/login` – login
- `POST /auth/register` – signup
- `POST /seed` – seed (development)

All other routes require a valid JWT.

## Adding admin-only routes

In any controller:

```ts
import { UseGuards } from '@nestjs/common';
import { Roles } from './auth/decorators';
import { RolesGuard } from './auth/guards';
import { Role } from './database/entities';

@UseGuards(RolesGuard)
@Roles(Role.Admin)
@Get('sensitive')
sensitive() {
  return this.sensitiveService.get();
}
```

Ensure the controller is not marked `@Public()` so the JWT guard runs first.
