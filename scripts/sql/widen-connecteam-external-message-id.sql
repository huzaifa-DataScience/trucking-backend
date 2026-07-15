-- Connecteam message ids can be `{conversationUuid}-{messageUuid}` (~73 chars).
IF EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'UX_Connecteam_Messages_External'
    AND object_id = OBJECT_ID('dbo.Connecteam_Messages')
)
  DROP INDEX UX_Connecteam_Messages_External ON dbo.Connecteam_Messages;
GO

IF COL_LENGTH('dbo.Connecteam_Messages', 'ExternalMessageId') IS NOT NULL
BEGIN
  ALTER TABLE dbo.Connecteam_Messages
    ALTER COLUMN ExternalMessageId nvarchar(200) NULL;
END
GO

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
GO
