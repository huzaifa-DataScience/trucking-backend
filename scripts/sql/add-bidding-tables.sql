-- =============================================================================
-- Bidding module schema (Base Bid centric).
-- Reuses Ref_OurEntities (company) and Ref_Jobs (optional). No duplicate masters.
-- Run once against GoFormzDB. Idempotent: guarded with IF OBJECT_ID checks.
-- See docs/BIDDING_DATABASE_DESIGN.md.
-- =============================================================================

-------------------------------------------------------------------------------
-- Lookup / master tables (seeded from BiddingSheet.xlsx)
-------------------------------------------------------------------------------
IF OBJECT_ID('dbo.Bid_Teams', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.Bid_Teams (
    TeamId int IDENTITY(1,1) NOT NULL PRIMARY KEY,
    TeamName nvarchar(100) NOT NULL,
    Captain nvarchar(100) NULL,
    BidClerk nvarchar(100) NULL,
    Duct1 nvarchar(100) NULL,
    Duct2 nvarchar(100) NULL,
    Hydronic1 nvarchar(100) NULL,
    Hydronic2 nvarchar(100) NULL,
    Plumbing1 nvarchar(100) NULL,
    Plumbing2 nvarchar(100) NULL,
    IsActive bit NOT NULL CONSTRAINT DF_Bid_Teams_IsActive DEFAULT 1,
    SortOrder int NOT NULL CONSTRAINT DF_Bid_Teams_SortOrder DEFAULT 0
  );
END

IF OBJECT_ID('dbo.Bid_WageRates', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.Bid_WageRates (
    WageRateId int IDENTITY(1,1) NOT NULL PRIMARY KEY,
    RateLabel nvarchar(100) NOT NULL,
    Wage decimal(10,2) NOT NULL,
    Fringe decimal(10,2) NOT NULL,
    Total decimal(10,2) NOT NULL,
    DisplayLabel nvarchar(200) NOT NULL,
    WageAsOf date NULL,
    IsActive bit NOT NULL CONSTRAINT DF_Bid_WageRates_IsActive DEFAULT 1,
    SortOrder int NOT NULL CONSTRAINT DF_Bid_WageRates_SortOrder DEFAULT 0
  );
END

IF OBJECT_ID('dbo.Bid_States', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.Bid_States (
    StateId int IDENTITY(1,1) NOT NULL PRIMARY KEY,
    StateCode nvarchar(10) NOT NULL,
    SalesTaxRate decimal(6,4) NOT NULL CONSTRAINT DF_Bid_States_Tax DEFAULT 0,
    SortOrder int NOT NULL CONSTRAINT DF_Bid_States_SortOrder DEFAULT 0
  );
END

IF OBJECT_ID('dbo.Bid_ProjectTypes', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.Bid_ProjectTypes (
    ProjectTypeId int IDENTITY(1,1) NOT NULL PRIMARY KEY,
    Name nvarchar(200) NOT NULL,
    SortOrder int NOT NULL CONSTRAINT DF_Bid_ProjectTypes_SortOrder DEFAULT 0
  );
END

IF OBJECT_ID('dbo.Bid_BuildingTypes', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.Bid_BuildingTypes (
    BuildingTypeId int IDENTITY(1,1) NOT NULL PRIMARY KEY,
    Name nvarchar(200) NOT NULL,
    SortOrder int NOT NULL CONSTRAINT DF_Bid_BuildingTypes_SortOrder DEFAULT 0
  );
END

IF OBJECT_ID('dbo.Bid_Preferences', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.Bid_Preferences (
    PreferenceId int IDENTITY(1,1) NOT NULL PRIMARY KEY,
    Name nvarchar(200) NOT NULL,
    SortOrder int NOT NULL CONSTRAINT DF_Bid_Preferences_SortOrder DEFAULT 0
  );
END

-- Payroll burden constants (Labor Costs Worksheet "Cost of Labor Calculator").
-- Wage -> burdened labor rate. RateType: pct_wage | capped_annual | per_hour.
IF OBJECT_ID('dbo.Bid_PayrollBurden', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.Bid_PayrollBurden (
    BurdenId int IDENTITY(1,1) NOT NULL PRIMARY KEY,
    Code nvarchar(40) NOT NULL,
    Label nvarchar(200) NOT NULL,
    RateType nvarchar(20) NOT NULL,
    Rate decimal(12,6) NOT NULL,
    AnnualCap decimal(12,2) NULL,
    HoursBasis int NULL,
    IncludeInBaseRate bit NOT NULL CONSTRAINT DF_Bid_PayrollBurden_Incl DEFAULT 1,
    IsActive bit NOT NULL CONSTRAINT DF_Bid_PayrollBurden_IsActive DEFAULT 1,
    SortOrder int NOT NULL CONSTRAINT DF_Bid_PayrollBurden_SortOrder DEFAULT 0
  );
END

-------------------------------------------------------------------------------
-- Per-bid tables
-------------------------------------------------------------------------------
IF OBJECT_ID('dbo.Bids', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.Bids (
    BidId int IDENTITY(1,1) NOT NULL PRIMARY KEY,
    OurEntityId int NOT NULL,
    JobId int NULL,
    EstimateNumber nvarchar(64) NOT NULL,
    BidName nvarchar(500) NULL,
    Status nvarchar(20) NOT NULL CONSTRAINT DF_Bids_Status DEFAULT 'draft',
    BidDate date NULL,
    SubmitDate date NULL,
    TimeEstimate decimal(12,2) NULL,
    CreatedByUserId int NULL,
    UpdatedByUserId int NULL,
    CreatedAt datetime2 NOT NULL CONSTRAINT DF_Bids_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt datetime2 NOT NULL CONSTRAINT DF_Bids_UpdatedAt DEFAULT SYSUTCDATETIME(),
    IsDeleted bit NOT NULL CONSTRAINT DF_Bids_IsDeleted DEFAULT 0,
    CONSTRAINT FK_Bids_OurEntity FOREIGN KEY (OurEntityId) REFERENCES dbo.Ref_OurEntities(EntityID)
  );
  CREATE INDEX IX_Bids_OurEntityId ON dbo.Bids(OurEntityId);
  CREATE INDEX IX_Bids_Status ON dbo.Bids(Status);
END

IF OBJECT_ID('dbo.Bid_Content', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.Bid_Content (
    BidId int NOT NULL PRIMARY KEY,
    BaseBidJson nvarchar(max) NULL,
    SystemsJson nvarchar(max) NULL,
    CompanyInfoJson nvarchar(max) NULL,
    InputsSchemaVer int NOT NULL CONSTRAINT DF_Bid_Content_Ver DEFAULT 1,
    UpdatedAt datetime2 NOT NULL CONSTRAINT DF_Bid_Content_UpdatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_Bid_Content_Bid FOREIGN KEY (BidId) REFERENCES dbo.Bids(BidId) ON DELETE CASCADE,
    CONSTRAINT CK_Bid_Content_BaseBidJson CHECK (BaseBidJson IS NULL OR ISJSON(BaseBidJson) = 1),
    CONSTRAINT CK_Bid_Content_SystemsJson CHECK (SystemsJson IS NULL OR ISJSON(SystemsJson) = 1),
    CONSTRAINT CK_Bid_Content_CompanyInfoJson CHECK (CompanyInfoJson IS NULL OR ISJSON(CompanyInfoJson) = 1)
  );
END

IF OBJECT_ID('dbo.Bid_CalcSnapshots', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.Bid_CalcSnapshots (
    SnapshotId int IDENTITY(1,1) NOT NULL PRIMARY KEY,
    BidId int NOT NULL,
    CalcVersion nvarchar(20) NOT NULL,
    Source nvarchar(20) NOT NULL CONSTRAINT DF_Bid_CalcSnapshots_Source DEFAULT 'client',
    InputsHash nvarchar(64) NULL,
    ComputedJson nvarchar(max) NULL,
    CreatedAt datetime2 NOT NULL CONSTRAINT DF_Bid_CalcSnapshots_CreatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_Bid_CalcSnapshots_Bid FOREIGN KEY (BidId) REFERENCES dbo.Bids(BidId) ON DELETE CASCADE,
    CONSTRAINT CK_Bid_CalcSnapshots_Json CHECK (ComputedJson IS NULL OR ISJSON(ComputedJson) = 1)
  );
  CREATE INDEX IX_Bid_CalcSnapshots_BidId ON dbo.Bid_CalcSnapshots(BidId);
END

-- Add Source to pre-existing snapshot tables (idempotent).
IF OBJECT_ID('dbo.Bid_CalcSnapshots', 'U') IS NOT NULL
   AND COL_LENGTH('dbo.Bid_CalcSnapshots', 'Source') IS NULL
BEGIN
  ALTER TABLE dbo.Bid_CalcSnapshots
    ADD Source nvarchar(20) NOT NULL CONSTRAINT DF_Bid_CalcSnapshots_Source DEFAULT 'client';
END

-- Cover-sheet fields (idempotent).
IF OBJECT_ID('dbo.Bids', 'U') IS NOT NULL
   AND COL_LENGTH('dbo.Bids', 'SubmitDate') IS NULL
BEGIN
  ALTER TABLE dbo.Bids ADD SubmitDate date NULL;
END

IF OBJECT_ID('dbo.Bids', 'U') IS NOT NULL
   AND COL_LENGTH('dbo.Bids', 'TimeEstimate') IS NULL
BEGIN
  ALTER TABLE dbo.Bids ADD TimeEstimate decimal(12,2) NULL;
END

IF OBJECT_ID('dbo.Bid_Content', 'U') IS NOT NULL
   AND COL_LENGTH('dbo.Bid_Content', 'CompanyInfoJson') IS NULL
BEGIN
  ALTER TABLE dbo.Bid_Content ADD
    CompanyInfoJson nvarchar(max) NULL
    CONSTRAINT CK_Bid_Content_CompanyInfoJson CHECK (CompanyInfoJson IS NULL OR ISJSON(CompanyInfoJson) = 1);
END

GO

-------------------------------------------------------------------------------
-- Seed lookups (only when empty)
-------------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM dbo.Bid_Teams)
INSERT INTO dbo.Bid_Teams (TeamName, Captain, BidClerk, Duct1, Duct2, Hydronic1, Hydronic2, Plumbing1, Plumbing2, SortOrder) VALUES
 (N'Wilder Rodriguez', N'Wilder Rodriguez', N'Hassan Riaz', N'John Carlo Orpilla', NULL, N'Jonathan Bruce', N'Brian Angelo Limon', N'Hennan Berberio', N'Mark Chua', 1),
 (N'Bil Shams', N'Bil Shams', N'Mark Tan', N'Marc Maniago', N'Oliver Crucero', N'Maristella Malamug', N'Kevin Strauss', N'Ralph Resare', N'Hugh Belangel', 2),
 (N'Mike Robberts', N'Mike Roberts', N'Rhal Dumol', N'Wesley Morris', N'Gerald Ordonez', N'Jeremee Camat', NULL, N'Joel Simplina', N'Junel Neri', 3);

IF NOT EXISTS (SELECT 1 FROM dbo.Bid_WageRates)
INSERT INTO dbo.Bid_WageRates (RateLabel, Wage, Fringe, Total, DisplayLabel, WageAsOf, SortOrder) VALUES
 (N'NON-SCALE', 30.00, 7.29, 37.29, N'NON-SCALE - W: ($30 + F: $7.29) = Total of $37.29', '2026-03-03', 1),
 (N'2026 - DC/Federal in DC/CITIZEN', 40.77, 20.17, 60.94, N'2026 - DC/Federal in DC/CITIZEN - W: ($40.77 + F: $20.17) = Total of $60.94', '2026-02-21', 2),
 (N'2026 - Maryland/Federal', 40.77, 20.42, 61.19, N'2026 - Maryland/Federal - W: ($40.77 + F: $20.42) = Total of $61.19', '2026-02-21', 3),
 (N'2026 - Virginia', 39.27, 18.67, 57.94, N'2026 - Virginia - W: ($39.27 + F: $18.67) = Total of $57.94', '2026-02-21', 4),
 (N'2024 - MD Prevail', 39.27, 19.42, 58.69, N'2024 - MD Prevail - W: ($39.27 + F: $19.42) = Total of $58.69', '2026-02-21', 5),
 (N'2024', 40.02, 19.67, 60.19, N'2024 - W: ($40.02 + F: $19.67) = Total of $60.19', '2025-10-01', 6),
 (N'2023', 40.02, 19.67, 58.69, N'2023 - W: ($40.02 + F: $19.67) = Total of $58.69', '2025-10-01', 7),
 (N'2021', 39.27, 18.67, 57.94, N'2021 - W: ($39.27 + F: $18.67) = Total of $57.94', '2023-10-01', 8),
 (N'2019', 38.01, 17.62, 55.63, N'2019 - W: ($38.01 + F: $17.62) = Total of $55.63', '2021-04-01', 9),
 (N'2017', 35.13, 16.22, 51.35, N'2017 - W: ($35.13 + F: $16.22) = Total of $51.35', '2019-04-01', 10),
 (N'2015', 35.03, 15.32, 50.35, N'2015 - W: ($35.03 + F: $15.32) = Total of $50.35', '2017-04-01', 11),
 (N'2013', 33.13, 13.60, 46.73, N'2013 - W: ($33.13 + F: $13.6) = Total of $46.73', '2015-04-01', 12);

IF NOT EXISTS (SELECT 1 FROM dbo.Bid_States)
INSERT INTO dbo.Bid_States (StateCode, SalesTaxRate, SortOrder) VALUES
 (N'VA', 0.0530, 1), (N'MD', 0.0600, 2), (N'DC', 0.0600, 3),
 (N'PA', 0.0600, 4), (N'DE', 0.0000, 5), (N'NJ', 0.0665, 6);

IF NOT EXISTS (SELECT 1 FROM dbo.Bid_ProjectTypes)
INSERT INTO dbo.Bid_ProjectTypes (Name, SortOrder) VALUES
 (N'Fast Renovation', 1), (N'Slow Renovation', 2),
 (N'New Construction with deep shoring - large', 3),
 (N'New Construction with limited excavation - large', 4),
 (N'New Construction with deep shoring - small', 5),
 (N'New Construction with limited excavation small', 6),
 (N'Immediate Start', 7), (N'Multi Phased Renovation', 8);

IF NOT EXISTS (SELECT 1 FROM dbo.Bid_Preferences)
INSERT INTO dbo.Bid_Preferences (Name, SortOrder) VALUES
 (N'MDOT SDB', 1), (N'CBE', 2), (N'Prince George''s CBB', 3),
 (N'Federal SDB', 4), (N'Baltimore MWBOO', 5), (N'Virginia SWAM', 6);

IF NOT EXISTS (SELECT 1 FROM dbo.Bid_BuildingTypes)
INSERT INTO dbo.Bid_BuildingTypes (Name, SortOrder) VALUES
 (N'Airport Building',1),(N'Airport Hangar',2),(N'Data Center',3),(N'Data Center - Federal',4),
 (N'Educational - College',5),(N'Educational - Elementary School',6),(N'Educational - High School School',7),
 (N'Educational - Middle School',8),(N'Federal - Agency',9),(N'Federal - GSA',10),(N'Federal - Industrial',11),
 (N'Federal - Medical Research',12),(N'Federal - NSA/FBA/CIA',13),(N'Federal - USACE/NAVFAC',14),
 (N'Hospital - John Hopkins',15),(N'Hospital - NIH',16),(N'Hospital - Other Patient Hospital',17),
 (N'Hotel Building',18),(N'Industrial Manufacturing Building',19),(N'Metro Facility',20),(N'Military',21),
 (N'Mixed Use Development',22),(N'Museum',23),(N'Office Building - County',24),(N'Office Building - Federal',25),
 (N'Office Building - Medical',26),(N'Office Building - Military',27),(N'Office Building - Private',28),
 (N'Office Building - State',29),(N'Power Plant',30),(N'Prison',31),(N'Public',32),
 (N'Recreational/Community Center',33),(N'Warehouse',34),(N'Wastewater Treatement Plant',35);

IF NOT EXISTS (SELECT 1 FROM dbo.Bid_PayrollBurden)
INSERT INTO dbo.Bid_PayrollBurden (Code, Label, RateType, Rate, AnnualCap, HoursBasis, IncludeInBaseRate, SortOrder) VALUES
 (N'medicare',         N'Medicare',                   N'pct_wage',      0.009000, NULL,    NULL, 1, 1),
 (N'social_security',  N'Social Security',            N'pct_wage',      0.067500, NULL,    NULL, 1, 2),
 (N'suta',             N'SUTA',                       N'capped_annual', 0.033000, 9000.00, 1500, 1, 3),
 (N'futa',             N'FUTA',                       N'capped_annual', 0.006000, 7000.00, 1500, 1, 4),
 (N'workers_comp',     N'Workers Compensation',       N'pct_wage',      0.041280, NULL,    NULL, 1, 5),
 (N'pfl',              N'Paid Family Leave',          N'pct_wage',      0.002600, NULL,    NULL, 1, 6),
 (N'ira',              N'IRA / Union Savings',        N'per_hour',      0.320000, NULL,    NULL, 1, 7),
 (N'ppo_health',       N'PPO Health',                 N'per_hour',      2.400000, NULL,    NULL, 1, 8),
 (N'other_cba_fringe', N'Other CBA Fringe',           N'per_hour',      4.570000, NULL,    NULL, 1, 9),
 (N'company_benefits', N'Company Benefits',           N'per_hour',      6.562500, NULL,    NULL, 1, 10);

-------------------------------------------------------------------------------
-- File attachments (images/PDFs on disk; metadata in SQL)
-------------------------------------------------------------------------------
IF OBJECT_ID('dbo.App_Files', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.App_Files (
    FileId int IDENTITY(1,1) NOT NULL PRIMARY KEY,
    StoragePath nvarchar(500) NOT NULL,
    OriginalFileName nvarchar(255) NOT NULL,
    MimeType nvarchar(100) NOT NULL,
    SizeBytes bigint NOT NULL,
    UploadedByUserId int NULL,
    CreatedAt datetime2 NOT NULL CONSTRAINT DF_App_Files_CreatedAt DEFAULT SYSUTCDATETIME(),
    IsDeleted bit NOT NULL CONSTRAINT DF_App_Files_IsDeleted DEFAULT 0
  );
END

IF OBJECT_ID('dbo.Bid_Attachments', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.Bid_Attachments (
    AttachmentId int IDENTITY(1,1) NOT NULL PRIMARY KEY,
    BidId int NOT NULL,
    FileId int NOT NULL,
    Label nvarchar(200) NULL,
    SortOrder int NOT NULL CONSTRAINT DF_Bid_Attachments_SortOrder DEFAULT 0,
    CreatedAt datetime2 NOT NULL CONSTRAINT DF_Bid_Attachments_CreatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_Bid_Attachments_Bid FOREIGN KEY (BidId) REFERENCES dbo.Bids(BidId) ON DELETE CASCADE,
    CONSTRAINT FK_Bid_Attachments_File FOREIGN KEY (FileId) REFERENCES dbo.App_Files(FileId) ON DELETE CASCADE
  );
  CREATE INDEX IX_Bid_Attachments_BidId ON dbo.Bid_Attachments(BidId);
END

IF OBJECT_ID('dbo.Bid_ActivityLog', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.Bid_ActivityLog (
    ActivityId int IDENTITY(1,1) NOT NULL PRIMARY KEY,
    BidId int NOT NULL,
    UserId int NULL,
    Action nvarchar(40) NOT NULL,
    Area nvarchar(40) NOT NULL,
    Summary nvarchar(500) NOT NULL,
    ChangedFieldsJson nvarchar(max) NULL,
    CreatedAt datetime2 NOT NULL CONSTRAINT DF_Bid_ActivityLog_CreatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_Bid_ActivityLog_Bid FOREIGN KEY (BidId) REFERENCES dbo.Bids(BidId) ON DELETE CASCADE,
    CONSTRAINT CK_Bid_ActivityLog_ChangedFieldsJson CHECK (ChangedFieldsJson IS NULL OR ISJSON(ChangedFieldsJson) = 1)
  );
  CREATE INDEX IX_Bid_ActivityLog_BidId ON dbo.Bid_ActivityLog(BidId);
  CREATE INDEX IX_Bid_ActivityLog_BidId_CreatedAt ON dbo.Bid_ActivityLog(BidId, CreatedAt DESC);
END

IF OBJECT_ID('dbo.Bids', 'U') IS NOT NULL
   AND COL_LENGTH('dbo.Bids', 'UpdatedByUserId') IS NULL
BEGIN
  ALTER TABLE dbo.Bids ADD UpdatedByUserId int NULL;
END

GO

PRINT 'Bidding tables ready.';
