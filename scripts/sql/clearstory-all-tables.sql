-- Clearstory mirror: drops all dbo.Clearstory_* tables used by sync, then recreates empty tables (typed schema).
-- Destructive — safe to run as a single script in SSMS/sqlcmd (no separate drop step required).
-- Optional: scripts/sql/clearstory-drop-tables.sql is the same DROP block only, if you want to drop first manually.
-- After this script, start the app and let Clearstory sync repopulate.
-- Requires SQL Server 2016+ (DROP TABLE IF EXISTS). Use the correct database context. Adjust schema if not dbo.

SET NOCOUNT ON;

DROP TABLE IF EXISTS dbo.Clearstory_ApiPayloads;
DROP TABLE IF EXISTS dbo.Clearstory_SyncSnapshots;
DROP TABLE IF EXISTS dbo.Clearstory_ProjectRates;
DROP TABLE IF EXISTS dbo.Clearstory_Rates;
DROP TABLE IF EXISTS dbo.Clearstory_Tags;
DROP TABLE IF EXISTS dbo.Clearstory_Cors;
DROP TABLE IF EXISTS dbo.Clearstory_ChangeNotificationContracts;
DROP TABLE IF EXISTS dbo.Clearstory_ChangeNotifications;
DROP TABLE IF EXISTS dbo.Clearstory_Projects;
DROP TABLE IF EXISTS dbo.Clearstory_CustomerOffices;
DROP TABLE IF EXISTS dbo.Clearstory_Customers;
DROP TABLE IF EXISTS dbo.Clearstory_Contracts;
DROP TABLE IF EXISTS dbo.Clearstory_Labels;
DROP TABLE IF EXISTS dbo.Clearstory_Divisions;
DROP TABLE IF EXISTS dbo.Clearstory_Offices;
DROP TABLE IF EXISTS dbo.Clearstory_Users;
DROP TABLE IF EXISTS dbo.Clearstory_Company;
DROP TABLE IF EXISTS dbo.Clearstory_SyncState;
GO

