-- ============================================================
-- RBAC schema for current database (run in SSMS)
-- Tables: App_Roles, App_Permissions, App_RolePermissions
-- App_Users.Role (existing) references role by name (admin, user)
-- ============================================================

-- 1. Roles (id + name; App_Users.Role stores the name)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'App_Roles')
BEGIN
  CREATE TABLE dbo.App_Roles (
    Id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    Name NVARCHAR(50) NOT NULL UNIQUE,
    Description NVARCHAR(255) NULL
  );
  PRINT 'Created App_Roles';
END
GO

-- 2. Permissions (what can be checked: tickets:read, admin:users, etc.)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'App_Permissions')
BEGIN
  CREATE TABLE dbo.App_Permissions (
    Id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    Name NVARCHAR(100) NOT NULL UNIQUE,
    Description NVARCHAR(255) NULL
  );
  PRINT 'Created App_Permissions';
END
GO

-- 3. Role-Permission mapping (which role has which permission)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'App_RolePermissions')
BEGIN
  CREATE TABLE dbo.App_RolePermissions (
    RoleId INT NOT NULL,
    PermissionId INT NOT NULL,
    PRIMARY KEY (RoleId, PermissionId),
    FOREIGN KEY (RoleId) REFERENCES dbo.App_Roles(Id) ON DELETE CASCADE,
    FOREIGN KEY (PermissionId) REFERENCES dbo.App_Permissions(Id) ON DELETE CASCADE
  );
  PRINT 'Created App_RolePermissions';
END
GO

-- ============================================================
-- Seed: Roles (must match App_Users.Role values: 'admin', 'user')
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM dbo.App_Roles WHERE Name = 'user')
  INSERT INTO dbo.App_Roles (Name, Description) VALUES ('user', 'Standard user');
IF NOT EXISTS (SELECT 1 FROM dbo.App_Roles WHERE Name = 'admin')
  INSERT INTO dbo.App_Roles (Name, Description) VALUES ('admin', 'Administrator');
GO

-- ============================================================
-- Seed: Permissions (names used in @RequirePermission('...'))
-- ============================================================
DECLARE @Perms TABLE (Name NVARCHAR(100), Description NVARCHAR(255));
INSERT INTO @Perms (Name, Description) VALUES
  ('tickets:read', 'View tickets and dashboards'),
  ('tickets:export', 'Export tickets to Excel'),
  ('job_dashboard:read', 'View job dashboard'),
  ('material_dashboard:read', 'View material dashboard'),
  ('hauler_dashboard:read', 'View hauler dashboard'),
  ('forensic:read', 'View forensic / late submission / efficiency reports'),
  ('admin:users', 'Manage users (list, approve, reject, update, delete)'),
  ('admin:create_user', 'Create new users');

INSERT INTO dbo.App_Permissions (Name, Description)
SELECT p.Name, p.Description FROM @Perms p
WHERE NOT EXISTS (SELECT 1 FROM dbo.App_Permissions WHERE Name = p.Name);
GO

-- ============================================================
-- Seed: RolePermissions
-- user: read + export on tickets and dashboards, forensic read
-- admin: all of the above + admin:users, admin:create_user
-- ============================================================
DECLARE @AdminId INT = (SELECT Id FROM dbo.App_Roles WHERE Name = 'admin');
DECLARE @UserId INT = (SELECT Id FROM dbo.App_Roles WHERE Name = 'user');

-- User role: tickets and dashboards read/export, forensic read
INSERT INTO dbo.App_RolePermissions (RoleId, PermissionId)
SELECT @UserId, p.Id FROM dbo.App_Permissions p
WHERE p.Name IN ('tickets:read', 'tickets:export', 'job_dashboard:read', 'material_dashboard:read', 'hauler_dashboard:read', 'forensic:read')
AND NOT EXISTS (SELECT 1 FROM dbo.App_RolePermissions rp WHERE rp.RoleId = @UserId AND rp.PermissionId = p.Id);

-- Admin role: all permissions
INSERT INTO dbo.App_RolePermissions (RoleId, PermissionId)
SELECT @AdminId, p.Id FROM dbo.App_Permissions p
WHERE NOT EXISTS (SELECT 1 FROM dbo.App_RolePermissions rp WHERE rp.RoleId = @AdminId AND rp.PermissionId = p.Id);
GO

-- Verify
SELECT r.Name AS RoleName, p.Name AS PermissionName
FROM dbo.App_Roles r
JOIN dbo.App_RolePermissions rp ON rp.RoleId = r.Id
JOIN dbo.App_Permissions p ON p.Id = rp.PermissionId
ORDER BY r.Name, p.Name;
