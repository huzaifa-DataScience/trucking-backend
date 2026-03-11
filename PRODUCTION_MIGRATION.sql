-- Production Database Migration Script
-- Run this on your PRODUCTION database BEFORE deploying the new backend code
-- 
-- This script:
-- 1. Adds Status column (pending/active/inactive/rejected)
-- 2. Adds LastLoginAt column (for tracking)
-- 3. Sets all existing users to 'active' (so they can still login)
-- 4. Ensures admin users are 'active'

USE GoFormzDB;
GO

PRINT 'Starting migration: Adding Status and LastLoginAt columns...';
GO

-- Step 1: Add Status column if it doesn't exist
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.App_Users') AND name = 'Status')
BEGIN
    ALTER TABLE dbo.App_Users 
    ADD Status nvarchar(50) NOT NULL DEFAULT 'pending';
    PRINT '✅ Added Status column to App_Users table';
END
ELSE
BEGIN
    PRINT 'ℹ️  Status column already exists - skipping';
END
GO

-- Step 2: Add LastLoginAt column if it doesn't exist
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.App_Users') AND name = 'LastLoginAt')
BEGIN
    ALTER TABLE dbo.App_Users 
    ADD LastLoginAt datetime2 NULL;
    PRINT '✅ Added LastLoginAt column to App_Users table';
END
ELSE
BEGIN
    PRINT 'ℹ️  LastLoginAt column already exists - skipping';
END
GO

-- Step 3: Set existing users to 'active' (backward compatibility)
-- This ensures all existing users can still login after migration
-- Only update if Status column was just added (has default 'pending' value)
UPDATE dbo.App_Users 
SET Status = 'active' 
WHERE Status = 'pending' OR Status IS NULL OR Status = '';
PRINT '✅ Updated existing users to active status';
GO

-- Step 4: Ensure all admin users are 'active'
UPDATE dbo.App_Users 
SET Status = 'active' 
WHERE Role = 'admin' AND Status != 'active';
PRINT '✅ Ensured admin users are active';
GO

-- Step 5: Verify migration
PRINT '';
PRINT 'Migration Summary:';
SELECT 
    Status,
    COUNT(*) AS UserCount
FROM dbo.App_Users
GROUP BY Status
ORDER BY Status;
GO

PRINT '';
PRINT '✅ Migration completed successfully!';
PRINT 'You can now deploy the new backend code.';
GO