CREATE TABLE dbo.Clearstory_SyncState(
  [Key] nvarchar(100) NOT NULL PRIMARY KEY,
  [Value] nvarchar(max) NULL,
  UpdatedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

CREATE TABLE dbo.Clearstory_Company(
  Id int NOT NULL PRIMARY KEY,
  Name nvarchar(500) NULL,
  Domain nvarchar(500) NULL,
  Address nvarchar(500) NULL,
  Address2 nvarchar(500) NULL,
  City nvarchar(200) NULL,
  State nvarchar(100) NULL,
  ZipCode nvarchar(50) NULL,
  Country nvarchar(200) NULL,
  Phone nvarchar(100) NULL,
  Fax nvarchar(100) NULL,
  DivisionsEnabled bit NULL,
  TzName nvarchar(200) NULL,
  LogoSignedUrl nvarchar(2000) NULL,
  UpdatedAt datetime2 NULL,
  CreatedAt datetime2 NULL,
  LastSyncedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

CREATE TABLE dbo.Clearstory_Users(
  Id int NOT NULL PRIMARY KEY,
  FirstName nvarchar(200) NULL,
  LastName nvarchar(200) NULL,
  Email nvarchar(320) NULL,
  CompanyId int NULL,
  RoleId int NULL,
  RoleName nvarchar(100) NULL,
  UpdatedAt datetime2 NULL,
  CreatedAt datetime2 NULL,
  LastSyncedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

CREATE TABLE dbo.Clearstory_Offices(
  Id int NOT NULL PRIMARY KEY,
  Name nvarchar(300) NULL,
  BusinessName nvarchar(500) NULL,
  Address nvarchar(500) NULL,
  City nvarchar(200) NULL,
  State nvarchar(100) NULL,
  Country nvarchar(200) NULL,
  ZipCode nvarchar(50) NULL,
  Phone nvarchar(100) NULL,
  Fax nvarchar(100) NULL,
  Lat float NULL,
  Lng float NULL,
  CustomId nvarchar(200) NULL,
  TzName nvarchar(200) NULL,
  RegionId int NULL,
  UpdatedAt datetime2 NULL,
  CreatedAt datetime2 NULL,
  LastSyncedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

CREATE TABLE dbo.Clearstory_Divisions(
  Division nvarchar(300) NOT NULL PRIMARY KEY,
  CreatedAt datetime2 NULL,
  UpdatedAt datetime2 NULL,
  LastSyncedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

CREATE TABLE dbo.Clearstory_Contracts(
  Id int NOT NULL PRIMARY KEY,
  Name nvarchar(500) NULL,
  ContractValue decimal(18,2) NULL,
  CustomerProjectId int NULL,
  ContractorProjectId int NULL,
  LastSyncedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME()
);
CREATE INDEX IX_Clearstory_Contracts_CustomerProjectId ON dbo.Clearstory_Contracts(CustomerProjectId);
CREATE INDEX IX_Clearstory_Contracts_ContractorProjectId ON dbo.Clearstory_Contracts(ContractorProjectId);
GO

CREATE TABLE dbo.Clearstory_Customers(
  Id int NOT NULL PRIMARY KEY,
  Name nvarchar(500) NULL,
  InternalId nvarchar(200) NULL,
  CreatorId int NULL,
  Address nvarchar(500) NULL,
  City nvarchar(200) NULL,
  State nvarchar(100) NULL,
  ZipCode nvarchar(50) NULL,
  Country nvarchar(200) NULL,
  Phone nvarchar(100) NULL,
  Fax nvarchar(100) NULL,
  LastSyncedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

CREATE TABLE dbo.Clearstory_CustomerOffices(
  CustomerId int NOT NULL,
  OfficeId int NOT NULL,
  LastSyncedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT PK_Clearstory_CustomerOffices PRIMARY KEY (CustomerId, OfficeId)
);
CREATE INDEX IX_Clearstory_CustomerOffices_OfficeId ON dbo.Clearstory_CustomerOffices(OfficeId);
GO

CREATE TABLE dbo.Clearstory_Labels(
  Id int NOT NULL PRIMARY KEY,
  Name nvarchar(500) NULL,
  CompanyStandard bit NULL,
  Active bit NULL,
  UpdatedAt datetime2 NULL,
  CreatedAt datetime2 NULL,
  LastSyncedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

CREATE TABLE dbo.Clearstory_ChangeNotifications(
  Id nvarchar(32) NOT NULL PRIMARY KEY,
  LastInbox nvarchar(20) NULL,
  [Type] nvarchar(200) NULL,
  TypeId int NULL,
  Status nvarchar(100) NULL,
  StatusChangedAt datetime2 NULL,
  Title nvarchar(500) NULL,
  Description nvarchar(4000) NULL,
  CustomerReferenceNumber nvarchar(200) NULL,
  DateSubmitted datetime2 NULL,
  DateReceived datetime2 NULL,
  DueDate datetime2 NULL,
  Estimate decimal(18,2) NULL,
  CostImpact decimal(18,2) NULL,
  ProjectedCost decimal(18,2) NULL,
  TotalSubmitted int NULL,
  TotalResponded int NULL,
  CustomerName nvarchar(500) NULL,
  CustomerId int NULL,
  ProjectId int NULL,
  ProjectJobNumber nvarchar(100) NULL,
  ProjectTitle nvarchar(255) NULL,
  UpdatedAt datetime2 NULL,
  CreatedAt datetime2 NULL,
  LastSyncedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

CREATE TABLE dbo.Clearstory_ChangeNotificationContracts(
  ChangeNotificationId nvarchar(32) NOT NULL,
  ContractId int NOT NULL,
  NoCostImpact bit NULL,
  HasResponded bit NULL,
  Estimate decimal(18,2) NULL,
  FileDownloadCount int NULL,
  ContractName nvarchar(500) NULL,
  ContractValue decimal(18,2) NULL,
  ResponseUpdatedAt datetime2 NULL,
  ResponseCreatedAt datetime2 NULL,
  LastSyncedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
  PRIMARY KEY (ChangeNotificationId, ContractId)
);
GO

CREATE TABLE dbo.Clearstory_Projects(
  Id int NOT NULL PRIMARY KEY,
  JobNumber nvarchar(100) NULL,
  CustomerJobNumber nvarchar(100) NULL,
  Name nvarchar(255) NULL,
  OfficeId int NULL,
  OfficeName nvarchar(255) NULL,
  Region nvarchar(100) NULL,
  Division nvarchar(100) NULL,
  CustomerName nvarchar(255) NULL,
  CustomerId int NULL,
  CompanyId int NULL,
  Archived bit NULL,
  OriginType nvarchar(100) NULL,
  SiteProjectAddress nvarchar(500) NULL,
  SiteStreetAddress nvarchar(500) NULL,
  SiteCity nvarchar(200) NULL,
  SiteState nvarchar(100) NULL,
  SiteZipCode nvarchar(50) NULL,
  SiteCountry nvarchar(200) NULL,
  StartDate date NULL,
  EndDate date NULL,
  BaseContractValue decimal(18,2) NULL,
  UpdatedAt datetime2 NULL,
  CreatedAt datetime2 NULL,
  LastSyncedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME()
);
CREATE INDEX IX_Clearstory_Projects_JobNumber ON dbo.Clearstory_Projects(JobNumber);
GO

CREATE TABLE dbo.Clearstory_Cors(
  Id nvarchar(64) NOT NULL PRIMARY KEY,
  NumericId int NULL,
  Uuid uniqueidentifier NULL,
  ProjectId int NULL,
  JobNumber nvarchar(100) NULL,
  CorNumber nvarchar(100) NULL,
  IssueNumber nvarchar(100) NULL,
  Title nvarchar(500) NULL,
  Description nvarchar(4000) NULL,
  EntryMethod nvarchar(100) NULL,
  Type nvarchar(50) NULL,
  Status nvarchar(50) NULL,
  Stage nvarchar(50) NULL,
  BallInCourt nvarchar(50) NULL,
  Version int NULL,
  CustomerJobNumber nvarchar(100) NULL,
  CustomerReferenceNumber nvarchar(200) NULL,
  ChangeNotificationId int NULL,
  ProjectName nvarchar(255) NULL,
  ContractId int NULL,
  CustomerName nvarchar(255) NULL,
  ContractorName nvarchar(255) NULL,
  CustomerCoNumber nvarchar(100) NULL,
  DateSubmitted datetime2 NULL,
  RequestedAmount decimal(18,2) NULL,
  InReviewAmount decimal(18,2) NULL,
  ApprovedCoIssuedAmount decimal(18,2) NULL,
  ApprovedToProceedAmount decimal(18,2) NULL,
  TotalAmount decimal(18,2) NULL,
  VoidAmount decimal(18,2) NULL,
  VoidDate datetime2 NULL,
  CoIssueDate datetime2 NULL,
  ApprovedToProceedDate datetime2 NULL,
  ApprovedOrVoidDate datetime2 NULL,
  UpdatedAt datetime2 NULL,
  CreatedAt datetime2 NULL,
  LastSyncedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME()
);
CREATE INDEX IX_Clearstory_Cors_ProjectId ON dbo.Clearstory_Cors(ProjectId);
CREATE INDEX IX_Clearstory_Cors_JobNumber ON dbo.Clearstory_Cors(JobNumber);
CREATE INDEX IX_Clearstory_Cors_Status ON dbo.Clearstory_Cors(Status);
GO

CREATE TABLE dbo.Clearstory_Tags(
  Id int NOT NULL PRIMARY KEY,
  Uuid uniqueidentifier NULL,
  ProjectId int NULL,
  JobNumber nvarchar(100) NULL,
  Number nvarchar(100) NULL,
  PaddedTagNumber nvarchar(100) NULL,
  Title nvarchar(255) NULL,
  Status nvarchar(50) NULL,
  CustomerReferenceNumber nvarchar(200) NULL,
  DateOfWorkPerformed datetime2 NULL,
  SignedAt datetime2 NULL,
  UpdatedAt datetime2 NULL,
  CreatedAt datetime2 NULL,
  LastSyncedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME()
);
CREATE INDEX IX_Clearstory_Tags_ProjectId ON dbo.Clearstory_Tags(ProjectId);
GO

CREATE TABLE dbo.Clearstory_Rates(
  RateType nvarchar(20) NOT NULL,
  RecordId int NOT NULL,
  InternalId nvarchar(200) NULL,
  RateGroupId int NULL,
  RateGroupName nvarchar(300) NULL,
  LaborClass nvarchar(500) NULL,
  StraightTimeRate decimal(18,4) NULL,
  OverTimeRate decimal(18,4) NULL,
  DoubleTimeRate decimal(18,4) NULL,
  PremiumOverTimeRate decimal(18,4) NULL,
  PremiumDoubleTimeRate decimal(18,4) NULL,
  ItemName nvarchar(500) NULL,
  Unit nvarchar(100) NULL,
  RateAmount decimal(18,4) NULL,
  StandardAmount decimal(18,4) NULL,
  StandardItem bit NULL,
  AutoCalculateTotal bit NULL,
  UpdatedAt datetime2 NULL,
  CreatedAt datetime2 NULL,
  LastSyncedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
  PRIMARY KEY (RateType, RecordId)
);
GO

CREATE TABLE dbo.Clearstory_ProjectRates(
  ProjectId int NOT NULL,
  RateType nvarchar(20) NOT NULL,
  RecordId int NOT NULL,
  InternalId nvarchar(200) NULL,
  RateGroupId int NULL,
  RateGroupName nvarchar(300) NULL,
  LaborClass nvarchar(500) NULL,
  StraightTimeRate decimal(18,4) NULL,
  OverTimeRate decimal(18,4) NULL,
  DoubleTimeRate decimal(18,4) NULL,
  PremiumOverTimeRate decimal(18,4) NULL,
  PremiumDoubleTimeRate decimal(18,4) NULL,
  ItemName nvarchar(500) NULL,
  Unit nvarchar(100) NULL,
  RateAmount decimal(18,4) NULL,
  StandardAmount decimal(18,4) NULL,
  StandardItem bit NULL,
  AutoCalculateTotal bit NULL,
  UpdatedAt datetime2 NULL,
  CreatedAt datetime2 NULL,
  LastSyncedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
  PRIMARY KEY (ProjectId, RateType, RecordId)
);
GO

CREATE TABLE dbo.Clearstory_SyncSnapshots(
  Id int NOT NULL IDENTITY(1,1) PRIMARY KEY,
  ResourceType nvarchar(80) NOT NULL,
  ResourceKey nvarchar(400) NOT NULL,
  Payload nvarchar(max) NULL,
  FetchedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME()
);
CREATE INDEX IX_Clearstory_SyncSnapshots_Type_Key_Time
  ON dbo.Clearstory_SyncSnapshots(ResourceType, ResourceKey, FetchedAt DESC);
GO

CREATE TABLE dbo.Clearstory_ApiPayloads(
  ResourceType nvarchar(80) NOT NULL,
  ResourceKey nvarchar(400) NOT NULL,
  PayloadJson nvarchar(max) NULL,
  LastFetchedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT PK_Clearstory_ApiPayloads PRIMARY KEY (ResourceType, ResourceKey)
);
GO
