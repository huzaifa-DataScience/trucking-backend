-- Maps Ref_OurEntities.EntityID (1=GOEL, 2=GOEL DC, 3=DCB) to Siteline company UUID + display name.
-- Tokens stay in .env (SITELINE_API_TOKEN_ENTITY_1, etc.); this table is refreshed from currentCompany on sync.

IF OBJECT_ID('dbo.Siteline_EntityConfig', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.Siteline_EntityConfig (
    EntityId int NOT NULL PRIMARY KEY,
    EntityName nvarchar(100) NOT NULL,
    SitelineCompanyId nvarchar(50) NULL,
    SitelineCompanyName nvarchar(255) NULL,
    LastResolvedAt datetime2 NULL,
    UpdatedAt datetime2 NOT NULL CONSTRAINT DF_Siteline_EntityConfig_UpdatedAt DEFAULT SYSUTCDATETIME()
  );
END

IF NOT EXISTS (SELECT 1 FROM dbo.Siteline_EntityConfig WHERE EntityId = 1)
  INSERT INTO dbo.Siteline_EntityConfig (EntityId, EntityName) VALUES (1, N'GOEL');
IF NOT EXISTS (SELECT 1 FROM dbo.Siteline_EntityConfig WHERE EntityId = 2)
  INSERT INTO dbo.Siteline_EntityConfig (EntityId, EntityName) VALUES (2, N'GOEL DC');
IF NOT EXISTS (SELECT 1 FROM dbo.Siteline_EntityConfig WHERE EntityId = 3)
  INSERT INTO dbo.Siteline_EntityConfig (EntityId, EntityName) VALUES (3, N'DCB');

IF COL_LENGTH('dbo.Siteline_AgingSummary', 'EntityId') IS NULL
  ALTER TABLE dbo.Siteline_AgingSummary ADD EntityId int NULL;

IF COL_LENGTH('dbo.Siteline_AgingContracts', 'EntityId') IS NULL
  ALTER TABLE dbo.Siteline_AgingContracts ADD EntityId int NULL;

IF COL_LENGTH('dbo.Siteline_Contracts', 'EntityId') IS NULL
  ALTER TABLE dbo.Siteline_Contracts ADD EntityId int NULL;

IF COL_LENGTH('dbo.Siteline_Contracts', 'SitelineCompanyId') IS NULL
  ALTER TABLE dbo.Siteline_Contracts ADD SitelineCompanyId nvarchar(50) NULL;
