-- Bid Assignment task-list backlog: missing lookup options + new attachment columns.
-- Idempotent: safe to re-run, safe to run partially-applied.

-------------------------------------------------------------------------------
-- Construction Type / Building Type: missing options (per-row guards, since
-- these tables already have rows — the table-level guard in
-- add-bidding-tables.sql is a no-op once any row exists).
-------------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM dbo.Bid_ProjectTypes WHERE Name = N'Core & Shell')
INSERT INTO dbo.Bid_ProjectTypes (Name, SortOrder)
VALUES (N'Core & Shell', (SELECT ISNULL(MAX(SortOrder), 0) + 1 FROM dbo.Bid_ProjectTypes));

IF NOT EXISTS (SELECT 1 FROM dbo.Bid_ProjectTypes WHERE Name = N'Budget')
INSERT INTO dbo.Bid_ProjectTypes (Name, SortOrder)
VALUES (N'Budget', (SELECT ISNULL(MAX(SortOrder), 0) + 1 FROM dbo.Bid_ProjectTypes));

IF NOT EXISTS (SELECT 1 FROM dbo.Bid_BuildingTypes WHERE Name = N'Commercial')
INSERT INTO dbo.Bid_BuildingTypes (Name, SortOrder)
VALUES (N'Commercial', (SELECT ISNULL(MAX(SortOrder), 0) + 1 FROM dbo.Bid_BuildingTypes));

IF NOT EXISTS (SELECT 1 FROM dbo.Bid_BuildingTypes WHERE Name = N'Library')
INSERT INTO dbo.Bid_BuildingTypes (Name, SortOrder)
VALUES (N'Library', (SELECT ISNULL(MAX(SortOrder), 0) + 1 FROM dbo.Bid_BuildingTypes));

-------------------------------------------------------------------------------
-- Bid_Attachments: new nullable columns.
-- Category        : 'project_documents' | 'proposal' — app-validated, no DB
--                    CHECK constraint (matches how WorkType/BidKind/Status
--                    are handled elsewhere in this schema).
-- DrawingCategory  : 'sd' | 'dd' | 'ifb' | 'ifp' | 'ifc' | 'ifr'
-------------------------------------------------------------------------------
IF OBJECT_ID('dbo.Bid_Attachments', 'U') IS NOT NULL
   AND COL_LENGTH('dbo.Bid_Attachments', 'Category') IS NULL
BEGIN
  ALTER TABLE dbo.Bid_Attachments ADD Category nvarchar(30) NULL;
END

IF OBJECT_ID('dbo.Bid_Attachments', 'U') IS NOT NULL
   AND COL_LENGTH('dbo.Bid_Attachments', 'DrawingCategory') IS NULL
BEGIN
  ALTER TABLE dbo.Bid_Attachments ADD DrawingCategory nvarchar(10) NULL;
END
