-- Captain Settings roster ids (Connecteam / App_Users). Names stay on BidClerk/Duct1/…
-- Idempotent.

IF COL_LENGTH('dbo.Bid_Teams', 'CrewJson') IS NULL
  ALTER TABLE dbo.Bid_Teams ADD CrewJson nvarchar(max) NULL;
