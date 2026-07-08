-- =============================================================================
-- Connecteam chat: message metadata, conversation previews, webhook dedup.
-- Run after add-connecteam-write-support.sql. Idempotent.
-- =============================================================================

IF COL_LENGTH('dbo.Connecteam_Messages', 'IsDeleted') IS NULL
  ALTER TABLE dbo.Connecteam_Messages
    ADD IsDeleted bit NOT NULL CONSTRAINT DF_Connecteam_Messages_IsDeleted DEFAULT 0;

IF COL_LENGTH('dbo.Connecteam_Messages', 'MessageType') IS NULL
  ALTER TABLE dbo.Connecteam_Messages ADD MessageType nvarchar(40) NULL;

IF COL_LENGTH('dbo.Connecteam_Messages', 'AttachmentsJson') IS NULL
  ALTER TABLE dbo.Connecteam_Messages ADD AttachmentsJson nvarchar(max) NULL;

IF COL_LENGTH('dbo.Connecteam_Messages', 'ModifiedAt') IS NULL
  ALTER TABLE dbo.Connecteam_Messages ADD ModifiedAt datetime2 NULL;

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'UX_Connecteam_Messages_External'
    AND object_id = OBJECT_ID('dbo.Connecteam_Messages')
)
BEGIN
  CREATE UNIQUE INDEX UX_Connecteam_Messages_External
    ON dbo.Connecteam_Messages(ConversationId, ExternalMessageId)
    WHERE ExternalMessageId IS NOT NULL;
END

IF COL_LENGTH('dbo.Connecteam_Conversations', 'IsDeleted') IS NULL
  ALTER TABLE dbo.Connecteam_Conversations
    ADD IsDeleted bit NOT NULL CONSTRAINT DF_Connecteam_Conversations_IsDeleted DEFAULT 0;

IF COL_LENGTH('dbo.Connecteam_Conversations', 'LastMessageAt') IS NULL
  ALTER TABLE dbo.Connecteam_Conversations ADD LastMessageAt datetime2 NULL;

IF COL_LENGTH('dbo.Connecteam_Conversations', 'LastMessagePreview') IS NULL
  ALTER TABLE dbo.Connecteam_Conversations ADD LastMessagePreview nvarchar(500) NULL;

IF COL_LENGTH('dbo.Connecteam_Conversations', 'LastMessageSenderName') IS NULL
  ALTER TABLE dbo.Connecteam_Conversations ADD LastMessageSenderName nvarchar(200) NULL;

IF COL_LENGTH('dbo.Connecteam_Conversations', 'MessageCount') IS NULL
  ALTER TABLE dbo.Connecteam_Conversations
    ADD MessageCount int NOT NULL CONSTRAINT DF_Connecteam_Conversations_MessageCount DEFAULT 0;

GO

PRINT 'Connecteam chat support ready.';
