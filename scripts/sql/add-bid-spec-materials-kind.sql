-- List tab materials are kind-specific:
--   HVAC Pipe  AT+AZ, Plumbing BO+BP, Duct BQ+BR.
-- Same description can exist on HVAC and Plumbing (FGA). Duct codes are different (175, 13F).
-- Idempotent schema only — rows come from EstimationFile seed / bidding-migrate-spec-materials.
-- Spec lines store insulation as strings — no FK.

IF COL_LENGTH('dbo.Bid_SpecMaterials', 'Kind') IS NULL
BEGIN
  ALTER TABLE dbo.Bid_SpecMaterials ADD Kind nvarchar(20) NOT NULL
    CONSTRAINT DF_Bid_SpecMaterials_Kind DEFAULT N'hydronic';
END
GO

IF COL_LENGTH('dbo.Bid_SpecMaterials', 'Facing') IS NULL
BEGIN
  ALTER TABLE dbo.Bid_SpecMaterials ADD Facing nvarchar(40) NULL;
END
GO

IF COL_LENGTH('dbo.Bid_SpecMaterials', 'Jacket') IS NULL
BEGIN
  ALTER TABLE dbo.Bid_SpecMaterials ADD Jacket nvarchar(40) NULL;
END
GO

IF COL_LENGTH('dbo.Bid_SpecMaterials', 'ThicknessIn') IS NULL
BEGIN
  ALTER TABLE dbo.Bid_SpecMaterials ADD ThicknessIn decimal(18,6) NULL;
END
GO

IF COL_LENGTH('dbo.Bid_SpecMaterials', 'Weight') IS NULL
BEGIN
  ALTER TABLE dbo.Bid_SpecMaterials ADD Weight decimal(18,6) NULL;
END
GO

IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_Bid_SpecMaterials_Desc' AND object_id = OBJECT_ID('dbo.Bid_SpecMaterials'))
  DROP INDEX UX_Bid_SpecMaterials_Desc ON dbo.Bid_SpecMaterials;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_Bid_SpecMaterials_Kind_Desc' AND object_id = OBJECT_ID('dbo.Bid_SpecMaterials'))
  CREATE UNIQUE INDEX UX_Bid_SpecMaterials_Kind_Desc ON dbo.Bid_SpecMaterials(Kind, Description);
GO
