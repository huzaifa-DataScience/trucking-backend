-- Shared calendar events. Idempotent.
IF COL_LENGTH('dbo.Calendar_Events', 'AttendeeUserIds') IS NULL
  ALTER TABLE dbo.Calendar_Events ADD AttendeeUserIds nvarchar(200) NULL;
