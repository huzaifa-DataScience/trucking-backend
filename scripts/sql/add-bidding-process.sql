-- Bid lifecycle (PJ process): header filters + ProcessJson on Bid_Content + wage-decision lookup.
-- Reuses Bids + Bid_Content. No Bid_Startup table (that 1:1 never existed; Bid_Content is it).
-- Idempotent. Run: npm run bidding-migrate-process
-- See docs/FRONTEND_BIDDING_LIFECYCLE.md

IF COL_LENGTH('dbo.Bids', 'ProcessStage') IS NULL
BEGIN
  ALTER TABLE dbo.Bids ADD ProcessStage nvarchar(40) NOT NULL
    CONSTRAINT DF_Bids_ProcessStage DEFAULT 'first_input';
END

IF COL_LENGTH('dbo.Bids', 'WorkType') IS NULL
BEGIN
  ALTER TABLE dbo.Bids ADD WorkType nvarchar(40) NULL;
END

IF COL_LENGTH('dbo.Bid_Content', 'ProcessJson') IS NULL
BEGIN
  ALTER TABLE dbo.Bid_Content ADD ProcessJson nvarchar(MAX) NULL;
END

IF OBJECT_ID('dbo.Bid_WageDecisions', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.Bid_WageDecisions (
    WageDecisionId int IDENTITY(1,1) NOT NULL PRIMARY KEY,
    DecisionNumber nvarchar(80) NOT NULL,
    DecisionDate date NULL,
    County nvarchar(100) NULL,
    Jurisdiction nvarchar(40) NULL,
    Category nvarchar(100) NULL,
    Wage decimal(10,2) NULL,
    Fringe decimal(10,2) NULL,
    IsActive bit NOT NULL CONSTRAINT DF_Bid_WageDecisions_IsActive DEFAULT 1,
    SortOrder int NOT NULL CONSTRAINT DF_Bid_WageDecisions_SortOrder DEFAULT 0
  );
END
GO

-- Davis-Bacon / county / state decision #s (not Bid_WageRates). Source: EstimationFile List + 2026 wage-rate jurisdictions.
IF NOT EXISTS (SELECT 1 FROM dbo.Bid_WageDecisions)
INSERT INTO dbo.Bid_WageDecisions
  (DecisionNumber, DecisionDate, County, Jurisdiction, Category, Wage, Fringe, IsActive, SortOrder)
VALUES
  (N'DC20240002 Mod 7',            '2025-07-04', NULL,                  N'dc',      N'Davis-Bacon Building', 40.77, 20.17, 1, 1),
  (N'2026 - DC/Federal in DC/CITIZEN', '2026-02-21', NULL,              N'dc',      N'Federal / Citizen',    40.77, 20.17, 1, 2),
  (N'2026 - Maryland/Federal',     '2026-02-21', NULL,                  N'md',      N'Federal',              40.77, 20.42, 1, 3),
  (N'2025 - MD - PG County',       '2025-07-28', N'Prince George''s',   N'md',      N'County prevail',       40.02, 19.83, 1, 4),
  (N'2025 - MD - Balt. County',    '2025-07-28', N'Baltimore County',   N'md',      N'County prevail',       40.02, 19.83, 1, 5),
  (N'2024 - MD Prevail',           '2025-01-01', NULL,                  N'md',      N'State prevail',        39.27, 19.42, 1, 6),
  (N'2026 - Virginia',             '2026-02-21', NULL,                  N'va',      N'State / Federal',      39.27, 18.67, 1, 7),
  (N'2023 - Federal',              '2024-10-01', NULL,                  N'federal', N'Davis-Bacon',          40.02, 19.67, 1, 8),
  (N'2021 - Federal',              '2023-10-01', NULL,                  N'federal', N'Davis-Bacon',          39.27, 18.67, 1, 9),
  (N'2019 - Federal',              '2021-04-01', NULL,                  N'federal', N'Davis-Bacon',          38.01, 17.62, 1, 10),
  (N'2017 - Federal',              '2019-04-01', NULL,                  N'federal', N'Davis-Bacon',          35.13, 16.22, 1, 11),
  (N'2015 - Federal',              '2017-04-01', NULL,                  N'federal', N'Davis-Bacon',          35.03, 15.32, 1, 12),
  (N'2013 - Federal',              '2015-04-01', NULL,                  N'federal', N'Davis-Bacon',          33.13, 13.60, 1, 13);
GO

IF COL_LENGTH('dbo.Bids', 'OutcomeStatus') IS NULL
BEGIN
  ALTER TABLE dbo.Bids ADD OutcomeStatus nvarchar(40) NOT NULL
    CONSTRAINT DF_Bids_OutcomeStatus DEFAULT 'open';
END
GO

-- PDF workflow stages. Awarded/lost is OutcomeStatus, not ProcessStage.
UPDATE dbo.Bids SET OutcomeStatus = 'awarded', ProcessStage = 'post_bid'
  WHERE ProcessStage = 'awarded';
UPDATE dbo.Bids SET ProcessStage = 'intake' WHERE ProcessStage = 'first_input';
UPDATE dbo.Bids SET ProcessStage = 'estimating_setup' WHERE ProcessStage = 'estimating';
UPDATE dbo.Bids SET ProcessStage = 'post_bid' WHERE ProcessStage IN ('intelligence', 'production');
GO

IF COL_LENGTH('dbo.App_Users', 'EstimatesFilterJson') IS NULL
BEGIN
  ALTER TABLE dbo.App_Users ADD EstimatesFilterJson nvarchar(2000) NULL;
END
GO
