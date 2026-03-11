# RBAC (Role-Based Access Control)

## 1. Run the SQL script

In **SQL Server Management Studio**, connect to your database (e.g. GoFormzDB) and run:

```
scripts/rbac-schema.sql
```

This creates:

- **App_Roles** – roles (e.g. `admin`, `user`)
- **App_Permissions** – permission names (e.g. `tickets:read`, `admin:users`)
- **App_RolePermissions** – which role has which permission

and seeds default roles and permissions.

## 2. Existing users

**App_Users** is unchanged. The `Role` column (e.g. `admin`, `user`) is used to look up permissions from **App_Roles** / **App_RolePermissions**. No migration of user data is required.

## 3. Login / JWT

- On **login** and **register**, the backend loads permissions for the user’s role from the RBAC tables and puts them in the JWT and in the `user` object (`user.permissions`).
- **GET /auth/profile** also returns `permissions: string[]`.

## 4. Using permissions in the API

- **By role (unchanged):** `@Roles(Role.Admin)` – requires one of the given roles.
- **By permission:** `@UseGuards(JwtAuthGuard, PermissionsGuard)` and `@RequirePermission('tickets:read')` – requires at least one of the listed permissions.

Example:

```ts
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission('admin:users')
@Get()
getUsers() { ... }
```

## 5. Permission names (seeded)

| Permission           | Description                          |
|----------------------|--------------------------------------|
| tickets:read         | View tickets and dashboards          |
| tickets:export       | Export tickets to Excel              |
| job_dashboard:read   | View job dashboard                   |
| material_dashboard:read | View material dashboard           |
| hauler_dashboard:read  | View hauler dashboard             |
| forensic:read        | View forensic reports                |
| admin:users          | Manage users                         |
| admin:create_user    | Create new users                     |

To add more: insert into **App_Permissions**, then insert into **App_RolePermissions** for the right role(s).
