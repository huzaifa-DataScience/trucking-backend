-- =============================================================================
-- Bidding Specs Plumb Phase 1: lookups, helpermap, Mike CSV rows, Spec lines.
-- Idempotent. See docs/BIDDING_DATABASE_DESIGN.md (Bid_SpecLines phase 2).
-- =============================================================================

-------------------------------------------------------------------------------
-- Master lookups (from EstimationFile List + helpermap)
-------------------------------------------------------------------------------
IF OBJECT_ID('dbo.Bid_SpecSystems', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.Bid_SpecSystems (
    SpecSystemId int IDENTITY(1,1) NOT NULL PRIMARY KEY,
    SystemName nvarchar(200) NOT NULL,
    Code nvarchar(20) NOT NULL,
    Unit nvarchar(20) NOT NULL CONSTRAINT DF_Bid_SpecSystems_Unit DEFAULT N'LF',
    SortOrder int NOT NULL CONSTRAINT DF_Bid_SpecSystems_Sort DEFAULT 0,
    IsActive bit NOT NULL CONSTRAINT DF_Bid_SpecSystems_Active DEFAULT 1
  );
  CREATE UNIQUE INDEX UX_Bid_SpecSystems_Name ON dbo.Bid_SpecSystems(SystemName);
END

IF OBJECT_ID('dbo.Bid_SpecMaterials', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.Bid_SpecMaterials (
    SpecMaterialId int IDENTITY(1,1) NOT NULL PRIMARY KEY,
    Description nvarchar(200) NOT NULL,
    Code nvarchar(20) NOT NULL,
    SortOrder int NOT NULL CONSTRAINT DF_Bid_SpecMaterials_Sort DEFAULT 0,
    IsActive bit NOT NULL CONSTRAINT DF_Bid_SpecMaterials_Active DEFAULT 1
  );
  CREATE UNIQUE INDEX UX_Bid_SpecMaterials_Desc ON dbo.Bid_SpecMaterials(Description);
END

IF OBJECT_ID('dbo.Bid_SpecAreas', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.Bid_SpecAreas (
    SpecAreaId int IDENTITY(1,1) NOT NULL PRIMARY KEY,
    AreaName nvarchar(100) NOT NULL,
    Code nvarchar(20) NOT NULL,
    SortOrder int NOT NULL CONSTRAINT DF_Bid_SpecAreas_Sort DEFAULT 0,
    IsActive bit NOT NULL CONSTRAINT DF_Bid_SpecAreas_Active DEFAULT 1
  );
  CREATE UNIQUE INDEX UX_Bid_SpecAreas_Name ON dbo.Bid_SpecAreas(AreaName);
END

IF OBJECT_ID('dbo.Bid_HelperMap', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.Bid_HelperMap (
    HelperMapId int IDENTITY(1,1) NOT NULL PRIMARY KEY,
    SpecPhrase nvarchar(200) NOT NULL,
    Keyword nvarchar(100) NOT NULL,
    Keyword2 nvarchar(100) NULL,
    RawPrefix nvarchar(200) NULL,
    BaseName nvarchar(100) NULL,
    SortOrder int NOT NULL CONSTRAINT DF_Bid_HelperMap_Sort DEFAULT 0,
    IsActive bit NOT NULL CONSTRAINT DF_Bid_HelperMap_Active DEFAULT 1
  );
  CREATE UNIQUE INDEX UX_Bid_HelperMap_Phrase ON dbo.Bid_HelperMap(SpecPhrase);
END

-------------------------------------------------------------------------------
-- Per-bid Mike takeoff + Spec lines
-------------------------------------------------------------------------------
IF OBJECT_ID('dbo.Bid_MikeCsvRows', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.Bid_MikeCsvRows (
    MikeRowId bigint IDENTITY(1,1) NOT NULL PRIMARY KEY,
    BidId int NOT NULL,
    ExcelRowNumber int NULL,
    SystemAndType nvarchar(300) NULL,
    Discipline nvarchar(4) NULL,
    SystemCode nvarchar(20) NULL,
    AreaLetter nvarchar(10) NULL,
    SystemName nvarchar(200) NULL,
    Thickness decimal(18,6) NULL,
    Size decimal(18,6) NULL,
    Quantity decimal(18,6) NOT NULL CONSTRAINT DF_Bid_MikeCsvRows_Qty DEFAULT 0,
    MaterialCost decimal(18,6) NULL,
    Hours decimal(18,6) NULL,
    MaterialPhrase nvarchar(200) NULL,
    MaterialBase nvarchar(100) NULL,
    CreatedAt datetime2 NOT NULL CONSTRAINT DF_Bid_MikeCsvRows_CreatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_Bid_MikeCsvRows_Bid FOREIGN KEY (BidId) REFERENCES dbo.Bids(BidId)
  );
  CREATE INDEX IX_Bid_MikeCsvRows_Bid ON dbo.Bid_MikeCsvRows(BidId);
  CREATE INDEX IX_Bid_MikeCsvRows_Rollup ON dbo.Bid_MikeCsvRows(BidId, Size, Thickness, MaterialBase);
END

IF OBJECT_ID('dbo.Bid_SpecLines', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.Bid_SpecLines (
    SpecLineId bigint IDENTITY(1,1) NOT NULL PRIMARY KEY,
    BidId int NOT NULL,
    SortOrder int NOT NULL CONSTRAINT DF_Bid_SpecLines_Sort DEFAULT 0,
    Type nvarchar(40) NULL,
    SystemName nvarchar(200) NOT NULL,
    AreaName nvarchar(100) NULL,
    Insulation nvarchar(200) NOT NULL,
    Size decimal(18,6) NOT NULL,
    Thickness decimal(18,6) NOT NULL,
    Weight nvarchar(40) NULL,
    Facing nvarchar(40) NULL,
    AddJacket nvarchar(40) NULL,
    Layers nvarchar(40) NULL,
    ExtraNotes nvarchar(500) NULL,
    CreatedAt datetime2 NOT NULL CONSTRAINT DF_Bid_SpecLines_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt datetime2 NOT NULL CONSTRAINT DF_Bid_SpecLines_UpdatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_Bid_SpecLines_Bid FOREIGN KEY (BidId) REFERENCES dbo.Bids(BidId)
  );
  CREATE INDEX IX_Bid_SpecLines_Bid ON dbo.Bid_SpecLines(BidId);
END
GO
