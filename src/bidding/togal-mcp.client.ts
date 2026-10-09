/**
 * Togal's public door is MCP at https://mcp.togal.ai (OAuth device login, no API key).
 * Tool names are not published. We match them after tools/list.
 */

const ORIGIN = 'https://mcp.togal.ai';
const RESOURCE = 'https://mcp.togal.ai';

export type TogalTool = {
  name: string;
  description?: string;
  inputSchema?: { properties?: Record<string, unknown> };
};

export function pickTogalTool(tools: TogalTool[], words: string[]): TogalTool | null {
  let best: { tool: TogalTool; score: number } | null = null;
  for (const tool of tools) {
    const hay = `${tool.name} ${tool.description ?? ''}`.toLowerCase();
    const score = words.reduce((n, w) => n + (hay.includes(w.toLowerCase()) ? 1 : 0), 0);
    if (!best || score > best.score) best = { tool, score };
  }
  if (!best || best.score === 0) return null;
  if (words.length >= 2 && best.score < 2) return null;
  return best.tool;
}

/** Map our bag onto the tool's schema property names. */
export function fillToolArgs(tool: TogalTool, bag: Record<string, unknown>): Record<string, unknown> {
  const keys = Object.keys(tool.inputSchema?.properties ?? {});
  const defined = Object.fromEntries(Object.entries(bag).filter(([, v]) => v != null && v !== ''));
  if (keys.length === 0) return defined;
  const out: Record<string, unknown> = {};
  for (const [want, value] of Object.entries(defined)) {
    const needle = want.toLowerCase();
    const key =
      keys.find((k) => k.toLowerCase() === needle) ??
      keys.find((k) => k.toLowerCase().includes(needle) || needle.includes(k.toLowerCase()));
    if (key) out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : defined;
}

type Json = Record<string, unknown>;

function form(body: Record<string, string>): string {
  return new URLSearchParams(body).toString();
}

async function readJson(res: Response): Promise<Json> {
  const text = await res.text();
  if (!text) return {};
  const type = res.headers.get('content-type') ?? '';
  if (type.includes('text/event-stream')) {
    const lines = text
      .split('\n')
      .filter((l) => l.startsWith('data:'))
      .map((l) => l.slice(5).trim())
      .filter(Boolean);
    const last = lines[lines.length - 1];
    return last ? (JSON.parse(last) as Json) : {};
  }
  return JSON.parse(text) as Json;
}

export class TogalMcpError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'TogalMcpError';
  }
}

