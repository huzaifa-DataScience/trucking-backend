/**
 * Local API stand-in when SQL Server is not available.
 * Serves auth + empty dashboard payloads on PORT (default 3005).
 * Not for production. Remove/stop this once the real Nest app can connect to GoFormzDB.
 */
const http = require('http');

const PORT = parseInt(process.env.PORT || '3005', 10);
const PERMISSIONS = [
  'bidding:read',
  'bidding:write',
  'bidding:summary',
  'tickets:read',
  'tickets:export',
  'job_dashboard:read',
  'material_dashboard:read',
  'hauler_dashboard:read',
  'forensic:read',
  'siteline:read',
  'clearstory:read',
  'trimble:read',
  'connecteam:read',
  'connecteam:write',
  'admin:users',
  'admin:create_user',
  'admin:rbac',
];

const users = new Map();
users.set('admin@example.com', {
  id: 1,
  firstName: 'Local',
  lastName: 'Admin',
  email: 'admin@example.com',
  phone: null,
  company: 'Local',
  displayName: 'Local Admin',
  role: 'admin',
  status: 'active',
  permissions: PERMISSIONS,
  avatarUrl: null,
  password: 'Admin123!',
});

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
}

function send(res, status, body) {
  cors(res);
  const json = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(json);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function publicUser(u) {
  const { password, ...rest } = u;
  return rest;
}

function tokenFor(user) {
  const payload = Buffer.from(JSON.stringify({ sub: user.id, email: user.email }), 'utf8').toString(
    'base64url',
  );
  return `local.${payload}.dev`;
}

function userFromAuth(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'local') return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return [...users.values()].find((u) => u.email === payload.email) || null;
  } catch {
    return null;
  }
}

function emptyPage() {
  return { items: [], page: 1, pageSize: 50, total: 0 };
}

const server = http.createServer(async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`);
  const path = url.pathname.replace(/\/$/, '') || '/';

  try {
    if (req.method === 'POST' && path === '/auth/login') {
      const body = await readBody(req);
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');
      if (!email || password.length < 6) {
        send(res, 400, { statusCode: 400, message: 'email must be an email' });
        return;
      }
      let user = users.get(email);
      if (!user) {
        user = {
          id: users.size + 1,
          firstName: 'Local',
          lastName: 'User',
          email,
          phone: null,
          company: 'Local',
          displayName: email,
          role: 'admin',
          status: 'active',
          permissions: PERMISSIONS,
          avatarUrl: null,
          password,
        };
        users.set(email, user);
      } else if (user.password !== password) {
        send(res, 401, { statusCode: 401, message: 'Invalid email or password' });
        return;
      }
      send(res, 200, { access_token: tokenFor(user), user: publicUser(user) });
      return;
    }

    if (req.method === 'POST' && path === '/auth/register') {
      const body = await readBody(req);
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');
      if (!email || password.length < 6) {
        send(res, 400, { statusCode: 400, message: 'Validation failed' });
        return;
      }
      if (users.has(email)) {
        send(res, 409, { statusCode: 409, message: 'An account with this email already exists' });
        return;
      }
      const user = {
        id: users.size + 1,
        firstName: String(body.firstName || 'Local'),
        lastName: String(body.lastName || 'User'),
        email,
        phone: body.phone ? String(body.phone) : null,
        company: body.company ? String(body.company) : 'Local',
        displayName: `${body.firstName || 'Local'} ${body.lastName || 'User'}`.trim(),
        role: 'admin',
        status: 'active',
        permissions: PERMISSIONS,
        avatarUrl: null,
        password,
      };
      users.set(email, user);
      send(res, 201, { access_token: tokenFor(user), user: publicUser(user) });
      return;
    }

    if (req.method === 'GET' && path === '/auth/profile') {
      const user = userFromAuth(req);
      if (!user) {
        send(res, 401, { statusCode: 401, message: 'Unauthorized' });
        return;
      }
      send(res, 200, publicUser(user));
      return;
    }

    if (req.method === 'GET' && path === '/health/ping') {
      send(res, 200, { ok: true, mode: 'local-dev-no-sql', timestamp: new Date().toISOString() });
      return;
    }

    if (req.method === 'GET' && path === '/job-dashboard/kpis') {
      send(res, 200, { totalTickets: 0, flowBalance: '0 Imports / 0 Exports', lastActive: '—' });
      return;
    }

    if (req.method === 'GET' && path.startsWith('/lookups/')) {
      send(res, 200, []);
      return;
    }

    if (req.method === 'GET' && /\/tickets$/.test(path)) {
      send(res, 200, emptyPage());
      return;
    }

    if (req.method === 'GET') {
      if (path.includes('/kpis')) {
        send(res, 200, { totalTickets: 0, flowBalance: '0 Imports / 0 Exports', lastActive: '—', uniqueTrucks: 0, activeJobs: 0, topSource: '—', topDestination: '—' });
        return;
      }
      send(res, 200, []);
      return;
    }

    send(res, 404, { statusCode: 404, message: `No local stub for ${req.method} ${path}` });
  } catch (err) {
    send(res, 500, { statusCode: 500, message: err instanceof Error ? err.message : 'Stub error' });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Local dev API (no SQL) at http://localhost:${PORT}`);
  console.log('Sign in with admin@example.com / Admin123!  (or any new email + password)');
});
