-- Location every few minutes while someone has the app open (for the Tracking page).
-- Add-only and idempotent.

IF OBJECT_ID('dbo.App_User_Location_Pings', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.App_User_Location_Pings (
    Id bigint IDENTITY(1,1) NOT NULL PRIMARY KEY,
    UserId int NOT NULL,
    Latitude decimal(9,6) NOT NULL,
    Longitude decimal(9,6) NOT NULL,
    AccuracyM float NOT NULL,
    CreatedAt datetime2 NOT NULL CONSTRAINT DF_App_User_Location_Pings_CreatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_App_User_Location_Pings_User FOREIGN KEY (UserId) REFERENCES dbo.App_Users(Id)
  );
  CREATE INDEX IX_App_User_Location_Pings_Created ON dbo.App_User_Location_Pings (CreatedAt, UserId);
END
