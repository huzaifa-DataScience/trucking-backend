# SQL Server: Restore and Export (Backup)

- **Restore:** Load a database from a `.bak` file (e.g. production backup → local).
- **Export:** Create a `.bak` backup of a database, or export schema only for comparison.

---

## Prerequisites

- **SQL Server** installed (Express, Developer, or Standard/Enterprise).
- **SQL Server Management Studio (SSMS)** installed (recommended), or access to run T-SQL (e.g. `sqlcmd`, Azure Data Studio, or another client).
- The **.bak file** on a path that the SQL Server service account can read (e.g. `C:\Backups\YourDatabase.bak`).
- Enough **disk space** for the restored database (at least the size of the .bak, often more).

---

## Export: Create a .bak backup (full database)

Use this when you want to **back up** a database so you can restore it elsewhere or keep a snapshot.

### Using SSMS (GUI)

1. Connect to your SQL Server in **SSMS**.
2. In **Object Explorer**, expand **Databases**, right-click the database (e.g. **GoFormzDB**).
3. Click **Tasks** → **Back Up...**.
4. In **Back Up Database**:
   - **Backup type:** Full (default).
   - **Destination:** Under “Back up to”, ensure **Disk** is selected. Click **Add** and choose a path and filename, e.g. `C:\Backups\GoFormzDB_2025-02-24.bak`. Click **OK**.
5. Click **OK** to run the backup. When it finishes, the `.bak` file is ready to copy or use for restore.

### Using T-SQL

Run in a **New Query** window (replace database name and path):

```sql
BACKUP DATABASE GoFormzDB
TO DISK = N'C:\Backups\GoFormzDB_2025-02-24.bak'
WITH COMPRESSION, STATS = 10;
```

- **COMPRESSION** reduces size (supported in most editions). Omit if your edition doesn’t support it.
- Ensure the folder `C:\Backups` exists and the SQL Server service account has write permission.

### Using sqlcmd (command line)

```bat
sqlcmd -S localhost -U sa -P "YourPassword" -Q "BACKUP DATABASE GoFormzDB TO DISK = N'C:\Backups\GoFormzDB.bak' WITH STATS = 10"
```

---

## Export: Schema only (for comparison with code)

Use this to get a **script of tables/columns** (no data) so you can compare the database design with the app’s TypeORM entities.

### Using SSMS

1. Right-click the database (e.g. **GoFormzDB**) → **Tasks** → **Generate Scripts**.
2. **Choose objects:** “Select specific database objects” → expand **Tables** → select the tables you care about (or select “Script all objects”).
3. Click **Next** → **Advanced**.
4. Set **Types of data to script** to **Schema only**.
5. Set **Script DROP and CREATE** to **Script CREATE** (or “Script DROP and CREATE” if you want both).
6. Click **Next**, choose **Save to file**, pick a path (e.g. `C:\Backups\GoFormzDB_Schema.sql`), finish the wizard.
7. Open the `.sql` file in an editor or share it to compare with the codebase.

---

## Restore: Load database from a .bak file

---

## Option A: Restore using SQL Server Management Studio (SSMS)

### Step 1: Open SSMS and connect

1. Start **SQL Server Management Studio**.
2. Connect to your instance (e.g. `localhost`, `.\SQLEXPRESS`, or `your-server\instance`).
3. Use Windows Authentication or SQL Server Authentication (e.g. `sa` and password).

### Step 2: Start the Restore wizard

1. In **Object Explorer**, right-click **Databases**.
2. Click **Restore Database...**.

### Step 3: Choose backup source

1. Select **Device** (not “Database”).
2. Click the **...** (Browse) button next to the device list.
3. Click **Add**.
4. Browse to your `.bak` file (e.g. `C:\Backups\YourDatabase.bak`).
5. Click **OK** twice to return to the Restore Database window.

### Step 4: Set restore options

1. **Destination**
   - **Database:** Enter the name you want for the restored database (e.g. `GoFormzDB` or `GoFormzDB_Restored`).
   - If that name already exists and you want to overwrite it, see “Overwrite existing database” below.

2. **Source – Backup sets**
   - Select the backup set(s) you want to restore (usually the most recent full backup).

3. **Options** (left pane)
   - **Overwrite existing database:** Check this if you want to replace an existing database with the same name.
   - **Restore as:** You can change the logical file names and paths for the data (.mdf) and log (.ldf) files if needed (e.g. to avoid path conflicts).

### Step 5: Run the restore

1. Click **OK**.
2. Wait for the restore to finish. You should see “Restore of database ‘YourDatabase’ completed successfully.”

### Step 6: Verify

