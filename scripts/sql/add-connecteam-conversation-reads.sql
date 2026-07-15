-- Per-app-user last-read cursor for Connecteam chat unread badges.
-- Idempotent.

IF OBJECT_ID('dbo.Connecteam_ConversationReads', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.Connecteam_ConversationReads (
    AppUserId int NOT NULL,
    ConversationId nvarchar(64) NOT NULL,
    LastReadMessageId bigint NULL,
    LastReadAt datetime2 NOT NULL,
    UpdatedAt datetime2 NOT NULL CONSTRAINT DF_Connecteam_ConversationReads_UpdatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_Connecteam_ConversationReads PRIMARY KEY (AppUserId, ConversationId)
  );
  CREATE INDEX IX_Connecteam_ConversationReads_Conv
    ON dbo.Connecteam_ConversationReads(ConversationId);
END
GO

PRINT 'Connecteam conversation reads ready.';
