# Troubleshooting SQL Server Connection

## Current Settings (.env)
- Host: `localhost`
- Port: `1433`
- Database: `GoFormzDB`
- Username: `sa`

## Common Issues & Fixes

### 1. SQL Server Not Running
**Check:**
- Windows: Open Services → look for "SQL Server (MSSQLSERVER)" or your instance name → should be "Running"
- macOS/Linux: Check if SQL Server Docker container is running

**Fix:** Start SQL Server service/container

---

### 2. SQL Server Not Listening on Port 1433
**Check:**
- Windows: SQL Server Configuration Manager → SQL Server Network Configuration → Protocols → TCP/IP → Enabled = Yes
- Check if SQL Server Browser service is running

**Fix:** Enable TCP/IP protocol and restart SQL Server

---

### 3. Wrong Host/Port
**If SQL Server is on a different machine:**
- Change `DB_HOST` from `localhost` to the actual server IP/hostname
- Verify port (might not be 1433 if using named instance or custom port)

**If using Azure SQL:**
- `DB_HOST` = `your-server.database.windows.net`
- `DB_PORT` = `1433`
- `DB_ENCRYPT` = `true` (required)

---

### 4. Firewall Blocking Port 1433
**Check:**
- Windows Firewall: Allow port 1433 inbound
- Network firewall/router: Allow port 1433

**Test:** `telnet localhost 1433` (should connect)

---

### 5. SQL Server Authentication Mode
**Check:**
- SQL Server must allow SQL Authentication (not just Windows Auth)
- `sa` account must be enabled

**Fix:** SQL Server Management Studio → Server Properties → Security → SQL Server and Windows Authentication mode

---

### 6. Wrong Database Name
**Check:**
- Database `GoFormzDB` must exist
- Case-sensitive? Try exact name from SQL Server

**Fix:** Verify database name in SQL Server Management Studio

---

## Quick Test Commands

### Test if SQL Server is reachable:
```bash
# macOS/Linux
nc -zv localhost 1433

# Windows PowerShell
Test-NetConnection -ComputerName localhost -Port 1433
```

### Test connection with sqlcmd (if installed):
```bash
sqlcmd -S localhost,1433 -U sa -P trucking@2026 -d GoFormzDB -Q "SELECT 1"
```

---

## Alternative: Use Connection String Format

If the above doesn't work, you can try a full connection string in `.env`:

```env
DB_CONNECTION_STRING=Server=localhost,1433;Database=GoFormzDB;User Id=sa;Password=trucking@2026;Encrypt=true;TrustServerCertificate=true;
```

Then update `database.module.ts` to use the connection string instead of individual fields.
