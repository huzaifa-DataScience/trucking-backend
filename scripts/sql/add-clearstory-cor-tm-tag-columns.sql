-- Clearstory COR: T&M tag fields from ChangeOrderRequest API (tmTags, manualTmTag, daysInReview).
IF COL_LENGTH('dbo.Clearstory_Cors', 'TmTagNumbers') IS NULL
  ALTER TABLE dbo.Clearstory_Cors ADD TmTagNumbers nvarchar(500) NULL;

IF COL_LENGTH('dbo.Clearstory_Cors', 'ManualTmTag') IS NULL
  ALTER TABLE dbo.Clearstory_Cors ADD ManualTmTag nvarchar(255) NULL;

IF COL_LENGTH('dbo.Clearstory_Cors', 'TmTagCount') IS NULL
  ALTER TABLE dbo.Clearstory_Cors ADD TmTagCount int NULL;

IF COL_LENGTH('dbo.Clearstory_Cors', 'DaysInReview') IS NULL
  ALTER TABLE dbo.Clearstory_Cors ADD DaysInReview decimal(18,4) NULL;
