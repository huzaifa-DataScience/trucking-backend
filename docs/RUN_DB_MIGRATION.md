# How to Run Database Migration (Add Status Columns)

Since your SQL Server is running in Docker, here are **3 ways** to run the SQL migration:

---

## Method 1: Using Docker Exec + sqlcmd (Recommended)

**Step 1: Find your SQL Server container name**
```bash
docker ps | grep sql
# OR
docker ps -a | grep sql
```

**Step 2: Connect to SQL Server container and run SQL**
```bash
# Replace 'sql-server' with your actual container name
docker exec -it sql-server /opt/mssql-tools/bin/sqlcmd \
  -S localhost \
  -U sa \
  -P trucking@2026 \
  -d GoFormzDB \
  -i /tmp/add_status_columns.sql
```

**Or run SQL directly:**
```bash
docker exec -it sql-server /opt/mssql-tools/bin/sqlcmd \
  -S localhost \
  -U sa \
  -P trucking@2026 \
  -d GoFormzDB \
  -Q "ALTER TABLE dbo.App_Users ADD Status nvarchar(50) NOT NULL DEFAULT 'pending'; ALTER TABLE dbo.App_Users ADD LastLoginAt datetime2 NULL; UPDATE dbo.App_Users SET Status = 'active' WHERE Status IS NULL OR Status = '';"
```

---

## Method 2: Copy SQL File into Container

**Step 1: Copy the SQL file into container**
```bash
docker cp ADD_STATUS_COLUMNS.sql sql-server:/tmp/add_status_columns.sql
```

**Step 2: Run the SQL file**
```bash
docker exec -it sql-server /opt/mssql-tools/bin/sqlcmd \
  -S localhost \
  -U sa \
  -P trucking@2026 \
  -d GoFormzDB \
  -i /tmp/add_status_columns.sql
```

---

## Method 3: Using Azure Data Studio / SQL Server Management Studio

**If you have Azure Data Studio or SSMS installed:**

1. **Connect to:** `localhost,1433`
2. **Username:** `sa`
3. **Password:** `trucking@2026`
4. **Database:** `GoFormzDB`
5. **Open** `ADD_STATUS_COLUMNS.sql` file
6. **Run** the script

---

## Method 4: Auto-Migration (Easiest - No Manual SQL Needed!)

**Good news:** The app **automatically adds these columns** when it starts!

The `UsersInitService` (runs on app startup) will:
- ✅ Check if `Status` column exists
- ✅ Add it if missing
- ✅ Check if `LastLoginAt` column exists  
- ✅ Add it if missing
- ✅ Set existing users to `'active'` for backward compatibility

**Just restart your NestJS app:**
```bash
npm run start:dev
```

**Check the console output** - you should see:
```
Added Status column to App_Users table
Added LastLoginAt column to App_Users table
```

---

## Verify Migration Worked

**Check columns exist:**
```bash
docker exec -it sql-server /opt/mssql-tools/bin/sqlcmd \
  -S localhost \
  -U sa \
  -P trucking@2026 \
  -d GoFormzDB \
  -Q "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'App_Users' ORDER BY ORDINAL_POSITION;"
```

**Check user statuses:**
```bash
docker exec -it sql-server /opt/mssql-tools/bin/sqlcmd \
  -S localhost \
  -U sa \
  -P trucking@2026 \
  -d GoFormzDB \
  -Q "SELECT Email, Role, Status, CreatedAt FROM dbo.App_Users;"
```

---

## Quick Reference

**Container name:** Check with `docker ps`

**Connection details:**
- Host: `localhost` (or container name)
- Port: `1433`
- Username: `sa`
- Password: `trucking@2026` (from your .env)
- Database: `GoFormzDB`

**SQL file location:** `ADD_STATUS_COLUMNS.sql` (in project root)

---

## Recommended: Use Auto-Migration

**Just restart your app** - it will automatically add the columns! No manual SQL needed.

```bash
npm run start:dev
```

The migration runs automatically on startup via `UsersInitService`.
