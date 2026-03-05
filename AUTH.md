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
