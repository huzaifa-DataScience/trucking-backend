-- @mentions on bid comments → dashboard notifications.
IF OBJECT_ID('dbo.Bid_Comment_Mentions', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.Bid_Comment_Mentions (
    CommentId int NOT NULL,
    UserId int NOT NULL,
    ReadAt datetime2 NULL,
    CONSTRAINT PK_Bid_Comment_Mentions PRIMARY KEY (CommentId, UserId),
    CONSTRAINT FK_Bid_CommentMentions_Comment FOREIGN KEY (CommentId) REFERENCES dbo.Bid_Comments(CommentId) ON DELETE CASCADE,
    CONSTRAINT FK_Bid_CommentMentions_User FOREIGN KEY (UserId) REFERENCES dbo.App_Users(Id)
  );
  CREATE INDEX IX_Bid_CommentMentions_User ON dbo.Bid_Comment_Mentions (UserId, ReadAt);
END
