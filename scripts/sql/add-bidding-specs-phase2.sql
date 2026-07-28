-- Specs phase 2: Trimble link on Bids + item catalog for Structshare pick.
-- Idempotent.

IF COL_LENGTH('dbo.Bids', 'TrimbleProjectId') IS NULL
BEGIN
  ALTER TABLE dbo.Bids ADD TrimbleProjectId bigint NULL;
  CREATE INDEX IX_Bids_TrimbleProjectId ON dbo.Bids(TrimbleProjectId);
END
GO

IF OBJECT_ID('dbo.Bid_ItemCatalog', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.Bid_ItemCatalog (
    ItemId bigint IDENTITY(1,1) NOT NULL PRIMARY KEY,
    ItemName nvarchar(500) NOT NULL,
    Price decimal(18,6) NULL,
    NameLc nvarchar(500) NOT NULL,
    Size1 decimal(18,6) NULL,
    Size2 decimal(18,6) NULL,
    IsActive bit NOT NULL CONSTRAINT DF_Bid_ItemCatalog_Active DEFAULT 1,
    UpdatedAt datetime2 NOT NULL CONSTRAINT DF_Bid_ItemCatalog_UpdatedAt DEFAULT SYSUTCDATETIME()
  );
  CREATE INDEX IX_Bid_ItemCatalog_Sizes ON dbo.Bid_ItemCatalog(Size1, Size2) INCLUDE (Price, NameLc);
  CREATE INDEX IX_Bid_ItemCatalog_NameLc ON dbo.Bid_ItemCatalog(NameLc);
END
GO
