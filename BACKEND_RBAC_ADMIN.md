# Backend: Admin RBAC

FE handoff: **[docs/FRONTEND_RBAC.md](docs/FRONTEND_RBAC.md)** — give that file to frontend.

This file is backend-only. Permissions are per **role** (`App_Roles` / `App_RolePermissions`). `App_Users.Role` picks the row. No per-user override.

## Seed

On boot `RbacService.ensureSeed()` creates missing roles/permission keys. Empty roles get catalog defaults. `super_admin` is always all keys. Existing `admin` / `user` mappings are not overwritten.

Optional SSMS: `scripts/sql/add-rbac-roles.sql`.

## Endpoints (JWT + admin / super_admin)

| Method | Path |
|--------|------|
| GET | `/admin/rbac` |
| PATCH | `/admin/rbac/roles/:roleName` |
| GET | `/admin/permissions` |
| GET/PATCH | `/admin/settings/rbac-user-defaults` `{ role }` |
| GET | `/admin/users`, `/admin/users/:id` include `permissions` from role |
| PATCH | `/admin/users/:id` `{ role, status }` — `permissions` → 400 |

Login / register / profile already attach `user.permissions` from the role.

## Guards

`@Roles(Role.Admin)` allows `admin` and `super_admin`. `super_admin` bypasses the role list.
