-- =============================================================================
-- Connecteam / workforce write support: native app records + chat messages.
-- Run after add-connecteam-tables.sql. Idempotent.
-- =============================================================================

-- RecordSource: 'sync' = mirrored from Connecteam; 'native' = created via our API.
IF COL_LENGTH('dbo.Connecteam_TimeActivities', 'RecordSource') IS NULL
  ALTER TABLE dbo.Connecteam_TimeActivities
    ADD RecordSource nvarchar(10) NOT NULL
      CONSTRAINT DF_Connecteam_TimeActivities_RecordSource DEFAULT 'sync';

IF COL_LENGTH('dbo.Connecteam_ScheduledShifts', 'RecordSource') IS NULL
  ALTER TABLE dbo.Connecteam_ScheduledShifts
    ADD RecordSource nvarchar(10) NOT NULL
      CONSTRAINT DF_Connecteam_ScheduledShifts_RecordSource DEFAULT 'sync';

IF COL_LENGTH('dbo.Connecteam_FormSubmissions', 'RecordSource') IS NULL
  ALTER TABLE dbo.Connecteam_FormSubmissions
    ADD RecordSource nvarchar(10) NOT NULL
      CONSTRAINT DF_Connecteam_FormSubmissions_RecordSource DEFAULT 'sync';

IF COL_LENGTH('dbo.Connecteam_TimeOffRequests', 'RecordSource') IS NULL
  ALTER TABLE dbo.Connecteam_TimeOffRequests
    ADD RecordSource nvarchar(10) NOT NULL
      CONSTRAINT DF_Connecteam_TimeOffRequests_RecordSource DEFAULT 'sync';

IF COL_LENGTH('dbo.Connecteam_Tasks', 'RecordSource') IS NULL
  ALTER TABLE dbo.Connecteam_Tasks
    ADD RecordSource nvarchar(10) NOT NULL
      CONSTRAINT DF_Connecteam_Tasks_RecordSource DEFAULT 'sync';

IF COL_LENGTH('dbo.Connecteam_Conversations', 'RecordSource') IS NULL
  ALTER TABLE dbo.Connecteam_Conversations
    ADD RecordSource nvarchar(10) NOT NULL
      CONSTRAINT DF_Connecteam_Conversations_RecordSource DEFAULT 'sync';

-- Link portal App_Users to Connecteam roster (optional; email fallback also supported).
IF COL_LENGTH('dbo.Connecteam_Users', 'AppUserId') IS NULL
BEGIN
  ALTER TABLE dbo.Connecteam_Users ADD AppUserId int NULL;
  CREATE INDEX IX_Connecteam_Users_AppUserId ON dbo.Connecteam_Users(AppUserId);
END

IF OBJECT_ID('dbo.Connecteam_Messages', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.Connecteam_Messages (
    MessageId bigint IDENTITY(1,1) NOT NULL PRIMARY KEY,
    ConversationId nvarchar(64) NOT NULL,
    UserId int NULL,
    AppUserId int NULL,
    Body nvarchar(max) NOT NULL,
    SentAt datetime2 NOT NULL CONSTRAINT DF_Connecteam_Messages_SentAt DEFAULT SYSUTCDATETIME(),
    RecordSource nvarchar(10) NOT NULL CONSTRAINT DF_Connecteam_Messages_RecordSource DEFAULT 'native',
    ExternalMessageId nvarchar(64) NULL
  );
  CREATE INDEX IX_Connecteam_Messages_Conversation ON dbo.Connecteam_Messages(ConversationId, SentAt DESC);
  CREATE INDEX IX_Connecteam_Messages_UserId ON dbo.Connecteam_Messages(UserId);
END

GO

PRINT 'Connecteam write support ready.';
