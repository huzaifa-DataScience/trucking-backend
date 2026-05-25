/**
 * Resolve Siteline `currentCompany` per entity and persist to dbo.Siteline_EntityConfig.
 * Usage: npm run refresh-siteline-entity-config
 */
import 'dotenv/config';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const mssql = require('mssql');

const ENTITIES = [
  { entityId: 1, envKey: 'SITELINE_API_TOKEN_ENTITY_1', fallback: null as string | null },
  { entityId: 2, envKey: 'SITELINE_API_TOKEN_ENTITY_2', fallback: 'SITELINE_API_TOKEN' },
  { entityId: 3, envKey: 'SITELINE_API_TOKEN_ENTITY_3', fallback: null },
];

function dbConfig() {
  return {
    server: process.env.DB_HOST!,
    port: parseInt(process.env.DB_PORT || '1433', 10),
    user: process.env.DB_USERNAME!,
    password: String(process.env.DB_PASSWORD ?? '').replace(/^"|"$/g, ''),
    database: process.env.DB_DATABASE!,
    options: {
      encrypt: process.env.DB_ENCRYPT === 'true',
      trustServerCertificate: process.env.DB_TRUST_CERT === 'true',
    },
  };
}

function graphqlUrl(base: string): string {
  const b = base.replace(/\/$/, '');
  return b.includes('/graphql') ? b : `${b}/graphql`;
}

async function currentCompany(
  apiUrl: string,
  token: string,
): Promise<{ id: string; name: string } | null> {
  const auth = /^Bearer\s+/i.test(token) ? token : `Bearer ${token}`;
  const res = await fetch(graphqlUrl(apiUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: auth },
    body: JSON.stringify({ query: 'query { currentCompany { id name } }' }),
  });
  const json = (await res.json()) as {
    data?: { currentCompany?: { id: string; name: string } };
    errors?: unknown[];
  };
  if (json.errors?.length) {
    console.error('GraphQL errors:', JSON.stringify(json.errors));
    return null;
  }
  return json.data?.currentCompany ?? null;
}

async function main(): Promise<void> {
  const apiUrl = process.env.SITELINE_API_URL ?? '';
  if (!apiUrl) {
    console.error('Missing SITELINE_API_URL in .env');
    process.exit(1);
  }

  const pool = await mssql.connect(dbConfig());
  try {
    for (const e of ENTITIES) {
      const token =
        process.env[e.envKey] || (e.fallback ? process.env[e.fallback] : '') || '';
      if (!token) {
        console.log(`Entity ${e.entityId}: SKIP (no token in .env)`);
        continue;
      }
      const co = await currentCompany(apiUrl, token);
      if (!co?.id) {
        console.log(`Entity ${e.entityId}: FAILED (currentCompany)`);
        continue;
      }
      await pool
        .request()
        .input('entityId', mssql.Int, e.entityId)
        .input('companyId', mssql.NVarChar(50), co.id)
        .input('companyName', mssql.NVarChar(255), co.name ?? null)
        .query(`
          UPDATE dbo.Siteline_EntityConfig
          SET SitelineCompanyId = @companyId,
              SitelineCompanyName = @companyName,
              LastResolvedAt = SYSUTCDATETIME(),
              UpdatedAt = SYSUTCDATETIME()
          WHERE EntityId = @entityId
        `);
      console.log(`Entity ${e.entityId}: ${co.id} (${co.name}) → saved`);
    }

    const check = await pool.request().query(`
      SELECT EntityId, EntityName, SitelineCompanyId, SitelineCompanyName, LastResolvedAt
      FROM dbo.Siteline_EntityConfig
      ORDER BY EntityId
    `);
    console.log('\nSiteline_EntityConfig:');
    console.table(check.recordset);
  } finally {
    await pool.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
