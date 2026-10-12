/**
 * Togal file API. The MCP device login is not accepted on these routes.
 * Header `session` comes from POST /v1/session (email + password).
 */

const BASE = 'https://api-prod.togal.ai/api';

/** Captain first name must equal the Togal folder name. "Mike Roberts" → folder Mike. */
export function folderIdForCaptain(
  folders: { id: string; name: string }[],
  captainName: string | null,
): string | null {
  const first = captainName?.trim().split(/\s+/)[0]?.toLowerCase();
  if (!first) return null;
  return folders.find((folder) => folder.name.trim().toLowerCase() === first)?.id ?? null;
}

export type TogalSession = { id: string; organizationId: string };

type Json = Record<string, unknown>;

export class TogalRestClient {
  async login(email: string, password: string): Promise<TogalSession> {
    const body = await this.req('POST', '/v1/session', null, { email, password, remember: true });
    const id = typeof body.id === 'string' ? body.id : '';
    const organizationId = typeof body.organization_id === 'string' ? body.organization_id : '';
    if (!id || !organizationId) throw new Error('Togal login did not return a session');
    return { id, organizationId };
  }

  async listFolders(session: TogalSession): Promise<{ id: string; name: string }[]> {
    const where = encodeURIComponent(JSON.stringify({ organization_id: session.organizationId }));
    const body = await this.req('GET', `/v1/project_folder?$where=${where}`, session.id);
    const rows = Array.isArray(body.rows) ? body.rows : [];
    return rows
      .map((row) => {
        if (!row || typeof row !== 'object') return null;
        const rec = row as { id?: unknown; name?: unknown };
        const id = typeof rec.id === 'string' ? rec.id : '';
        const name = typeof rec.name === 'string' ? rec.name.trim() : '';
        return id && name ? { id, name } : null;
      })
      .filter((row): row is { id: string; name: string } => Boolean(row));
  }

  async createProject(session: TogalSession, name: string, folderId?: string | null): Promise<string> {
    const body = await this.req('POST', '/v1/project', session.id, {
      name,
      organization_id: session.organizationId,
      ...(folderId ? { project_folder_id: folderId } : {}),
    });
    const id = typeof body.id === 'string' ? body.id : '';
    if (!id) throw new Error('Togal did not return a project id');
    return id;
  }

  async createSet(session: TogalSession, projectId: string, name: string): Promise<string> {
    const body = await this.req('POST', '/v1/set', session.id, {
      name,
      project_id: projectId,
      organization_id: session.organizationId,
    });
    const id = typeof body.id === 'string' ? body.id : '';
    if (!id) throw new Error('Togal did not return a set id');
    return id;
  }

  async uploadFile(
    session: TogalSession,
    input: { setId: string; mime: string; bytes: Buffer },
  ): Promise<{ id: string; url: string }> {
    const created = await this.req('POST', '/v1/files', session.id, {
      relation_table: 'set',
      relation_id: input.setId,
      mime: input.mime,
      organization_id: session.organizationId,
    });
    const id = typeof created.id === 'string' ? created.id : '';
    const url = typeof created.url === 'string' ? created.url : '';
    const uploadUrl = typeof created.upload_url === 'string' ? created.upload_url : '';
    if (!id || !url || !uploadUrl) throw new Error('Togal did not return a file upload');
    const put = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'content-type': input.mime },
      body: new Uint8Array(input.bytes),
    });
    if (!put.ok) throw new Error(`Togal file upload failed (${put.status})`);
    return { id, url };
  }

  async createPages(
    session: TogalSession,
    input: { url: string; setId: string; projectId: string },
  ): Promise<string[]> {
    const body = await this.req('POST', '/v1/page/file/process', session.id, {
      url: input.url,
      setId: input.setId,
      projectId: input.projectId,
    });
    const pages = Array.isArray(body.createdPages) ? body.createdPages : [];
    return pages
      .map((page) => {
        if (!page || typeof page !== 'object') return '';
        const id = (page as { id?: unknown }).id;
        return typeof id === 'string' ? id : '';
      })
      .filter(Boolean);
  }

  async moveProject(session: TogalSession, projectId: string, folderId: string): Promise<void> {
    await this.req('PUT', `/v1/project/${projectId}`, session.id, { project_folder_id: folderId });
  }

  async deleteFile(session: TogalSession, fileId: string): Promise<void> {
    await this.req('DELETE', `/v1/files/${session.organizationId}/${fileId}`, session.id);
  }

  async deletePage(session: TogalSession, pageId: string): Promise<void> {
    await this.req('DELETE', `/v1/page/${pageId}`, session.id);
  }

  private async req(method: string, path: string, sessionId: string | null, body?: Json): Promise<Json> {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        accept: 'application/json',
        ...(body ? { 'content-type': 'application/json' } : {}),
        ...(sessionId ? { session: sessionId } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let parsed: unknown = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }
    if (!res.ok) {
      const record = parsed && typeof parsed === 'object' ? (parsed as Json) : {};
      const nested = record.error && typeof record.error === 'object' ? (record.error as Json) : {};
      const message =
        (typeof nested.message === 'string' && nested.message) ||
        (typeof record.message === 'string' && record.message) ||
        `Togal ${method} ${path} failed (${res.status})`;
      throw new Error(message);
    }
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Json) : {};
  }
}
