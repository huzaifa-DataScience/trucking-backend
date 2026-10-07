/**
 * Load a large SSMS "Generate Scripts" dump into SQL Server.
 *
 * sqlcmd splits input lines past ~8k characters, so rows carrying big JSON /
 * varbinary payloads arrive as broken fragments (Msg 102/103). This streams the
 * file and batches on `GO` instead, so line length does not matter.
 *
 * Target is read from LOAD_DB_* only — never from .env — so a dump can never be
 * replayed into ts01 by accident.
 *
 *   LOAD_DB_HOST=localhost npx ts-node --transpile-only scripts/load-sql-dump.ts dump.sql --skip-lines 8
 *
 * `--schema-only` drops the INSERT rows and keeps tables, views, indexes and
 * constraints — enough to develop against without waiting on gigabytes of data.
 */
import { createReadStream, statSync } from 'fs';
import { createInterface } from 'readline';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const mssql = require('mssql');

/** Flush early inside long INSERT runs so one request never holds the whole table. */
const FLUSH_BYTES = 4 * 1024 * 1024;

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

async function main(): Promise<void> {
  const file = process.argv[2];
  if (!file) throw new Error('Usage: load-sql-dump.ts <file.sql> [--skip-lines N]');
  const skipLines = Number(arg('--skip-lines', '0'));
  const schemaOnly = process.argv.includes('--schema-only');

  const target = {
    server: process.env.LOAD_DB_HOST || 'localhost',
    port: Number(process.env.LOAD_DB_PORT || 1433),
    user: process.env.LOAD_DB_USER || 'sa',
    password: process.env.LOAD_DB_PASSWORD || '',
    database: process.env.LOAD_DB_DATABASE || 'master',
    options: { encrypt: false, trustServerCertificate: true },
    requestTimeout: 0,
    // USE [db] inside the script must stick, so keep exactly one connection.
    pool: { max: 1, min: 1, idleTimeoutMillis: 600000 },
  };
  const totalBytes = statSync(file).size;
  console.log(`Loading ${file} (${(totalBytes / 1e9).toFixed(2)} GB)`);
  console.log(`Target  ${target.user}@${target.server}:${target.port}/${target.database}`);
  if (skipLines) console.log(`Skipping first ${skipLines} lines`);
  if (schemaOnly) console.log('Schema only — INSERT rows are skipped');

  const pool = await mssql.connect(target);

  let buffer: string[] = [];
  let bufferBytes = 0;
  let bufferIsAllInserts = true;
  let lineNo = 0;
  let batches = 0;
  let bytesDone = 0;
  let failed = 0;
  const errorSamples: string[] = [];
  const startedAt = Date.now();

  const flush = async (): Promise<void> => {
    const sql = buffer.join('\n').trim();
    buffer = [];
    bufferBytes = 0;
    bufferIsAllInserts = true;
    if (!sql) return;
    batches += 1;
    try {
      await pool.request().batch(sql);
    } catch (err: any) {
      failed += 1;
      if (errorSamples.length < 25) {
        errorSamples.push(`line ~${lineNo}: ${String(err?.message ?? err).slice(0, 300)}`);
      }
    }
    if (batches % 500 === 0) {
      const pct = ((bytesDone / totalBytes) * 100).toFixed(1);
      const mins = ((Date.now() - startedAt) / 60000).toFixed(1);
      console.log(`  ${pct}% — ${batches} batches, ${failed} failed, ${mins} min`);
    }
  };

  const rl = createInterface({
    input: createReadStream(file, { highWaterMark: 1 << 20 }),
    crlfDelay: Infinity,
  });

  // In schema-only mode, rows are dropped a whole batch at a time: an INSERT can
  // span many lines, and dropping just the first one leaves fragments that break
  // the batch around them.
  let skippingData = false;

  for await (const raw of rl) {
    lineNo += 1;
    bytesDone += raw.length + 1;
    if (lineNo <= skipLines) continue;
    const line = raw.replace(/\r$/, '');

    if (line.trim().toUpperCase() === 'GO') {
      if (skippingData) {
        skippingData = false;
        buffer = [];
        bufferBytes = 0;
        bufferIsAllInserts = true;
        continue;
      }
      await flush();
      continue;
    }

    const isInsert = line.startsWith('INSERT [') || line.startsWith('SET IDENTITY_INSERT');
    if (schemaOnly) {
      if (isInsert && !skippingData) {
        await flush(); // keep any schema lines already buffered in this batch
        skippingData = true;
      }
      if (skippingData) continue;
    }

    // Data regions are one INSERT per line, so they are safe to cut anywhere.
    // Anything else (procedure bodies, multi-line DDL) must stay in one batch.
    if (!isInsert && line.trim()) bufferIsAllInserts = false;
    if (bufferIsAllInserts && isInsert && bufferBytes > FLUSH_BYTES) await flush();

    buffer.push(line);
    bufferBytes += line.length + 1;
  }
  await flush();

  const mins = ((Date.now() - startedAt) / 60000).toFixed(1);
  console.log(`\nDone in ${mins} min — ${lineNo} lines, ${batches} batches, ${failed} failed`);
  if (errorSamples.length) {
    console.log('\nFirst failures:');
    for (const e of errorSamples) console.log(`  - ${e}`);
  }
  await pool.close();
}

main().catch(async (err) => {
  console.error('load-sql-dump failed:', err?.message ?? err);
  try {
    await mssql.close();
  } catch {
    /* pool may never have opened */
  }
  process.exit(1);
});
