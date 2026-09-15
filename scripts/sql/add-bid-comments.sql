-- Bid comment thread (Notes drawer). Not process.notes / handoff notes.
-- Idempotent.

IF OBJECT_ID('dbo.Bid_Comments', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.Bid_Comments (
    CommentId int IDENTITY(1,1) NOT NULL PRIMARY KEY,
    BidId int NOT NULL,
    UserId int NOT NULL,
    Body nvarchar(max) NULL,
    CreatedAt datetime2 NOT NULL CONSTRAINT DF_Bid_Comments_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt datetime2 NULL,
    DeletedAt datetime2 NULL,
    CONSTRAINT FK_Bid_Comments_Bid FOREIGN KEY (BidId) REFERENCES dbo.Bids(BidId) ON DELETE CASCADE,
    CONSTRAINT FK_Bid_Comments_User FOREIGN KEY (UserId) REFERENCES dbo.App_Users(Id)
  );
  CREATE INDEX IX_Bid_Comments_Bid ON dbo.Bid_Comments (BidId, DeletedAt, CreatedAt);
END

IF OBJECT_ID('dbo.Bid_Comment_Attachments', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.Bid_Comment_Attachments (
    CommentId int NOT NULL,
    AttachmentId int NOT NULL,
    CONSTRAINT PK_Bid_Comment_Attachments PRIMARY KEY (CommentId, AttachmentId),
    CONSTRAINT FK_Bid_CommentAtt_Comment FOREIGN KEY (CommentId) REFERENCES dbo.Bid_Comments(CommentId) ON DELETE CASCADE,
    CONSTRAINT FK_Bid_CommentAtt_Attachment FOREIGN KEY (AttachmentId) REFERENCES dbo.Bid_Attachments(AttachmentId)
  );
END
