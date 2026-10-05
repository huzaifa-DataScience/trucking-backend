/**
 * Read-only: who connected (or tried to connect) to our SQL Server, and whether
 * the public /seed endpoint was ever hit. Uses the app's DB login from .env, so
 * how much it can see depends on that login's permissions (VIEW SERVER STATE).
 *
 *   npx ts-node --transpile-only scripts/check-db-access-audit.ts
 */
import 'dotenv/config';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const mssql = require('mssql');

const TOP = 20;

function dbConfig() {
  return {
    server: process.env.DB_HOST!,
    port: parseInt(process.env.DB_PORT || '1433', 10),
    user: process.env.DB_USERNAME!,
    password: String(process.env.DB_PASSWORD ?? '').replace(/^"|"$/g, ''),
    database: process.env.DB_DATABASE!,
    options: {
      encrypt: process.env.DB_ENCRYPT === 'true',
      trustServerCertificate: process.env.DB_TRUST_CERT !== 'false',
    },
    requestTimeout: 60000,
  };
}

type Pool = { request: () => { query: (q: string) => Promise<{ recordset: any[] }> } };

function header(title: string): void {
  console.log(`\n${'='.repeat(70)}\n${title}\n${'='.repeat(70)}`);
}

/** Run a read-only probe; a permission error is an answer too, not a crash. */
async function probe(pool: Pool, title: string, sql: string): Promise<any[] | null> {
  header(title);
  try {
    const res = await pool.request().query(sql);
    const rows = res.recordset ?? [];
    if (!rows.length) {
      console.log('(no rows)');
      return rows;
    }
    console.table(rows);
    return rows;
  } catch (err: any) {
    console.log(`UNAVAILABLE — ${err?.message ?? err}`);
    return null;
  }
}

