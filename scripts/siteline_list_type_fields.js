/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const process = require('process');
const fetch = require('node-fetch');

const SCHEMA_QUERY = `
query __TypeFields($name: String!) {
  __type(name: $name) {
    fields {
      name
    }
  }
}
`;

function loadEnv(envFile) {
  const env = {};
  if (!envFile || !fs.existsSync(envFile)) return env;

  const raw = fs.readFileSync(envFile, 'utf8');
  for (const lineRaw of raw.split(/\r?\n/)) {
    const line = lineRaw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    // Remove wrapping quotes that are common in .env files
    v = v.replace(/^['"]/, '').replace(/['"]$/, '');
    env[k] = v;
  }
  return env;
}

function parseArgs(argv) {
  const out = { types: [], envFile: path.join(process.cwd(), '.env') };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--type') {
      const v = argv[i + 1];
      if (!v) throw new Error('Missing value after --type');
      out.types.push(v);
      i++;
      continue;
    }
    if (a === '--env-file') {
      const v = argv[i + 1];
      if (!v) throw new Error('Missing value after --env-file');
      out.envFile = v;
      i++;
      continue;
    }
    if (a === '--help' || a === '-h') {
      printHelpAndExit(0);
    }
  }
  if (!out.types.length) {
    printHelpAndExit(2);
  }
  return out;
}

function printHelpAndExit(code) {
  console.log('Usage: node scripts/siteline_list_type_fields.js --type Project --type Contract [--env-file /path/to/.env]');
  process.exit(code);
}

function getHeaders(apiToken, authHeader) {
  if (authHeader) return { [authHeader]: apiToken };
  return { Authorization: `Bearer ${apiToken}` };
}

async function listFields(apiUrl, apiToken, authHeader, gqlTypeName) {
  const headers = {
    ...getHeaders(apiToken, authHeader),
    'Content-Type': 'application/json',
  };

  const resp = await fetch(apiUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      query: SCHEMA_QUERY,
      variables: { name: gqlTypeName },
    }),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`GraphQL HTTP ${resp.status}: ${text}`);
  }

  const payload = await resp.json();
  if (payload.errors && payload.errors.length) {
    throw new Error(`GraphQL errors: ${JSON.stringify(payload.errors)}`);
  }

  const t = payload?.data?.__type;
  if (!t || !t.fields) return [];

  return [...t.fields.map((f) => f.name).filter(Boolean)].sort();
}

async function main() {
  const args = parseArgs(process.argv);
  const env = loadEnv(args.envFile);

  const apiUrlRaw = env.SITELINE_API_URL || process.env.SITELINE_API_URL;
  const apiToken = env.SITELINE_API_TOKEN || process.env.SITELINE_API_TOKEN;
  const authHeader = (env.SITELINE_AUTH_HEADER || process.env.SITELINE_AUTH_HEADER || '').trim();

  if (!apiUrlRaw || !apiToken) {
    console.error('Missing SITELINE_API_URL and/or SITELINE_API_TOKEN. Set them in .env.');
    process.exit(2);
  }

  // Backend expects full URL. If user gives base URL, append /graphql.
  let apiUrl = apiUrlRaw.replace(/\/$/, '');
  if (!apiUrl.endsWith('/graphql')) apiUrl = `${apiUrl}/graphql`;

  for (const typeName of args.types) {
    const fields = await listFields(apiUrl, apiToken, authHeader, typeName);
    console.log(`--- ${typeName} fields (${fields.length}) ---`);
    if (!fields.length) {
      console.log('(no fields or unknown type)');
    } else {
      for (const f of fields) console.log(`- ${f}`);
    }
    console.log('');
  }
}

main().catch((err) => {
  console.error(err?.message ?? String(err));
  process.exit(1);
});