1. In Object Explorer, expand **Databases**.
2. Refresh (F5) if needed. Your restored database should appear.
3. Expand it → **Tables** to confirm tables (e.g. `dbo.Ref_Jobs`, `dbo.Ref_OurEntities`, `dbo.Fact_SiteTickets`) are there.

---

## Option B: Restore using T-SQL

Use this from SSMS (New Query), Azure Data Studio, or `sqlcmd`.

### Step 1: List backup contents (optional)

To see backup sets and logical file names inside the .bak:

```sql
RESTORE FILELISTONLY
FROM DISK = N'C:\Backups\YourDatabase.bak';
```

Note the logical names (e.g. `YourDB` for data, `YourDB_log` for log). You may need them if you restore to different file paths.

### Step 2: Restore the database

**Replace:**

- `C:\Backups\YourDatabase.bak` → path to your .bak.
- `GoFormzDB_Restored` → name for the restored database.
- `C:\Data\` → folder where SQL Server can create .mdf/.ldf (must exist; use your actual path).

```sql
RESTORE DATABASE GoFormzDB_Restored
FROM DISK = N'C:\Backups\YourDatabase.bak'
WITH
  MOVE 'LogicalDataFileName' TO 'C:\Data\GoFormzDB_Restored.mdf',
  MOVE 'LogicalLogFileName' TO 'C:\Data\GoFormzDB_Restored_log.ldf',
  REPLACE,
  STATS = 10;
```

- Get `LogicalDataFileName` and `LogicalLogFileName` from the `RESTORE FILELISTONLY` result (column `LogicalName`).
- **REPLACE** overwrites an existing database with the same name. Omit if you are creating a new name.
- **STATS = 10** prints progress every 10%.

**Minimal form** (if you’re okay with default paths and overwriting an existing DB):

```sql
RESTORE DATABASE GoFormzDB_Restored
FROM DISK = N'C:\Backups\YourDatabase.bak'
WITH REPLACE, STATS = 10;
```

### Step 3: Verify

```sql
USE GoFormzDB_Restored;

SELECT TABLE_SCHEMA, TABLE_NAME
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_TYPE = 'BASE TABLE'
ORDER BY TABLE_SCHEMA, TABLE_NAME;
```

---

## Option C: Restore from command line (sqlcmd)

1. Open **Command Prompt** or **PowerShell** (Run as Administrator if needed).
2. Run (adjust paths and server name):

```bat
sqlcmd -S localhost -U sa -P "YourPassword" -Q "RESTORE DATABASE GoFormzDB_Restored FROM DISK = N'C:\Backups\YourDatabase.bak' WITH REPLACE, STATS = 10"
```

- `-S` = server (e.g. `localhost`, `.\SQLEXPRESS`, `your-server,1433`).
- `-U` / `-P` = login and password (or use `-E` for Windows Authentication).

---

## After restore: point the app at the restored DB

Your app connects with settings from `.env` (e.g. `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD`).

- If you restored **with the same database name** on the same server/port, no change needed.
- If you restored to a **new name** (e.g. `GoFormzDB_Restored`), set in `.env`:

```env
DB_DATABASE=GoFormzDB_Restored
```

Then restart the backend so it uses the restored database.

---

## Optional: export schema for comparison

To compare the restored database with the app’s TypeORM entities:

1. In SSMS: right-click the restored database → **Tasks** → **Generate Scripts**.
2. Choose “Select specific database objects” → select **Tables** (or the ones you care about).
3. Advanced: set **Types of data to script** to **Schema only**.
4. Save to a `.sql` file and share that file (or paste relevant parts) to compare with the codebase.

---

## Troubleshooting

| Issue | What to try |
|-------|---------------------|
| “Access denied” to .bak | Move .bak to a folder SQL Server can read (e.g. default data directory), or grant the SQL Server service account read access to the file. |
| “File is in use” | Stop apps using the DB; set DB to single-user: `ALTER DATABASE YourDB SET SINGLE_USER WITH ROLLBACK IMMEDIATE;` then restore, then `ALTER DATABASE YourDB SET MULTI_USER;`. |
| “Insufficient space” | Free disk space or restore to a drive with more space (use MOVE in RESTORE). |
| Restore very slow | Restore to a fast disk; avoid network paths for the .bak if possible. |
| Login fails after restore | If you use SQL auth, ensure the login exists on the server and is mapped to a user in the restored database, or re-create the user. |

---

## Quick checklist

- [ ] .bak file path is accessible by SQL Server.
- [ ] Chosen database name (or REPLACE) and file paths are correct.
- [ ] Restore completed without errors.
- [ ] Tables visible under Databases → … → Tables.
- [ ] `.env` `DB_DATABASE` (and host/port if different) updated if needed.
- [ ] Backend restarted and can connect to the restored database.