export class TogalMcpClient {
  async registerClient(): Promise<string> {
    const res = await fetch(`${ORIGIN}/oauth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        client_name: 'Goel Bidding',
        redirect_uris: [],
        grant_types: ['authorization_code', 'urn:ietf:params:oauth:grant-type:device_code'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
        scope: 'togal',
      }),
    });
    const body = await readJson(res);
    const id = typeof body.client_id === 'string' ? body.client_id : '';
    if (!res.ok || !id) {
      throw new TogalMcpError(`Togal client registration failed (${res.status})`);
    }
    return id;
  }

  async startDevice(clientId: string): Promise<{
    deviceCode: string;
    userCode: string;
    verificationUrl: string;
    expiresIn: number;
    interval: number;
  }> {
    const res = await fetch(`${ORIGIN}/oauth/device_authorization`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: form({ client_id: clientId, scope: 'togal', resource: RESOURCE }),
    });
    const body = await readJson(res);
    if (!res.ok) {
      throw new TogalMcpError(
        typeof body.error_description === 'string' ? body.error_description : `Togal login failed (${res.status})`,
        typeof body.error === 'string' ? body.error : undefined,
      );
    }
    const verificationUrl =
      (typeof body.verification_uri_complete === 'string' && body.verification_uri_complete) ||
      (typeof body.verification_uri === 'string' && body.verification_uri) ||
      '';
    if (typeof body.device_code !== 'string' || typeof body.user_code !== 'string' || !verificationUrl) {
      throw new TogalMcpError('Togal did not return a device login');
    }
    return {
      deviceCode: body.device_code,
      userCode: body.user_code,
      verificationUrl,
      expiresIn: Number(body.expires_in) || 600,
      interval: Number(body.interval) || 5,
    };
  }

  /** `pending` means the person has not approved yet. */
  async pollToken(
    clientId: string,
    deviceCode: string,
  ): Promise<{ pending: true } | { pending: false; accessToken: string; expiresIn: number }> {
    const res = await fetch(`${ORIGIN}/oauth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: form({
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        device_code: deviceCode,
        client_id: clientId,
        resource: RESOURCE,
      }),
    });
    const body = await readJson(res);
    const err = typeof body.error === 'string' ? body.error : '';
    if (err === 'authorization_pending' || err === 'slow_down') return { pending: true };
    if (!res.ok || typeof body.access_token !== 'string') {
      throw new TogalMcpError(
        typeof body.error_description === 'string' ? body.error_description : 'Togal did not approve the login',
        err || undefined,
      );
    }
    return { pending: false, accessToken: body.access_token, expiresIn: Number(body.expires_in) || 3600 };
  }

  async listTools(accessToken: string): Promise<TogalTool[]> {
    const session = await this.open(accessToken);
    const result = await this.rpc(accessToken, session, 'tools/list', {});
    const tools = (result as { tools?: TogalTool[] }).tools;
    return Array.isArray(tools) ? tools : [];
  }

  async callTool(accessToken: string, name: string, args: Record<string, unknown>): Promise<unknown> {
    const session = await this.open(accessToken);
    return this.rpc(accessToken, session, 'tools/call', { name, arguments: args });
  }

  private async open(accessToken: string): Promise<string | null> {
    const init = await this.rpcRaw(accessToken, null, 'initialize', {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'goel-bidding', version: '1.0.0' },
    });
    await this.rpcRaw(accessToken, init.session, 'notifications/initialized', undefined, true);
    return init.session;
  }

  private async rpc(
    accessToken: string,
    session: string | null,
    method: string,
    params: Record<string, unknown>,
  ): Promise<unknown> {
    const hit = await this.rpcRaw(accessToken, session, method, params);
    return hit.result;
  }

  private async rpcRaw(
    accessToken: string,
    session: string | null,
    method: string,
    params: Record<string, unknown> | undefined,
    notification = false,
  ): Promise<{ result: unknown; session: string | null }> {
    const id = notification ? undefined : 1;
    const res = await fetch(`${ORIGIN}/mcp`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'mcp-protocol-version': '2025-03-26',
        ...(session ? { 'mcp-session-id': session } : {}),
      },
      body: JSON.stringify({ jsonrpc: '2.0', ...(id != null ? { id } : {}), method, ...(params ? { params } : {}) }),
    });
    const nextSession = res.headers.get('mcp-session-id') ?? session;
    if (notification) return { result: null, session: nextSession };
    const body = await readJson(res);
    if (!res.ok || body.error) {
      const err = body.error as { message?: string } | string | undefined;
      const message = typeof err === 'string' ? err : err?.message;
      throw new TogalMcpError(message || `Togal ${method} failed (${res.status})`);
    }
    return { result: body.result, session: nextSession };
  }
}

export function toolText(result: unknown): string {
  if (!result || typeof result !== 'object') return '';
  const content = (result as { content?: unknown }).content;
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => {
      if (!part || typeof part !== 'object') return '';
      const row = part as { type?: string; text?: string; resource?: { text?: string } };
      if (typeof row.text === 'string') return row.text;
      if (typeof row.resource?.text === 'string') return row.resource.text;
      return '';
    })
    .filter(Boolean)
    .join('\n');
}

export function toolFiles(result: unknown): Array<{ name: string; mimeType: string; bytes: Buffer }> {
  if (!result || typeof result !== 'object') return [];
  const content = (result as { content?: unknown }).content;
  if (!Array.isArray(content)) return [];
  const out: Array<{ name: string; mimeType: string; bytes: Buffer }> = [];
  content.forEach((part, i) => {
    if (!part || typeof part !== 'object') return;
    const row = part as {
      type?: string;
      mimeType?: string;
      blob?: string;
      data?: string;
      resource?: { uri?: string; mimeType?: string; blob?: string; text?: string };
    };
    const blob = row.blob || row.data || row.resource?.blob;
    if (!blob) return;
    const mimeType = row.mimeType || row.resource?.mimeType || 'application/octet-stream';
    const uri = row.resource?.uri ?? '';
    const name = uri.split('/').pop() || `togal-export-${i + 1}`;
    out.push({ name, mimeType, bytes: Buffer.from(blob, 'base64') });
  });
  return out;
}

export function firstUrl(text: string): string | null {
  const m = text.match(/https:\/\/(?:[\w-]+\.)?togal\.ai\/[^\s)]+/i);
  return m ? m[0].replace(/[.,]$/, '') : null;
}
