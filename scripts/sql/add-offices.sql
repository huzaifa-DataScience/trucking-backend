-- Known offices (admin-maintained) and which office each sign-in was at.
-- Add-only and idempotent.

IF OBJECT_ID('dbo.App_Offices', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.App_Offices (
    Id int IDENTITY(1,1) NOT NULL PRIMARY KEY,
    Name nvarchar(200) NOT NULL,
    Latitude decimal(9,6) NOT NULL,
    Longitude decimal(9,6) NOT NULL,
    CreatedAt datetime2 NOT NULL CONSTRAINT DF_App_Offices_CreatedAt DEFAULT SYSUTCDATETIME()
  );
END
GO

IF COL_LENGTH('dbo.App_User_Sign_In_Locations', 'OfficeId') IS NULL
BEGIN
  ALTER TABLE dbo.App_User_Sign_In_Locations ADD OfficeId int NULL;
END
GO

IF OBJECT_ID('dbo.FK_App_User_Sign_In_Locations_Office', 'F') IS NULL
BEGIN
  ALTER TABLE dbo.App_User_Sign_In_Locations
    ADD CONSTRAINT FK_App_User_Sign_In_Locations_Office FOREIGN KEY (OfficeId) REFERENCES dbo.App_Offices(Id) ON DELETE SET NULL;
END
