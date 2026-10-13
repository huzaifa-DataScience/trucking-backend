-- Forgot-password links (one-time, 30 minutes). Only a SHA-256 hash of each token is stored.
-- The backend also creates this table on startup (PasswordResetService); this script is for running it by hand.
-- Idempotent.

IF OBJECT_ID('dbo.Auth_PasswordResetTokens', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.Auth_PasswordResetTokens (
    Id int IDENTITY(1,1) NOT NULL PRIMARY KEY,
    UserId int NOT NULL,
    TokenHash nvarchar(64) NOT NULL,
    ExpiresAt datetime2 NOT NULL,
    UsedAt datetime2 NULL,
    CreatedAt datetime2 NOT NULL CONSTRAINT DF_Auth_PasswordResetTokens_CreatedAt DEFAULT SYSUTCDATETIME(),
    RequestIp nvarchar(64) NULL
  );
  CREATE UNIQUE INDEX UX_Auth_PasswordResetTokens_TokenHash ON dbo.Auth_PasswordResetTokens (TokenHash);
  CREATE INDEX IX_Auth_PasswordResetTokens_UserId ON dbo.Auth_PasswordResetTokens (UserId, CreatedAt DESC);
END
