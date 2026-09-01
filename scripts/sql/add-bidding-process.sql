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
