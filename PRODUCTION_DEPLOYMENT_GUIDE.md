# Production Deployment Guide

This guide covers deploying the backend to production with an **existing production database**.

---

## 🎯 Key Points

### Current Setup (Development)
- ✅ **Auto-migration enabled**: App automatically adds `Status` and `LastLoginAt` columns on startup
- ✅ **Works great for:** Local development, Docker, new databases
- ⚠️ **Not ideal for:** Production databases with existing data

### Production Deployment
- ✅ **Manual migration recommended**: Run SQL scripts before deploying code
- ✅ **Safer**: You control when/how migrations run
- ✅ **Better for:** Production databases, zero-downtime deployments

---

## 📋 Pre-Deployment Checklist

### 1. Database Migration (Run BEFORE deploying code)

**Before deploying the new code**, run this SQL on your **production database**:

```sql
-- Add Status column if it doesn't exist
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.App_Users') AND name = 'Status')
BEGIN
    ALTER TABLE dbo.App_Users 
    ADD Status nvarchar(50) NOT NULL DEFAULT 'pending';
    PRINT 'Added Status column';
END

-- Add LastLoginAt column if it doesn't exist
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.App_Users') AND name = 'LastLoginAt')
BEGIN
    ALTER TABLE dbo.App_Users 
    ADD LastLoginAt datetime2 NULL;
    PRINT 'Added LastLoginAt column';
END

-- Set existing users to 'active' (so they can still login)
UPDATE dbo.App_Users 
SET Status = 'active' 
WHERE Status IS NULL OR Status = '' OR Status IS NOT NULL;

-- Set admin users to 'active' explicitly
UPDATE dbo.App_Users 
SET Status = 'active' 
WHERE Role = 'admin';
```

**Save this as:** `PRODUCTION_MIGRATION.sql`

---

## 🚀 Deployment Steps

### Step 1: Backup Production Database
```bash
# Backup your production database before migration
# Use your database backup tool or SQL Server backup command
```

### Step 2: Run Migration Script
**Connect to production database** and run `PRODUCTION_MIGRATION.sql`:

**Option A: Using SQL Server Management Studio / Azure Data Studio**
1. Connect to production SQL Server
2. Open `PRODUCTION_MIGRATION.sql`
3. Run the script
4. Verify: `SELECT Email, Role, Status FROM dbo.App_Users;`

**Option B: Using sqlcmd (if you have access)**
```bash
sqlcmd -S your-production-server.database.windows.net \
  -U your-username \
  -P your-password \
  -d GoFormzDB \
  -i PRODUCTION_MIGRATION.sql
```

### Step 3: Verify Migration
```sql
-- Check columns exist
SELECT COLUMN_NAME 
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_NAME = 'App_Users' 
ORDER BY ORDINAL_POSITION;

-- Should show: Id, Email, PasswordHash, Role, Status, CreatedAt, LastLoginAt

-- Check user statuses
SELECT Email, Role, Status, COUNT(*) 
FROM dbo.App_Users 
GROUP BY Email, Role, Status;
```

### Step 4: Deploy Backend Code
After migration is complete, deploy your backend:
- Deploy to your hosting (Azure, AWS, Heroku, etc.)
- The app will start and work with the migrated database
- Auto-migration code will detect columns exist and skip adding them

---

## 🔒 Production Environment Variables

**Update your production `.env` or environment variables:**

```env
# Database (Production)
DB_HOST=your-production-server.database.windows.net
DB_PORT=1433
DB_USERNAME=your-production-username
DB_PASSWORD=your-production-password
DB_DATABASE=GoFormzDB
DB_ENCRYPT=true
DB_TRUST_CERT=false

# JWT (IMPORTANT: Use strong secret in production!)
JWT_SECRET=your-very-strong-random-secret-at-least-32-chars-long
JWT_EXPIRES_IN=7d

# App
PORT=3000
NODE_ENV=production
```

---

## ⚠️ Important Notes

### Auto-Migration Behavior in Production

**The auto-migration (`UsersInitService`) will:**
- ✅ Check if columns exist
- ✅ Add them if missing (safe - won't duplicate)
- ✅ Set existing users to 'active' (backward compatibility)

**However:**
- ⚠️ **Best practice:** Run migration manually BEFORE deploying code
- ⚠️ **Why?** You have control, can test, can rollback if needed
- ⚠️ **Auto-migration is a safety net**, not the primary method

### If You Skip Manual Migration

**If you deploy code first** (before running SQL):
- App will try to add columns on startup
- This **will work** but:
  - Migration runs during app startup (adds latency)
  - Less control over timing
  - Harder to rollback if something goes wrong

**Recommendation:** Always run manual migration first in production.

---

## 🔄 Rollback Plan (If Needed)

**If migration causes issues, rollback:**

```sql
-- Remove columns (only if absolutely necessary)
ALTER TABLE dbo.App_Users DROP COLUMN Status;
ALTER TABLE dbo.App_Users DROP COLUMN LastLoginAt;
```

**Then:** Deploy previous version of code (without status field).

---

## 📝 Migration Scripts Summary

| Script | Purpose | When to Run |
|--------|---------|-------------|
| `ADD_STATUS_COLUMNS.sql` | Development/local DB | When setting up local DB |
| `PRODUCTION_MIGRATION.sql` | Production DB | **Before deploying code to production** |

---

## ✅ Production Deployment Checklist

- [ ] Backup production database
- [ ] Run `PRODUCTION_MIGRATION.sql` on production DB
- [ ] Verify columns exist: `Status`, `LastLoginAt`
- [ ] Verify existing users have `Status = 'active'`
- [ ] Update production environment variables (DB connection, JWT_SECRET)
- [ ] Deploy backend code
- [ ] Test login with existing admin user
- [ ] Test new signup (should be pending)
- [ ] Test admin approval workflow

---

## 🎯 Summary

**For Production:**
1. ✅ **Run SQL migration FIRST** (before deploying code)
2. ✅ **Then deploy code** (app will work with migrated DB)
3. ✅ **Auto-migration is safety net** (won't break if columns exist)

**For Development:**
- ✅ Auto-migration is fine (runs on app startup)
- ✅ Convenient for local development

**Best Practice:** Always run manual migrations in production for better control and safety.
