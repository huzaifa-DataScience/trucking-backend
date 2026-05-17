-- One-off: derive LeadPmEmail from LeadPmName (firstname.lastname@goelservices.com).
-- Prefer: npm run backfill-siteline-pm-emails (matches app slug rules).
-- This SQL uses first token + last token only (no punctuation stripping).

DECLARE @domain nvarchar(64) = N'goelservices.com';

;WITH named AS (
  SELECT
    id,
    LTRIM(RTRIM(leadPmName)) AS fullName,
    CHARINDEX(N' ', LTRIM(RTRIM(leadPmName)) + N' ') AS sp
  FROM dbo.Siteline_Contracts
  WHERE leadPmName IS NOT NULL
    AND LTRIM(RTRIM(leadPmName)) <> N''
    AND (leadPmEmail IS NULL OR LTRIM(RTRIM(leadPmEmail)) = N'')
),
derived AS (
  SELECT
    id,
    LOWER(LEFT(fullName, sp - 1))
      + N'.'
      + LOWER(
          REVERSE(LEFT(REVERSE(fullName), CHARINDEX(N' ', REVERSE(fullName) + N' ') - 1))
        )
      + N'@'
      + @domain AS email
  FROM named
  WHERE sp > 1
)
UPDATE c
SET leadPmEmail = d.email
FROM dbo.Siteline_Contracts c
INNER JOIN derived d ON d.id = c.id;

PRINT CONCAT(N'Siteline_Contracts rows updated: ', @@ROWCOUNT);

;WITH named AS (
  SELECT
    Id,
    LTRIM(RTRIM(LeadPmName)) AS fullName,
    CHARINDEX(N' ', LTRIM(RTRIM(LeadPmName)) + N' ') AS sp
  FROM dbo.Siteline_AgingContracts
  WHERE LeadPmName IS NOT NULL
    AND LTRIM(RTRIM(LeadPmName)) <> N''
    AND (LeadPmEmail IS NULL OR LTRIM(RTRIM(LeadPmEmail)) = N'')
),
derived AS (
  SELECT
    Id,
    LOWER(LEFT(fullName, sp - 1))
      + N'.'
      + LOWER(
          REVERSE(LEFT(REVERSE(fullName), CHARINDEX(N' ', REVERSE(fullName) + N' ') - 1))
        )
      + N'@'
      + @domain AS email
  FROM named
  WHERE sp > 1
)
UPDATE a
SET LeadPmEmail = d.email
FROM dbo.Siteline_AgingContracts a
INNER JOIN derived d ON d.Id = a.Id;

PRINT CONCAT(N'Siteline_AgingContracts rows updated: ', @@ROWCOUNT);
