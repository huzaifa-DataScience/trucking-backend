-- Personal calendar: custom events a person adds for themselves.
-- Everything else on the calendar (bid dates, takeoff, Connecteam) is read from existing tables.
-- Idempotent.

IF OBJECT_ID('dbo.Calendar_Events', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.Calendar_Events (
    EventId int IDENTITY(1,1) NOT NULL PRIMARY KEY,
    OwnerUserId int NOT NULL,
    Title nvarchar(200) NOT NULL,
    Description nvarchar(2000) NULL,
    Location nvarchar(300) NULL,
    AllDay bit NOT NULL CONSTRAINT DF_Calendar_Events_AllDay DEFAULT 0,
    -- All-day: UTC midnight of the calendar date; EndAt is the inclusive last day.
    StartAt datetime2 NOT NULL,
    EndAt datetime2 NULL,
    BidId int NULL,
    CreatedAt datetime2 NOT NULL CONSTRAINT DF_Calendar_Events_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt datetime2 NOT NULL CONSTRAINT DF_Calendar_Events_UpdatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_Calendar_Events_Owner FOREIGN KEY (OwnerUserId) REFERENCES dbo.App_Users(Id) ON DELETE CASCADE,
    CONSTRAINT FK_Calendar_Events_Bid FOREIGN KEY (BidId) REFERENCES dbo.Bids(BidId) ON DELETE SET NULL
  );
  CREATE INDEX IX_Calendar_Events_Owner ON dbo.Calendar_Events (OwnerUserId, StartAt);
END
