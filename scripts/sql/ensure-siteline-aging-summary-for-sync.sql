-- Reference only: your Siteline_AgingSummary should match the app entity (see TypeORM SitelineAgingSummary).
-- If the table is missing, create it to match; if column names differ, rename or alter to match.

IF OBJECT_ID(N'dbo.Siteline_AgingSummary', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.Siteline_AgingSummary (
    Id INT IDENTITY(1, 1) NOT NULL PRIMARY KEY,
    CompanyId NVARCHAR(50) NULL,
    StartDate NVARCHAR(10) NULL,
    EndDate NVARCHAR(10) NULL,
    AmountOutstandingThisMonth BIGINT NULL,
    AmountAged30Days BIGINT NULL,
    AmountAged60Days BIGINT NULL,
    AmountAged90Days BIGINT NULL,
    AmountAged120Days BIGINT NULL,
    AverageDaysToPaid DECIMAL(18, 4) NULL,
    NumCurrent INT NULL,
    NumAged30Days INT NULL,
    NumAged60Days INT NULL,
    NumAged90Days INT NULL,
    NumAged120Days INT NULL,
    AmountAgedTotal BIGINT NULL,
    AmountAgedCurrent BIGINT NULL,
    AmountAgedBreakdown30Days BIGINT NULL,
    AmountAgedBreakdown60Days BIGINT NULL,
    AmountAgedBreakdown90Days BIGINT NULL,
    AmountAgedBreakdown120Days BIGINT NULL,
    AmountAgedTotalOverdueOnly BIGINT NULL,
    CreatedAt DATETIME2 NOT NULL
  );
END
