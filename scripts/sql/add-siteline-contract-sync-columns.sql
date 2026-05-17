-- Siteline: columns for pay-app-driven contract sync (run once on GoFormzDB / wherever Siteline tables live).
-- Safe to re-run: only adds missing columns.

IF COL_LENGTH('dbo.Siteline_Contracts', 'LatestTotalValue') IS NULL
  ALTER TABLE dbo.Siteline_Contracts ADD LatestTotalValue BIGINT NULL;

IF COL_LENGTH('dbo.Siteline_Contracts', 'ContractNumber') IS NULL
  ALTER TABLE dbo.Siteline_Contracts ADD ContractNumber NVARCHAR(100) NULL;

IF COL_LENGTH('dbo.Siteline_PayApps', 'BillingType') IS NULL
  ALTER TABLE dbo.Siteline_PayApps ADD BillingType NVARCHAR(50) NULL;
