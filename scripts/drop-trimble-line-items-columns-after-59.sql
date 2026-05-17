/*
  Drops every column on dbo.Trimble_ProjectLineItems after ORDINAL_POSITION 59.
  Keeps the first 59 columns as currently ordered in INFORMATION_SCHEMA (typically
  Id, ProjectId, ExcelRowNumber, then Excel-derived columns in add order).

  Run in SSMS against the correct database. Preview first; uncomment EXEC when ready.

  WARNING: Destroys data in dropped columns. Backup first.
*/

SET NOCOUNT ON;

PRINT N'--- Columns that WILL BE KEPT (ordinal <= 59) ---';
SELECT ORDINAL_POSITION, COLUMN_NAME
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = N'dbo'
  AND TABLE_NAME = N'Trimble_ProjectLineItems'
  AND ORDINAL_POSITION <= 59
ORDER BY ORDINAL_POSITION;

PRINT N'--- Columns that WILL BE DROPPED (ordinal > 59) ---';
SELECT ORDINAL_POSITION, COLUMN_NAME
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = N'dbo'
  AND TABLE_NAME = N'Trimble_ProjectLineItems'
  AND ORDINAL_POSITION > 59
ORDER BY ORDINAL_POSITION;

DECLARE @sql nvarchar(max) = N'';

SELECT @sql = @sql + N'ALTER TABLE dbo.Trimble_ProjectLineItems DROP COLUMN ' + QUOTENAME(COLUMN_NAME) + N';' + CHAR(13)
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = N'dbo'
  AND TABLE_NAME = N'Trimble_ProjectLineItems'
  AND ORDINAL_POSITION > 59
ORDER BY ORDINAL_POSITION DESC;

IF (@sql = N'' OR @sql IS NULL)
BEGIN
  PRINT N'Nothing to drop (no columns after ordinal 59).';
END
ELSE
BEGIN
  PRINT N'--- Generated batch ---';
  PRINT @sql;
  -- Uncomment to execute:
  -- EXEC sys.sp_executesql @sql;
  PRINT N'Done (preview only). Uncomment EXEC sys.sp_executesql @sql in the script to run drops.';
END
