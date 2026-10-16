-- Operations log from 2025-2026 Trucking Log.xlsx.
-- Companies stay on Ref_ExternalCompanies. Jobs stay on Ref_Jobs.
-- These tables are the rate cards and the haul rows. Costs are not stored.
-- Idempotent.

IF OBJECT_ID('dbo.Ops_HaulerRates', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.Ops_HaulerRates (
    HaulerRateId int IDENTITY(1,1) NOT NULL PRIMARY KEY,
    CompanyId int NULL,
    CompanyName nvarchar(300) NOT NULL,
    Category nvarchar(300) NULL,
    RatePerLoad decimal(18,4) NOT NULL CONSTRAINT DF_Ops_HaulerRates_Load DEFAULT 0,
    RatePerHour decimal(18,4) NOT NULL CONSTRAINT DF_Ops_HaulerRates_Hour DEFAULT 0,
    Unit nvarchar(50) NULL,
    ShowUpHours decimal(18,4) NULL,
    Address nvarchar(400) NULL,
    Phone nvarchar(80) NULL,
    Contact nvarchar(200) NULL,
    Email nvarchar(200) NULL,
    Coi nvarchar(200) NULL,
    IsActive bit NOT NULL CONSTRAINT DF_Ops_HaulerRates_Active DEFAULT 1,
    SourceRow int NULL,
    CONSTRAINT FK_Ops_HaulerRates_Company FOREIGN KEY (CompanyId) REFERENCES dbo.Ref_ExternalCompanies(CompanyID)
  );
  CREATE UNIQUE INDEX UX_Ops_HaulerRates_SourceRow ON dbo.Ops_HaulerRates (SourceRow) WHERE SourceRow IS NOT NULL;
END

IF OBJECT_ID('dbo.Ops_DisposalRates', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.Ops_DisposalRates (
    DisposalRateId int IDENTITY(1,1) NOT NULL PRIMARY KEY,
    SiteId int NULL,
    CompanyName nvarchar(300) NOT NULL,
    UnitLabel nvarchar(100) NULL,
    Category nvarchar(300) NULL,
    CostPerLoad decimal(18,4) NOT NULL CONSTRAINT DF_Ops_DisposalRates_Load DEFAULT 0,
    CostPerTon decimal(18,4) NOT NULL CONSTRAINT DF_Ops_DisposalRates_Ton DEFAULT 0,
    CostPerCy decimal(18,4) NOT NULL CONSTRAINT DF_Ops_DisposalRates_Cy DEFAULT 0,
    TruckSizeCy decimal(18,4) NOT NULL CONSTRAINT DF_Ops_DisposalRates_Size DEFAULT 0,
    TonsIncluded decimal(18,4) NOT NULL CONSTRAINT DF_Ops_DisposalRates_Included DEFAULT 0,
    Address nvarchar(400) NULL,
    Phone nvarchar(80) NULL,
    Contact nvarchar(200) NULL,
    Email nvarchar(200) NULL,
    IsActive bit NOT NULL CONSTRAINT DF_Ops_DisposalRates_Active DEFAULT 1,
    SourceRow int NULL,
    CONSTRAINT FK_Ops_DisposalRates_Site FOREIGN KEY (SiteId) REFERENCES dbo.Ref_ExternalSites(SiteID)
  );
  CREATE UNIQUE INDEX UX_Ops_DisposalRates_SourceRow ON dbo.Ops_DisposalRates (SourceRow) WHERE SourceRow IS NOT NULL;
END

IF OBJECT_ID('dbo.Ops_HaulTickets', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.Ops_HaulTickets (
    HaulTicketId int IDENTITY(1,1) NOT NULL PRIMARY KEY,
    TicketDate date NOT NULL,
    JobId int NULL,
    JobNumber nvarchar(50) NULL,
    JobName nvarchar(300) NULL,
    HaulerRateId int NULL,
    Hours decimal(18,4) NULL,
    DisposalRateId int NULL,
    GoelTicketNumber nvarchar(50) NULL,
    HaulingTicketNumber nvarchar(50) NULL,
    DisposalTicketNumber nvarchar(50) NULL,
    WasteManifestNumber nvarchar(50) NULL,
    TransferJobNumber nvarchar(50) NULL,
    WeightTons decimal(18,4) NULL,
    LightTubes decimal(18,4) NULL,
    MetalsDirect decimal(18,4) NULL,
    MetalsReclaimed decimal(18,4) NULL,
    Insulation decimal(18,4) NULL,
    Wood decimal(18,4) NULL,
    Paper decimal(18,4) NULL,
    Aggregates decimal(18,4) NULL,
    Plastics decimal(18,4) NULL,
    Drywall decimal(18,4) NULL,
    BoardFeetWood decimal(18,4) NULL,
    Dirt decimal(18,4) NULL,
    Lumber decimal(18,4) NULL,
    BrickDeconstructed decimal(18,4) NULL,
    BrickPallets decimal(18,4) NULL,
    Roofing decimal(18,4) NULL,
    Landfill decimal(18,4) NULL,
    Rc57 decimal(18,4) NULL,
    Rc6 decimal(18,4) NULL,
    Rc2 decimal(18,4) NULL,
    Cr57 decimal(18,4) NULL,
    DirtTons decimal(18,4) NULL,
    SourceRow int NULL,
    CreatedAt datetime2 NOT NULL CONSTRAINT DF_Ops_HaulTickets_Created DEFAULT SYSUTCDATETIME(),
    UpdatedAt datetime2 NOT NULL CONSTRAINT DF_Ops_HaulTickets_Updated DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_Ops_HaulTickets_Job FOREIGN KEY (JobId) REFERENCES dbo.Ref_Jobs(JobID),
    CONSTRAINT FK_Ops_HaulTickets_Hauler FOREIGN KEY (HaulerRateId) REFERENCES dbo.Ops_HaulerRates(HaulerRateId),
    CONSTRAINT FK_Ops_HaulTickets_Disposal FOREIGN KEY (DisposalRateId) REFERENCES dbo.Ops_DisposalRates(DisposalRateId)
  );
  CREATE INDEX IX_Ops_HaulTickets_Date ON dbo.Ops_HaulTickets (TicketDate);
  CREATE INDEX IX_Ops_HaulTickets_Job ON dbo.Ops_HaulTickets (JobId);
  CREATE UNIQUE INDEX UX_Ops_HaulTickets_SourceRow ON dbo.Ops_HaulTickets (SourceRow) WHERE SourceRow IS NOT NULL;
END

IF COL_LENGTH('dbo.Ops_HaulTickets', 'JobName') IS NULL
  ALTER TABLE dbo.Ops_HaulTickets ADD JobName nvarchar(300) NULL;