async function main(): Promise<void> {
  const pool: Pool = await mssql.connect(dbConfig());

  await probe(
    pool,
    '1. Who are we, and what are we allowed to see?',
    `SELECT
       @@SERVERNAME                                        AS serverName,
       SUSER_NAME()                                        AS loginName,
       USER_NAME()                                         AS dbUser,
       DB_NAME()                                           AS databaseName,
       CAST(SERVERPROPERTY('Edition') AS nvarchar(100))    AS edition,
       IS_SRVROLEMEMBER('sysadmin')                        AS isSysadmin,
       IS_SRVROLEMEMBER('securityadmin')                   AS isSecurityAdmin,
       HAS_PERMS_BY_NAME(NULL, NULL, 'VIEW SERVER STATE')  AS canViewServerState`,
  );

  // Live connections: who is on the server right now, from which IP / app.
  await probe(
    pool,
    `2. Current connections (last ${TOP} by login time) — needs VIEW SERVER STATE`,
    `SELECT TOP ${TOP}
       s.session_id        AS sessionId,
       s.login_name        AS loginName,
       s.host_name         AS hostName,
       s.program_name      AS programName,
       c.client_net_address AS clientIp,
       s.login_time        AS loginTime,
       s.status            AS status
     FROM sys.dm_exec_sessions s
     LEFT JOIN sys.dm_exec_connections c ON c.session_id = s.session_id
     WHERE s.is_user_process = 1
     ORDER BY s.login_time DESC`,
  );

  // Connection attempts incl. failures, with remote IP. Ring buffer is a rolling
  // in-memory window — it resets on SQL Server restart.
  await probe(
    pool,
    `3. Connection attempts / failures with remote IP (last ${TOP})`,
    `SELECT TOP ${TOP}
       DATEADD(ms, rb.[timestamp] - osi.ms_ticks, SYSDATETIME()) AS eventTime,
       x.value('(Record/ConnectivityTraceRecord/RecordType)[1]', 'varchar(50)')   AS recordType,
       x.value('(Record/ConnectivityTraceRecord/RemoteHost)[1]', 'varchar(50)')   AS remoteIp,
       x.value('(Record/ConnectivityTraceRecord/RemotePort)[1]', 'varchar(20)')   AS remotePort,
       x.value('(Record/ConnectivityTraceRecord/LoginTimers/TotalLoginTimeInMilliseconds)[1]', 'int') AS loginMs,
       x.value('(Record/ConnectivityTraceRecord/TdsBufInfo/TdsInputBufferError)[1]', 'int') AS tdsInputError,
       x.value('(Record/ConnectivityTraceRecord/TdsBufInfo/TdsOutputBufferError)[1]', 'int') AS tdsOutputError
     FROM (
       SELECT [timestamp], CAST(record AS XML) AS x
       FROM sys.dm_os_ring_buffers
       WHERE ring_buffer_type = 'RING_BUFFER_CONNECTIVITY'
     ) rb
     CROSS JOIN sys.dm_os_sys_info osi
     ORDER BY rb.[timestamp] DESC`,
  );

  // Failed logins (error 18456) captured by the always-on system_health session.
  await probe(
    pool,
    `4. Failed login attempts from system_health (last ${TOP})`,
    `SELECT TOP ${TOP}
       q.xed.value('(@timestamp)[1]', 'datetime2')                            AS eventTimeUtc,
       q.xed.value('(data[@name="error_number"]/value)[1]', 'int')            AS errorNumber,
       q.xed.value('(data[@name="message"]/value)[1]', 'nvarchar(max)')       AS message
     FROM (
       SELECT CAST(event_data AS XML) AS x
       FROM sys.fn_xe_file_target_read_file('system_health*.xel', NULL, NULL, NULL)
     ) t
     CROSS APPLY t.x.nodes('//event[@name="error_reported"]') AS q(xed)
     WHERE q.xed.value('(data[@name="error_number"]/value)[1]', 'int') = 18456
     ORDER BY eventTimeUtc DESC`,
  );

  // Error log holds "Login failed for user ..." lines with the client IP.
  await probe(
    pool,
    `5. "Login failed" lines from the SQL error log — needs sysadmin/securityadmin`,
    `CREATE TABLE #errlog (LogDate datetime, ProcessInfo nvarchar(100), Text nvarchar(max));
     INSERT INTO #errlog EXEC sp_readerrorlog 0, 1, N'Login failed';
     SELECT TOP ${TOP} LogDate AS logDate, Text AS message FROM #errlog ORDER BY LogDate DESC;
     DROP TABLE #errlog;`,
  );

  // App-level: our own login trail, independent of SQL Server permissions.
  await probe(
    pool,
    `6. App_Users — accounts and last login through our API`,
    `SELECT TOP ${TOP}
       Id AS id, Email AS email, Role AS role, Status AS status,
       CreatedAt AS createdAt, LastLoginAt AS lastLoginAt
     FROM dbo.App_Users
     ORDER BY CASE WHEN LastLoginAt IS NULL THEN 1 ELSE 0 END, LastLoginAt DESC`,
  );

  // The public POST /seed wipes Ref_* tables, inserts dummy rows and creates a
  // hardcoded admin. Any of these three showing up means it was actually hit.
  await probe(
    pool,
    '7. Evidence that the unauthenticated POST /seed was ever run',
    `SELECT
       (SELECT COUNT(*) FROM dbo.App_Users WHERE Email = 'admin@example.com')            AS seedAdminAccounts,
       (SELECT COUNT(*) FROM dbo.Ref_OurEntities WHERE Name IN ('Company A','Company B','Company C')) AS dummyEntities,
       (SELECT COUNT(*) FROM dbo.Ref_Jobs WHERE JobNumber LIKE 'JOB-00%')                AS dummyJobs`,
  );

  await mssql.close();
}

main().catch(async (err) => {
  console.error('check-db-access-audit failed:', err?.message ?? err);
  try {
    await mssql.close();
  } catch {
    /* pool may never have opened */
  }
  process.exit(1);
});
