-- =============================================================================
-- Bidding Specs: multiple Mike estimation files per bid.
-- Idempotent. Rows stay in Bid_MikeCsvRows; Bid_MikeFiles is the file library.
-- =============================================================================

IF OBJECT_ID('dbo.Bid_MikeFiles', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.Bid_MikeFiles (
    MikeFileId bigint IDENTITY(1,1) NOT NULL PRIMARY KEY,
    BidId int NOT NULL,
    FileName nvarchar(260) NOT NULL,
    JobNumberHint nvarchar(40) NULL,
    ProjectLabel nvarchar(300) NULL,
    ImportedRowCount int NOT NULL CONSTRAINT DF_Bid_MikeFiles_RowCount DEFAULT 0,
    IsActive bit NOT NULL CONSTRAINT DF_Bid_MikeFiles_IsActive DEFAULT 0,
    CreatedAt datetime2 NOT NULL CONSTRAINT DF_Bid_MikeFiles_CreatedAt DEFAULT SYSUTCDATETIME()
  );
  CREATE INDEX IX_Bid_MikeFiles_BidId ON dbo.Bid_MikeFiles(BidId);
END
GO

IF COL_LENGTH('dbo.Bid_MikeCsvRows', 'MikeFileId') IS NULL
BEGIN
  ALTER TABLE dbo.Bid_MikeCsvRows ADD MikeFileId bigint NULL;
  CREATE INDEX IX_Bid_MikeCsvRows_MikeFileId ON dbo.Bid_MikeCsvRows(MikeFileId);
END
GO

-- Backfill: one legacy file per bid that still has orphan rows
;WITH orphanBids AS (
  SELECT DISTINCT r.BidId
  FROM dbo.Bid_MikeCsvRows r
  WHERE r.MikeFileId IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM dbo.Bid_MikeFiles f
      WHERE f.BidId = r.BidId AND f.FileName = N'Legacy upload'
    )
)
INSERT INTO dbo.Bid_MikeFiles (BidId, FileName, ImportedRowCount, IsActive, CreatedAt)
SELECT
  o.BidId,
  N'Legacy upload',
  (SELECT COUNT(*) FROM dbo.Bid_MikeCsvRows r WHERE r.BidId = o.BidId AND r.MikeFileId IS NULL),
  CASE
    WHEN EXISTS (
      SELECT 1 FROM dbo.Bid_MikeFiles f WHERE f.BidId = o.BidId AND f.IsActive = 1
    ) THEN 0
    ELSE 1
  END,
  SYSUTCDATETIME()
FROM orphanBids o;
GO

UPDATE r
SET r.MikeFileId = (
  SELECT TOP 1 f.MikeFileId
  FROM dbo.Bid_MikeFiles f
  WHERE f.BidId = r.BidId AND f.FileName = N'Legacy upload'
  ORDER BY f.MikeFileId DESC
)
FROM dbo.Bid_MikeCsvRows r
WHERE r.MikeFileId IS NULL;
GO
