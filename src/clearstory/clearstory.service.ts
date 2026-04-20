import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import fetch from 'node-fetch';

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

@Injectable()
export class ClearstoryService {
  private readonly logger = new Logger(ClearstoryService.name);

  constructor(private readonly config: ConfigService) {}

  private get baseUrl(): string {
    const raw = this.config.get<string>('CLEARSTORY_API_URL', 'https://web-api.clearstory.build').trim();
    return raw.replace(/\/+$/, '');
  }

  private get authHeader(): string {
    const keyId = this.config.get<string>('CLEARSTORY_KEY_ID', '').trim();
    const secret = this.config.get<string>('CLEARSTORY_SECRET_KEY', '').trim();
    if (!keyId || !secret) return '';
    const token = Buffer.from(`${keyId}:${secret}`, 'utf8').toString('base64');
    return `Basic ${token}`;
  }

  isConfigured(): boolean {
    return Boolean(this.authHeader);
  }

  async requestJson<T>(method: HttpMethod, path: string, query?: Record<string, any>): Promise<T> {
    const u = new URL(this.baseUrl + path);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v === undefined || v === null || v === '') continue;
        if (Array.isArray(v)) {
          for (const item of v) u.searchParams.append(k, String(item));
        } else if (typeof v === 'boolean') {
          u.searchParams.set(k, v ? 'true' : 'false');
        } else {
          u.searchParams.set(k, String(v));
        }
      }
    }

    const auth = this.authHeader;
    const timeoutRaw = this.config.get<string>('CLEARSTORY_HTTP_TIMEOUT_MS', '120000');
    const timeoutMs = Math.max(1_000, Number.parseInt(String(timeoutRaw), 10) || 120_000);
    const res = await fetch(u.toString(), {
      method,
      headers: {
        Accept: 'application/json',
        ...(auth ? { Authorization: auth } : {}),
      },
      signal: AbortSignal.timeout(timeoutMs),
    } as any);

    const text = await res.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      // leave as text
    }

    if (!res.ok) {
      const msg = typeof json === 'object' && json && 'message' in json ? (json as any).message : text;
      throw new Error(`Clearstory ${method} ${path} failed: ${res.status} ${res.statusText} - ${msg}`);
    }

    return json as T;
  }

  /**
   * Clearstory list endpoints return { records, count }; normalize arrays and common alternates
   * so we do not silently save zero rows when the API shape differs slightly.
   */
  private normalizePagedResponse(path: string, body: unknown): { records: any[]; count: number } {
    if (body === null || body === undefined || typeof body !== 'object') {
      this.logger.warn(`Clearstory GET ${path}: response was not an object`);
      return { records: [], count: 0 };
    }
    const o = body as Record<string, unknown>;
    const raw = o.records ?? o.data ?? o.items ?? o.results;
    let records: any[] = [];
    if (Array.isArray(raw)) {
      records = raw;
    } else if (raw != null && typeof raw === 'object') {
      records = [raw];
    }
    const countRaw = o.count ?? o.totalCount ?? o.total;
    const count = Number(countRaw);
    const c = Number.isFinite(count) ? count : records.length;
    if (c > 0 && records.length === 0) {
      this.logger.warn(
        `Clearstory GET ${path}: count=${c} but no list found (body keys: ${Object.keys(o).join(', ')})`,
      );
    }
    return { records, count: c };
  }

  private async requestPaged(
    path: string,
    query?: Record<string, any>,
  ): Promise<{ records: any[]; count: number }> {
    const body = await this.requestJson<unknown>('GET', path, query);
    return this.normalizePagedResponse(path, body);
  }

  getCompany() {
    return this.requestJson<any>('GET', '/companies/current');
  }

  listCompanyUsers(params: Record<string, any>) {
    return this.requestPaged('/companies/current/users', params);
  }

  listOffices(params: Record<string, any>) {
    return this.requestPaged('/companies/current/offices', params);
  }

  listDivisions(params: Record<string, any>) {
    return this.requestPaged('/companies/current/divisions', params);
  }

  listProjects(params: { skip?: number; take?: number; archived?: boolean; jobNumber?: string }) {
    return this.requestPaged('/projects', params as any);
  }

  getProject(id: number) {
    return this.requestJson<any>('GET', `/projects/${id}`);
  }

  listContracts(params: Record<string, any>) {
    return this.requestPaged('/contracts', params);
  }

  listChangeNotifications(params: Record<string, any>) {
    return this.requestPaged('/change-notifications', params);
  }

  getChangeNotification(id: number | string) {
    return this.requestJson<any>('GET', `/change-notifications/${encodeURIComponent(String(id))}`);
  }

  getChangeNotificationForContract(cnId: number | string, contractId: number) {
    return this.requestJson<any>(
      'GET',
      `/change-notifications/${encodeURIComponent(String(cnId))}/${contractId}`,
    );
  }

  listCors(params: Record<string, any>) {
    return this.requestPaged('/cors', params);
  }

  getCor(id: string, withIntegrationMetadata = true) {
    return this.requestJson<any>('GET', `/cors/${encodeURIComponent(id)}`, {
      withIntegrationMetadata: withIntegrationMetadata ? 'true' : undefined,
    });
  }

  getCorOverview(params: Record<string, any>) {
    return this.requestJson<any>('GET', '/cors/overview', params);
  }

  getCorContractSummary(params: Record<string, any>) {
    return this.requestJson<any>('GET', '/cors/contract-summary', params);
  }

  listCustomers(params: Record<string, any>) {
    return this.requestPaged('/customers', params);
  }

  getCustomer(id: number) {
    return this.requestJson<any>('GET', `/customers/${id}`);
  }

  listLabels(params: Record<string, any>) {
    return this.requestPaged('/labels', params);
  }

  getLabel(id: number | string) {
    return this.requestJson<any>('GET', `/labels/${encodeURIComponent(String(id))}`);
  }

  listTags(params: Record<string, any>) {
    return this.requestPaged('/tags', params);
  }

  getTag(id: number) {
    return this.requestJson<any>('GET', `/tags/${id}`);
  }

  listRates(rateType: 'labor' | 'material' | 'equipment' | 'other', params: Record<string, any>) {
    return this.requestPaged(`/rates/${encodeURIComponent(rateType)}`, params);
  }

  listProjectRates(projectId: number, rateType: 'labor' | 'material' | 'equipment' | 'other', params: Record<string, any>) {
    return this.requestPaged(`/rates/project/${projectId}/${encodeURIComponent(rateType)}`, params);
  }
}
