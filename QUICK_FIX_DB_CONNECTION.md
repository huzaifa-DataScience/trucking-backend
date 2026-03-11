# Quick Fix: Database Connection Error

## Problem
```
ConnectionError: Failed to connect to localhost:1433 - Could not connect
```

## Solution

### Step 1: Start Docker (if using Docker)

**macOS:**
1. Open **Docker Desktop** application
2. Wait for Docker to start (whale icon in menu bar should be steady)
3. Verify: `docker ps` should work without errors

**If Docker Desktop is not installed:**
- Download from: https://www.docker.com/products/docker-desktop
- Install and start it

---

### Step 2: Start SQL Server Container

**If you have a SQL Server Docker container:**

```bash
# List all containers (including stopped)
docker ps -a

# Start SQL Server container (replace 'sql-server' with your container name)
docker start sql-server

# OR if you need to create it:
docker run -e "ACCEPT_EULA=Y" -e "SA_PASSWORD=trucking@2026" \
  -p 1433:1433 --name sql-server \
  -d mcr.microsoft.com/mssql/server:2022-latest
```

**Verify SQL Server is running:**
```bash
docker ps | grep sql
# Should show your SQL Server container as "Up"
```

---

### Step 3: Test Connection

**Test port:**
```bash
nc -zv localhost 1433
# Should show: "Connection to localhost port 1433 [tcp/ms-sql-s] succeeded!"
```

**Test with sqlcmd (if installed):**
```bash
sqlcmd -S localhost,1433 -U sa -P trucking@2026 -Q "SELECT @@VERSION"
```

---

### Step 4: Restart Your NestJS App

```bash
npm run start:dev
```

The connection should work now!

---

## Alternative: SQL Server Not in Docker?

If SQL Server is installed directly on your Mac or running on a remote server:

### Check SQL Server Status

**macOS (if installed via Homebrew):**
```bash
brew services list | grep mssql
brew services start mssql-server
```

**Remote Server:**
- Update `.env`:
  ```env
  DB_HOST=your-server-ip-or-hostname
  DB_PORT=1433
  ```

---

## Still Not Working?

### Check Your .env File

Current settings:
```env
DB_HOST=localhost
DB_PORT=1433
DB_USERNAME=sa
DB_PASSWORD=trucking@2026
DB_DATABASE=GoFormzDB
DB_ENCRYPT=false
DB_TRUST_CERT=true
```

**If SQL Server is on a different host:**
- Change `DB_HOST` to the actual server IP/hostname

**If using a different port:**
- Change `DB_PORT` to the actual port

**If database name is different:**
- Change `DB_DATABASE` to the actual database name

---

## Common Issues

### 1. Docker Not Running
**Fix:** Start Docker Desktop

### 2. SQL Server Container Not Started
**Fix:** `docker start <container-name>`

### 3. Wrong Port
**Fix:** Check what port SQL Server is actually using:
```bash
docker port <container-name>
# Should show: 1433/tcp -> 0.0.0.0:1433
```

### 4. Firewall Blocking
**Fix:** Allow port 1433 in macOS Firewall settings

---

## Quick Test Script

Create `test-db-connection.js`:

```javascript
const sql = require('mssql');

const config = {
  server: 'localhost',
  port: 1433,
  user: 'sa',
  password: 'trucking@2026',
  database: 'GoFormzDB',
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
};

sql.connect(config)
  .then(() => {
    console.log('✅ Database connection successful!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Database connection failed:', err.message);
    process.exit(1);
  });
```

Run: `node test-db-connection.js`

---

## Need Help?

1. Check Docker Desktop is running
2. Check SQL Server container is started: `docker ps`
3. Check port is accessible: `nc -zv localhost 1433`
4. Check `.env` file has correct settings
5. Restart NestJS app: `npm run start:dev`
