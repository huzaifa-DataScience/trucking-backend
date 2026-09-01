-- Additive RBAC roles + permission catalog (idempotent).
-- Nest also seeds this on boot (RbacService). Safe to re-run in SSMS.
-- Does not rewrite existing admin/user mappings except super_admin (always all keys).

IF OBJECT_ID('dbo.App_Roles', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.App_Roles (
    Id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    Name NVARCHAR(50) NOT NULL UNIQUE,
    Description NVARCHAR(255) NULL
  );
END

IF OBJECT_ID('dbo.App_Permissions', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.App_Permissions (
    Id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    Name NVARCHAR(100) NOT NULL UNIQUE,
    Description NVARCHAR(255) NULL
  );
END

IF OBJECT_ID('dbo.App_RolePermissions', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.App_RolePermissions (
    RoleId INT NOT NULL,
    PermissionId INT NOT NULL,
    PRIMARY KEY (RoleId, PermissionId),
    FOREIGN KEY (RoleId) REFERENCES dbo.App_Roles(Id) ON DELETE CASCADE,
    FOREIGN KEY (PermissionId) REFERENCES dbo.App_Permissions(Id) ON DELETE CASCADE
  );
END

IF OBJECT_ID('dbo.App_Settings', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.App_Settings (
    SettingKey nvarchar(100) NOT NULL PRIMARY KEY,
    SettingValue nvarchar(200) NOT NULL,
    UpdatedAt datetime2 NOT NULL CONSTRAINT DF_App_Settings_UpdatedAt DEFAULT SYSUTCDATETIME()
  );
END
GO

DECLARE @Roles TABLE (Name NVARCHAR(50), Description NVARCHAR(255));
INSERT INTO @Roles VALUES
  ('super_admin', 'Nick, PJ — everything'),
  ('admin', 'IT — users & settings'),
  ('bid_clerk', 'Intake only'),
  ('captain', 'Team lead, spec bless, takeoff assign'),
  ('assistant_estimator', 'Setup, wage, spec draft'),
  ('project_manager', 'Awarded jobs, Siteline'),
  ('operations_manager', 'Awarded job ops'),
  ('user', 'Legacy App_Users.Role=user');

INSERT INTO dbo.App_Roles (Name, Description)
SELECT r.Name, r.Description FROM @Roles r
WHERE NOT EXISTS (SELECT 1 FROM dbo.App_Roles WHERE Name = r.Name);

DECLARE @Perms TABLE (Name NVARCHAR(100), Description NVARCHAR(255));
INSERT INTO @Perms VALUES
  ('bidding:read', 'List and open bids'),
  ('bidding:write', 'Create / PATCH bids, spec sheet, intake'),
  ('bidding:summary', 'MIKE / PJ $ on the results rail'),
  ('tickets:read', 'Ticket grids and detail'),
  ('tickets:export', 'Export to Excel'),
  ('job_dashboard:read', 'Job dashboard tab'),
  ('material_dashboard:read', 'Material dashboard tab'),
  ('hauler_dashboard:read', 'Hauler dashboard tab'),
  ('forensic:read', 'Late submission / efficiency'),
  ('siteline:read', 'Billing, aging, pay apps'),
  ('clearstory:read', 'CORs and contract comparison'),
  ('trimble:read', 'Line items / company items'),
  ('connecteam:read', 'Hours, roster, schedule'),
  ('connecteam:write', 'Clock, PTO, chat writes'),
  ('admin:users', 'Approve, reject, change role/status'),
  ('admin:create_user', 'Create accounts'),
  ('admin:rbac', 'Access-control matrix');

INSERT INTO dbo.App_Permissions (Name, Description)
SELECT p.Name, p.Description FROM @Perms p
WHERE NOT EXISTS (SELECT 1 FROM dbo.App_Permissions WHERE Name = p.Name);

-- super_admin: every catalog key
DECLARE @SuperId INT = (SELECT Id FROM dbo.App_Roles WHERE Name = 'super_admin');
DELETE FROM dbo.App_RolePermissions WHERE RoleId = @SuperId;
INSERT INTO dbo.App_RolePermissions (RoleId, PermissionId)
SELECT @SuperId, p.Id FROM dbo.App_Permissions p;

-- New roles only if they have zero mappings (do not clobber admin/user edits)
DECLARE @RoleName NVARCHAR(50);
DECLARE @RoleId INT;
DECLARE role_cur CURSOR LOCAL FAST_FORWARD FOR
  SELECT Name FROM (VALUES
    ('bid_clerk'),
    ('captain'),
    ('assistant_estimator'),
    ('project_manager'),
    ('operations_manager')
  ) v(Name);
OPEN role_cur;
FETCH NEXT FROM role_cur INTO @RoleName;
WHILE @@FETCH_STATUS = 0
BEGIN
  SET @RoleId = (SELECT Id FROM dbo.App_Roles WHERE Name = @RoleName);
  IF @RoleId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.App_RolePermissions WHERE RoleId = @RoleId)
  BEGIN
    IF @RoleName = 'bid_clerk'
      INSERT INTO dbo.App_RolePermissions (RoleId, PermissionId)
      SELECT @RoleId, Id FROM dbo.App_Permissions WHERE Name IN ('bidding:read', 'bidding:write');
    IF @RoleName = 'captain'
      INSERT INTO dbo.App_RolePermissions (RoleId, PermissionId)
      SELECT @RoleId, Id FROM dbo.App_Permissions WHERE Name IN ('bidding:read', 'bidding:write', 'bidding:summary', 'trimble:read');
    IF @RoleName = 'assistant_estimator'
      INSERT INTO dbo.App_RolePermissions (RoleId, PermissionId)
      SELECT @RoleId, Id FROM dbo.App_Permissions WHERE Name IN ('bidding:read', 'bidding:write', 'bidding:summary', 'trimble:read');
    IF @RoleName = 'project_manager'
      INSERT INTO dbo.App_RolePermissions (RoleId, PermissionId)
      SELECT @RoleId, Id FROM dbo.App_Permissions WHERE Name IN ('bidding:read', 'siteline:read', 'clearstory:read');
    IF @RoleName = 'operations_manager'
      INSERT INTO dbo.App_RolePermissions (RoleId, PermissionId)
      SELECT @RoleId, Id FROM dbo.App_Permissions WHERE Name IN ('siteline:read', 'clearstory:read', 'connecteam:read', 'connecteam:write');
  END
  FETCH NEXT FROM role_cur INTO @RoleName;
END
CLOSE role_cur;
DEALLOCATE role_cur;

IF NOT EXISTS (SELECT 1 FROM dbo.App_Settings WHERE SettingKey = 'rbac_default_role')
  INSERT INTO dbo.App_Settings (SettingKey, SettingValue, UpdatedAt)
  VALUES ('rbac_default_role', 'user', SYSUTCDATETIME());
GO
