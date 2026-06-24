-- =============================================================================
-- Connecteam workforce mirror (users, jobs, time clocks, shift time activities).
-- Read-only sync from Connecteam API → SQL → our REST API / frontend.
-- Idempotent. See src/connecteam/.
-- =============================================================================

IF OBJECT_ID('dbo.Connecteam_SyncState', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.Connecteam_SyncState (
    [Key] nvarchar(100) NOT NULL PRIMARY KEY,
    [Value] nvarchar(max) NULL,
    UpdatedAt datetime2 NOT NULL CONSTRAINT DF_Connecteam_SyncState_UpdatedAt DEFAULT SYSUTCDATETIME()
  );
END

IF OBJECT_ID('dbo.Connecteam_Account', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.Connecteam_Account (
    CompanyId nvarchar(64) NOT NULL PRIMARY KEY,
    CompanyName nvarchar(500) NULL,
    LastSyncedAt datetime2 NOT NULL CONSTRAINT DF_Connecteam_Account_LastSyncedAt DEFAULT SYSUTCDATETIME()
  );
END

IF OBJECT_ID('dbo.Connecteam_Users', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.Connecteam_Users (
    UserId int NOT NULL PRIMARY KEY,
    FirstName nvarchar(100) NULL,
    LastName nvarchar(100) NULL,
    Email nvarchar(320) NULL,
    PhoneNumber nvarchar(50) NULL,
    UserType nvarchar(40) NULL,
    EmployeeId nvarchar(64) NULL,
    IsArchived bit NOT NULL CONSTRAINT DF_Connecteam_Users_IsArchived DEFAULT 0,
    ProfilePictureUrl nvarchar(1000) NULL,
    CreatedAt datetime2 NULL,
    ModifiedAt datetime2 NULL,
    LastLoginAt datetime2 NULL,
    LastSyncedAt datetime2 NOT NULL CONSTRAINT DF_Connecteam_Users_LastSyncedAt DEFAULT SYSUTCDATETIME()
  );
  CREATE INDEX IX_Connecteam_Users_Email ON dbo.Connecteam_Users(Email);
  CREATE INDEX IX_Connecteam_Users_EmployeeId ON dbo.Connecteam_Users(EmployeeId);
END

IF OBJECT_ID('dbo.Connecteam_Jobs', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.Connecteam_Jobs (
    JobId nvarchar(64) NOT NULL PRIMARY KEY,
    Title nvarchar(500) NULL,
    Code nvarchar(64) NULL,
    NormalizedJobNumber nvarchar(20) NULL,
    Description nvarchar(max) NULL,
    Color nvarchar(20) NULL,
    CompanyLabel nvarchar(200) NULL,
    GpsAddress nvarchar(500) NULL,
    GpsLatitude decimal(12,8) NULL,
    GpsLongitude decimal(12,8) NULL,
    IsDeleted bit NOT NULL CONSTRAINT DF_Connecteam_Jobs_IsDeleted DEFAULT 0,
    RefJobId int NULL,
    LastSyncedAt datetime2 NOT NULL CONSTRAINT DF_Connecteam_Jobs_LastSyncedAt DEFAULT SYSUTCDATETIME()
  );
  CREATE INDEX IX_Connecteam_Jobs_Code ON dbo.Connecteam_Jobs(Code);
  CREATE INDEX IX_Connecteam_Jobs_NormalizedJobNumber ON dbo.Connecteam_Jobs(NormalizedJobNumber);
  CREATE INDEX IX_Connecteam_Jobs_RefJobId ON dbo.Connecteam_Jobs(RefJobId);
END

IF OBJECT_ID('dbo.Connecteam_TimeClocks', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.Connecteam_TimeClocks (
    TimeClockId int NOT NULL PRIMARY KEY,
    Name nvarchar(200) NOT NULL,
    IsArchived bit NOT NULL CONSTRAINT DF_Connecteam_TimeClocks_IsArchived DEFAULT 0,
    LastSyncedAt datetime2 NOT NULL CONSTRAINT DF_Connecteam_TimeClocks_LastSyncedAt DEFAULT SYSUTCDATETIME()
  );
END

IF OBJECT_ID('dbo.Connecteam_TimeActivities', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.Connecteam_TimeActivities (
    TimeClockId int NOT NULL,
    ShiftId nvarchar(64) NOT NULL,
    UserId int NOT NULL,
    JobId nvarchar(64) NULL,
    SubJobId nvarchar(64) NULL,
    StartTimestamp bigint NULL,
    EndTimestamp bigint NULL,
    StartTimezone nvarchar(80) NULL,
    EndTimezone nvarchar(80) NULL,
    DurationMinutes decimal(12,2) NULL,
    EmployeeNote nvarchar(1000) NULL,
    ManagerNote nvarchar(1000) NULL,
    IsAutoClockOut bit NOT NULL CONSTRAINT DF_Connecteam_TimeActivities_IsAutoClockOut DEFAULT 0,
    CreatedAt datetime2 NULL,
    ModifiedAt datetime2 NULL,
    LastSyncedAt datetime2 NOT NULL CONSTRAINT DF_Connecteam_TimeActivities_LastSyncedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_Connecteam_TimeActivities PRIMARY KEY (TimeClockId, ShiftId)
  );
  CREATE INDEX IX_Connecteam_TimeActivities_UserId ON dbo.Connecteam_TimeActivities(UserId);
  CREATE INDEX IX_Connecteam_TimeActivities_JobId ON dbo.Connecteam_TimeActivities(JobId);
  CREATE INDEX IX_Connecteam_TimeActivities_Start ON dbo.Connecteam_TimeActivities(StartTimestamp);
END

IF OBJECT_ID('dbo.Connecteam_Schedulers', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.Connecteam_Schedulers (
    SchedulerId int NOT NULL PRIMARY KEY,
    Name nvarchar(200) NOT NULL,
    Timezone nvarchar(80) NULL,
    IsArchived bit NOT NULL CONSTRAINT DF_Connecteam_Schedulers_IsArchived DEFAULT 0,
    LastSyncedAt datetime2 NOT NULL CONSTRAINT DF_Connecteam_Schedulers_LastSyncedAt DEFAULT SYSUTCDATETIME()
  );
END

IF OBJECT_ID('dbo.Connecteam_ScheduledShifts', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.Connecteam_ScheduledShifts (
    SchedulerId int NOT NULL,
    ShiftId nvarchar(64) NOT NULL,
    Title nvarchar(500) NULL,
    JobId nvarchar(64) NULL,
    StartTime bigint NULL,
    EndTime bigint NULL,
    Timezone nvarchar(80) NULL,
    IsOpenShift bit NOT NULL CONSTRAINT DF_Connecteam_ScheduledShifts_IsOpen DEFAULT 0,
    IsPublished bit NOT NULL CONSTRAINT DF_Connecteam_ScheduledShifts_IsPublished DEFAULT 0,
    AssignedUserIdsJson nvarchar(max) NULL,
    LocationAddress nvarchar(500) NULL,
    LastSyncedAt datetime2 NOT NULL CONSTRAINT DF_Connecteam_ScheduledShifts_LastSyncedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_Connecteam_ScheduledShifts PRIMARY KEY (SchedulerId, ShiftId),
    CONSTRAINT CK_Connecteam_ScheduledShifts_AssignedUsers CHECK (AssignedUserIdsJson IS NULL OR ISJSON(AssignedUserIdsJson) = 1)
  );
  CREATE INDEX IX_Connecteam_ScheduledShifts_JobId ON dbo.Connecteam_ScheduledShifts(JobId);
  CREATE INDEX IX_Connecteam_ScheduledShifts_Start ON dbo.Connecteam_ScheduledShifts(StartTime);
END

IF OBJECT_ID('dbo.Connecteam_Forms', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.Connecteam_Forms (
    FormId nvarchar(64) NOT NULL PRIMARY KEY,
    Name nvarchar(500) NULL,
    IsArchived bit NOT NULL CONSTRAINT DF_Connecteam_Forms_IsArchived DEFAULT 0,
    LastSyncedAt datetime2 NOT NULL CONSTRAINT DF_Connecteam_Forms_LastSyncedAt DEFAULT SYSUTCDATETIME()
  );
END

IF OBJECT_ID('dbo.Connecteam_FormSubmissions', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.Connecteam_FormSubmissions (
    FormId nvarchar(64) NOT NULL,
    SubmissionId nvarchar(64) NOT NULL,
    UserId int NULL,
    SubmittedAt bigint NULL,
    Status nvarchar(40) NULL,
    SummaryJson nvarchar(max) NULL,
    LastSyncedAt datetime2 NOT NULL CONSTRAINT DF_Connecteam_FormSubmissions_LastSyncedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_Connecteam_FormSubmissions PRIMARY KEY (FormId, SubmissionId),
    CONSTRAINT CK_Connecteam_FormSubmissions_Summary CHECK (SummaryJson IS NULL OR ISJSON(SummaryJson) = 1)
  );
  CREATE INDEX IX_Connecteam_FormSubmissions_UserId ON dbo.Connecteam_FormSubmissions(UserId);
  CREATE INDEX IX_Connecteam_FormSubmissions_SubmittedAt ON dbo.Connecteam_FormSubmissions(SubmittedAt);
END

IF OBJECT_ID('dbo.Connecteam_TimeOffRequests', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.Connecteam_TimeOffRequests (
    RequestId nvarchar(64) NOT NULL PRIMARY KEY,
    UserId int NOT NULL,
    PolicyTypeId nvarchar(64) NULL,
    Status nvarchar(20) NOT NULL,
    IsAllDay bit NOT NULL CONSTRAINT DF_Connecteam_TimeOff_IsAllDay DEFAULT 1,
    StartDate date NULL,
    EndDate date NULL,
    StartTime nvarchar(20) NULL,
    EndTime nvarchar(20) NULL,
    Timezone nvarchar(80) NULL,
    DurationAmount decimal(12,2) NULL,
    DurationUnits nvarchar(20) NULL,
    EmployeeNote nvarchar(1000) NULL,
    ManagerNote nvarchar(1000) NULL,
    TimeClockId int NULL,
    LastSyncedAt datetime2 NOT NULL CONSTRAINT DF_Connecteam_TimeOff_LastSyncedAt DEFAULT SYSUTCDATETIME()
  );
  CREATE INDEX IX_Connecteam_TimeOff_UserId ON dbo.Connecteam_TimeOffRequests(UserId);
  CREATE INDEX IX_Connecteam_TimeOff_StartDate ON dbo.Connecteam_TimeOffRequests(StartDate);
END

IF OBJECT_ID('dbo.Connecteam_TaskBoards', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.Connecteam_TaskBoards (
    TaskBoardId int NOT NULL PRIMARY KEY,
    Name nvarchar(200) NOT NULL,
    IsArchived bit NOT NULL CONSTRAINT DF_Connecteam_TaskBoards_IsArchived DEFAULT 0,
    LastSyncedAt datetime2 NOT NULL CONSTRAINT DF_Connecteam_TaskBoards_LastSyncedAt DEFAULT SYSUTCDATETIME()
  );
END

IF OBJECT_ID('dbo.Connecteam_Tasks', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.Connecteam_Tasks (
    TaskBoardId int NOT NULL,
    TaskId nvarchar(64) NOT NULL,
    Title nvarchar(500) NULL,
    Status nvarchar(40) NULL,
    Type nvarchar(40) NULL,
    StartTime bigint NULL,
    DueDate bigint NULL,
    UserIdsJson nvarchar(max) NULL,
    LabelIdsJson nvarchar(max) NULL,
    IsArchived bit NOT NULL CONSTRAINT DF_Connecteam_Tasks_IsArchived DEFAULT 0,
    DescriptionSummary nvarchar(1000) NULL,
    LastSyncedAt datetime2 NOT NULL CONSTRAINT DF_Connecteam_Tasks_LastSyncedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_Connecteam_Tasks PRIMARY KEY (TaskBoardId, TaskId),
    CONSTRAINT CK_Connecteam_Tasks_UserIds CHECK (UserIdsJson IS NULL OR ISJSON(UserIdsJson) = 1),
    CONSTRAINT CK_Connecteam_Tasks_LabelIds CHECK (LabelIdsJson IS NULL OR ISJSON(LabelIdsJson) = 1)
  );
  CREATE INDEX IX_Connecteam_Tasks_Status ON dbo.Connecteam_Tasks(Status);
  CREATE INDEX IX_Connecteam_Tasks_DueDate ON dbo.Connecteam_Tasks(DueDate);
END

IF OBJECT_ID('dbo.Connecteam_Conversations', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.Connecteam_Conversations (
    ConversationId nvarchar(64) NOT NULL PRIMARY KEY,
    Title nvarchar(500) NULL,
    Type nvarchar(40) NULL,
    ConversationSource nvarchar(40) NULL,
    LastSyncedAt datetime2 NOT NULL CONSTRAINT DF_Connecteam_Conversations_LastSyncedAt DEFAULT SYSUTCDATETIME()
  );
END

IF OBJECT_ID('dbo.Connecteam_WebhookEvents', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.Connecteam_WebhookEvents (
    Id bigint IDENTITY(1,1) NOT NULL PRIMARY KEY,
    RequestId nvarchar(64) NULL,
    FeatureType nvarchar(40) NULL,
    EventType nvarchar(80) NULL,
    ActivityType nvarchar(40) NULL,
    EventTimestamp bigint NULL,
    PayloadJson nvarchar(max) NULL,
    ReceivedAt datetime2 NOT NULL CONSTRAINT DF_Connecteam_WebhookEvents_ReceivedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_Connecteam_WebhookEvents_Payload CHECK (PayloadJson IS NULL OR ISJSON(PayloadJson) = 1)
  );
  CREATE INDEX IX_Connecteam_WebhookEvents_ReceivedAt ON dbo.Connecteam_WebhookEvents(ReceivedAt DESC);
  CREATE INDEX IX_Connecteam_WebhookEvents_EventType ON dbo.Connecteam_WebhookEvents(EventType);
END

GO

PRINT 'Connecteam tables ready.';
