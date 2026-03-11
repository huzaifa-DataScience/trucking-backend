-- SQL Script to Add Status and LastLoginAt Columns to App_Users Table
-- Run this in your SQL Server Docker container

-- Add Status column if it doesn't exist
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.App_Users') AND name = 'Status')
BEGIN
    ALTER TABLE dbo.App_Users 
    ADD Status nvarchar(50) NOT NULL DEFAULT 'pending';
    PRINT 'Added Status column to App_Users table';
END
ELSE
BEGIN
    PRINT 'Status column already exists';
END

-- Add LastLoginAt column if it doesn't exist
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.App_Users') AND name = 'LastLoginAt')
BEGIN
    ALTER TABLE dbo.App_Users 
    ADD LastLoginAt datetime2 NULL;
    PRINT 'Added LastLoginAt column to App_Users table';
END
ELSE
BEGIN
    PRINT 'LastLoginAt column already exists';
END

-- Set existing users to 'active' (backward compatibility)
UPDATE dbo.App_Users 
SET Status = 'active' 
WHERE Status IS NULL OR Status = '';

-- Set admin users to 'active' explicitly
UPDATE dbo.App_Users 
SET Status = 'active' 
WHERE Role = 'admin';

PRINT 'Migration completed successfully!';
SELECT COUNT(*) AS TotalUsers, Status, COUNT(*) AS Count
FROM dbo.App_Users
GROUP BY Status;
