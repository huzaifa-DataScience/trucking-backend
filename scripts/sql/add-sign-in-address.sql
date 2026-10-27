-- Readable address for each sign-in (looked up from the coordinates). Add-only and idempotent.

IF COL_LENGTH('dbo.App_User_Sign_In_Locations', 'Address') IS NULL
BEGIN
  ALTER TABLE dbo.App_User_Sign_In_Locations ADD Address nvarchar(400) NULL;
END
