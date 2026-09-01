-- Intake party directory. Idempotent.
IF OBJECT_ID(N'dbo.Bid_Parties', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.Bid_Parties (
    PartyId int IDENTITY(1,1) NOT NULL PRIMARY KEY,
    Role nvarchar(40) NOT NULL,
    Name nvarchar(500) NULL,
    Company nvarchar(500) NULL,
    ContactName nvarchar(500) NULL,
    Email nvarchar(500) NULL,
    Phone nvarchar(100) NULL,
    DedupeKey nvarchar(400) NOT NULL,
    UpdatedAt datetime2 NOT NULL CONSTRAINT DF_Bid_Parties_UpdatedAt DEFAULT SYSUTCDATETIME()
  );
  CREATE UNIQUE INDEX UX_Bid_Parties_Dedupe ON dbo.Bid_Parties(DedupeKey);
  CREATE INDEX IX_Bid_Parties_Role ON dbo.Bid_Parties(Role);
END
