-- Where each person was when they signed in (browser location + the floor they picked).
-- Add-only and idempotent.

IF OBJECT_ID('dbo.App_User_Sign_In_Locations', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.App_User_Sign_In_Locations (
    Id int IDENTITY(1,1) NOT NULL PRIMARY KEY,
    UserId int NOT NULL,
    Latitude decimal(9,6) NOT NULL,
    Longitude decimal(9,6) NOT NULL,
    AccuracyM float NOT NULL,
    Floor nvarchar(40) NOT NULL,
    CreatedAt datetime2 NOT NULL CONSTRAINT DF_App_User_Sign_In_Locations_CreatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_App_User_Sign_In_Locations_User FOREIGN KEY (UserId) REFERENCES dbo.App_Users(Id)
  );
  CREATE INDEX IX_App_User_Sign_In_Locations_CreatedAt ON dbo.App_User_Sign_In_Locations (CreatedAt DESC);
  CREATE INDEX IX_App_User_Sign_In_Locations_User ON dbo.App_User_Sign_In_Locations (UserId, CreatedAt DESC);
END
