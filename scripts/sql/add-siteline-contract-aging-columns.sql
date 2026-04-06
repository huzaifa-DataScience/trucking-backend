-- Run once against the SAME database as DB_DATABASE in .env (synchronize=false).
-- Caches Siteline agingDashboard per contract. Must match TypeORM column names on SitelineContract.
IF COL_LENGTH('dbo.Siteline_Contracts', 'agingBreakdownJson') IS NULL
  ALTER TABLE dbo.Siteline_Contracts ADD agingBreakdownJson NVARCHAR(MAX) NULL;

IF COL_LENGTH('dbo.Siteline_Contracts', 'agingDashboardStartDate') IS NULL
  ALTER TABLE dbo.Siteline_Contracts ADD agingDashboardStartDate NVARCHAR(10) NULL;

IF COL_LENGTH('dbo.Siteline_Contracts', 'agingDashboardEndDate') IS NULL
  ALTER TABLE dbo.Siteline_Contracts ADD agingDashboardEndDate NVARCHAR(10) NULL;

IF COL_LENGTH('dbo.Siteline_Contracts', 'agingBreakdownSyncedAt') IS NULL
  ALTER TABLE dbo.Siteline_Contracts ADD agingBreakdownSyncedAt DATETIME2 NULL;
