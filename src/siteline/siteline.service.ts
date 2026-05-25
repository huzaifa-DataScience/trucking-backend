import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  normalizeSitelineApiBase,
  normalizeSitelineApiToken,
  readLastSitelineSecretFromDotEnv,
} from './siteline-env.util';
import { isSitelineRateLimitError, sleep } from './siteline-http.util';

const GRAPHQL_PATH = '/graphql';
const FIREBASE_SIGN_IN_URL = 'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword';
const FIREBASE_REFRESH_URL = 'https://securetoken.googleapis.com/v1/token';
const TOKEN_REFRESH_BUFFER_MS = 60 * 1000;

/** Siteline GraphQL response envelope (data + optional errors). */
interface GraphQLResponse<T = unknown> {
  data?: T;
  errors?: Array<{ message: string; path?: string[] }>;
}

interface FirebasePasswordSignInResponse {
  idToken?: string;
  refreshToken?: string;
  expiresIn?: string;
  error?: { message?: string };
}

interface FirebaseRefreshTokenResponse {
  id_token?: string;
  refresh_token?: string;
  expires_in?: string;
  error?: { message?: string };
}

/**
 * Service that calls Siteline's GraphQL API to fetch real billing data.
 * Schema: docs/SITELINE_SCHEMA_REFERENCE.md.
 */
@Injectable()
export class SitelineService implements OnModuleInit {
  private readonly logger = new Logger(SitelineService.name);
  private readonly apiUrl: string;
  private readonly apiToken: string;
  private readonly agingApiUrlSecondary: string;
  private readonly agingApiTokenSecondary: string;
  private readonly agingRefreshTokenSecondary: string;
  private readonly agingIdentityApiKeySecondary: string;
  private readonly agingAuthEmailSecondary: string;
  private readonly agingAuthPasswordSecondary: string;
  private agingSecondaryCachedToken: string | null = null;
  private agingSecondaryCachedTokenExpiresAtMs = 0;
  private agingSecondaryRefreshTokenRuntime: string | null = null;
  private agingSecondaryTokenPromise: Promise<string> | null = null;

  /**
   * Optional **custom** header name for the raw token (e.g. `Api-Token`).
   * Leave unset for normal Bearer auth (`Authorization: Bearer <token>`).
   * If set to `Authorization`, Bearer is still applied (same as unset).
   */
  private readonly authHeader: string;

  constructor(private readonly config: ConfigService) {
    const base = this.config.get<string>('SITELINE_API_URL', '').replace(/\/$/, '');
    this.apiUrl = base.endsWith(GRAPHQL_PATH) ? base : `${base}${GRAPHQL_PATH}`;
    this.apiToken = normalizeSitelineApiToken(this.config.get<string>('SITELINE_API_TOKEN', '') ?? '');
    const agingBase = this.config.get<string>('SITELINE_API_URL_SECONDARY', '').replace(/\/$/, '');
    this.agingApiUrlSecondary = agingBase
      ? agingBase.endsWith(GRAPHQL_PATH)
        ? agingBase
        : `${agingBase}${GRAPHQL_PATH}`
      : '';
    this.agingApiTokenSecondary = normalizeSitelineApiToken(
      this.config.get<string>('SITELINE_API_TOKEN_SECONDARY', '') ?? '',
    );
    this.agingRefreshTokenSecondary = normalizeSitelineApiToken(
      this.config.get<string>('SITELINE_REFRESH_TOKEN_SECONDARY', '') ?? '',
    );
    this.agingIdentityApiKeySecondary = normalizeSitelineApiToken(
      this.config.get<string>('SITELINE_IDENTITY_API_KEY_SECONDARY', '') ?? '',
    );
    this.agingAuthEmailSecondary =
      this.config.get<string>('SITELINE_AUTH_EMAIL_SECONDARY', '')?.trim() ?? '';
    this.agingAuthPasswordSecondary =
      this.config.get<string>('SITELINE_AUTH_PASSWORD_SECONDARY', '')?.trim() ?? '';
    this.agingSecondaryRefreshTokenRuntime = this.agingRefreshTokenSecondary || null;
    if (this.agingApiTokenSecondary) {
      this.rememberAgingSecondaryToken(this.agingApiTokenSecondary, null, null);
    }
    this.authHeader = this.config.get<string>('SITELINE_AUTH_HEADER', '')?.trim() ?? '';
  }

  onModuleInit(): void {
    const cwd = process.cwd();
    const tokenInFile = readLastSitelineSecretFromDotEnv(cwd, 'SITELINE_API_TOKEN');
    if (tokenInFile && this.apiToken && tokenInFile !== this.apiToken) {
      this.logger.warn(
        'Loaded SITELINE_API_TOKEN differs from the last value in .env. Nest merges env so process.env overrides .env — remove SITELINE_API_TOKEN from shell exports, Docker env, or IDE launch.json, or update that copy to match Postman.',
      );
    }
    const urlInFile = readLastSitelineSecretFromDotEnv(cwd, 'SITELINE_API_URL');
    const urlLoaded = this.config.get<string>('SITELINE_API_URL', '') ?? '';
    if (
      urlInFile &&
      urlLoaded &&
      normalizeSitelineApiBase(urlInFile) !== normalizeSitelineApiBase(urlLoaded)
    ) {
      this.logger.warn(
        'Loaded SITELINE_API_URL differs from .env — process.env overrides .env. Confirm Postman uses the same host (e.g. api-external.siteline.com vs api.siteline.com).',
      );
    }
    if (
      this.config.get<string>('SITELINE_AGING_SNAPSHOT_ENABLED', 'true') !== 'false' &&
      !this.isAgingDashboardConfigured()
    ) {
      this.logger.warn(
        'Siteline aging sync will fail until SITELINE_API_URL_SECONDARY and Firebase auth are set (agingDashboard is not on api-external).',
      );
    }
  }

  /** Safe fields for GET /siteline/status (no secrets). */
  getConnectionDiagnostics(): {
    configured: boolean;
    graphqlEndpoint: string;
    apiHost: string;
    tokenLength: number;
    authStyle: string;
    dotEnvTokenMatchesLoaded: boolean | null;
    dotEnvUrlMatchesLoaded: boolean | null;
    agingSecondaryEnabled: boolean;
    agingSecondaryGraphqlEndpoint: string | null;
    agingSecondaryApiHost: string | null;
    agingSecondaryMode: string;
    agingSecondaryTokenLength: number;
    agingSecondaryRefreshConfigured: boolean;
    agingSecondaryLoginConfigured: boolean;
  } {
    let apiHost = '';
    try {
      apiHost = new URL(this.apiUrl).host;
    } catch {
      apiHost = '(unparseable-url)';
    }
    let agingSecondaryApiHost: string | null = null;
    try {
      agingSecondaryApiHost = this.agingApiUrlSecondary ? new URL(this.agingApiUrlSecondary).host : null;
    } catch {
      agingSecondaryApiHost = '(unparseable-url)';
    }
    const cwd = process.cwd();
    const tokenInFile = readLastSitelineSecretFromDotEnv(cwd, 'SITELINE_API_TOKEN');
    const urlInFile = readLastSitelineSecretFromDotEnv(cwd, 'SITELINE_API_URL');
    const urlLoaded = this.config.get<string>('SITELINE_API_URL', '') ?? '';
    const authStyle =
      !this.authHeader || this.authHeader.toLowerCase() === 'authorization'
        ? 'authorization-bearer'
        : `custom-header:${this.authHeader}`;
    return {
      configured: this.isConfigured(),
      graphqlEndpoint: this.apiUrl,
      apiHost,
      tokenLength: this.apiToken.length,
      authStyle,
      dotEnvTokenMatchesLoaded:
        tokenInFile == null ? null : tokenInFile === this.apiToken,
      dotEnvUrlMatchesLoaded:
        urlInFile == null ? null : normalizeSitelineApiBase(urlInFile) === normalizeSitelineApiBase(urlLoaded),
      agingSecondaryEnabled: Boolean(this.agingApiUrlSecondary),
      agingSecondaryGraphqlEndpoint: this.agingApiUrlSecondary || null,
      agingSecondaryApiHost,
      agingSecondaryMode: this.describeAgingSecondaryMode(),
      agingSecondaryTokenLength: this.agingApiTokenSecondary.length,
      agingSecondaryRefreshConfigured: Boolean(this.agingRefreshTokenSecondary),
      agingSecondaryLoginConfigured: Boolean(
        this.agingIdentityApiKeySecondary &&
          this.agingAuthEmailSecondary &&
          this.agingAuthPasswordSecondary,
      ),
    };
  }

  isConfigured(): boolean {
    return Boolean(this.apiUrl && this.apiToken);
  }

  getBaseGraphqlUrl(): string {
    return this.apiUrl;
  }

  isConfiguredWithToken(apiToken: string): boolean {
    return Boolean(this.apiUrl && normalizeSitelineApiToken(apiToken));
  }

  /**
   * `agingDashboard` exists only on the Siteline web app API (`api.siteline.com`), not on
   * `api-external`. Requires secondary URL plus Firebase login or a static id token.
   */
  isAgingDashboardConfigured(): boolean {
    if (!this.agingApiUrlSecondary) return false;
    return Boolean(
      this.agingApiTokenSecondary ||
        (this.agingIdentityApiKeySecondary &&
          (this.agingRefreshTokenSecondary ||
            (this.agingAuthEmailSecondary && this.agingAuthPasswordSecondary))),
    );
  }

  private apiTarget(apiToken?: string): { url: string; token: string; authHeader: string } {
    const token = apiToken ? normalizeSitelineApiToken(apiToken) : this.apiToken;
    return { url: this.apiUrl, token, authHeader: this.authHeader };
  }

  /** Siteline-style auth: Bearer by default; raw token only on non-Authorization custom headers. */
  private attachAuthHeaders(headers: Record<string, string>): void {
    this.attachAuthHeadersFor(headers, this.apiToken, this.authHeader);
  }

  private attachAuthHeadersFor(
    headers: Record<string, string>,
    token: string,
    authHeaderName = '',
  ): void {
    const name = authHeaderName;
    if (!token) return;
    if (!name || name.toLowerCase() === 'authorization') {
      headers.Authorization = /^Bearer\s+/i.test(token) ? token : `Bearer ${token}`;
      return;
    }
    headers[name] = token;
  }

  private async graphqlWithTarget<T>(
    target: { url: string; token: string; authHeader?: string },
    query: string,
    variables?: Record<string, unknown>,
  ): Promise<T> {
    const maxRetries = Math.min(
      8,
      Math.max(0, Number(this.config.get<string>('SITELINE_API_MAX_RETRIES', '5')) || 5),
    );
    const baseBackoffMs = Math.max(
      500,
      Number(this.config.get<string>('SITELINE_API_RETRY_BACKOFF_MS', '1500')) || 1500,
    );

    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        this.attachAuthHeadersFor(headers, target.token, target.authHeader ?? '');
        const res = await fetch(target.url, {
          method: 'POST',
          headers,
          body: JSON.stringify({ query, variables: variables ?? {} }),
        });
        const text = await res.text();
        if (!res.ok) {
          throw new Error(`Siteline API HTTP ${res.status}: ${text}`);
        }
        const json = JSON.parse(text) as GraphQLResponse<T>;
        if (json.errors?.length) {
          const msg = json.errors.map((e) => e.message).join('; ');
          throw new Error(`Siteline GraphQL errors: ${msg}`);
        }
        if (json.data === undefined) throw new Error('Siteline API returned no data');
        return json.data as T;
      } catch (e: unknown) {
        const err = e instanceof Error ? e : new Error(String(e));
        lastError = err;
        const retryable =
          isSitelineRateLimitError(err.message) ||
          /\bHTTP 502\b/.test(err.message) ||
          /\bHTTP 503\b/.test(err.message);
        if (!retryable || attempt >= maxRetries) {
          throw err;
        }
        const waitMs = baseBackoffMs * 2 ** attempt;
        await sleep(waitMs);
      }
    }
    throw lastError ?? new Error('Siteline API request failed');
  }

  private async graphql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    return this.graphqlWithTarget(
      { url: this.apiUrl, token: this.apiToken, authHeader: this.authHeader },
      query,
      variables,
    );
  }

  private async agingGraphql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    if (!this.agingApiUrlSecondary) {
      return this.graphql<T>(query, variables);
    }

    let token = await this.getAgingSecondaryAccessToken(false);
    try {
      return await this.graphqlWithTarget(
        { url: this.agingApiUrlSecondary, token, authHeader: 'Authorization' },
        query,
        variables,
      );
    } catch (e: any) {
      if (!this.shouldRetryAgingSecondaryAuth(e?.message ?? String(e))) {
        throw e;
      }
      token = await this.getAgingSecondaryAccessToken(true);
      return this.graphqlWithTarget(
        { url: this.agingApiUrlSecondary, token, authHeader: 'Authorization' },
        query,
        variables,
      );
    }
  }

  private describeAgingSecondaryMode(): string {
    if (!this.agingApiUrlSecondary) return 'primary';
    if (this.agingRefreshTokenSecondary && this.agingIdentityApiKeySecondary) return 'refresh-token';
    if (
      this.agingIdentityApiKeySecondary &&
      this.agingAuthEmailSecondary &&
      this.agingAuthPasswordSecondary
    ) {
      return 'email-password';
    }
    if (this.agingApiTokenSecondary) return 'static-id-token';
    return 'secondary-url-without-auth';
  }

  private shouldRetryAgingSecondaryAuth(message: string): boolean {
    const m = String(message ?? '').toLowerCase();
    return (
      m.includes('not authorised') ||
      m.includes('not authorized') ||
      m.includes('unauthorized') ||
      m.includes('token expired') ||
      m.includes('id token')
    );
  }

  private isTokenStillUsable(expiresAtMs: number): boolean {
    return expiresAtMs === Number.MAX_SAFE_INTEGER || expiresAtMs > Date.now() + TOKEN_REFRESH_BUFFER_MS;
  }

  private decodeJwtExpiryMs(token: string): number | null {
    try {
      const parts = String(token ?? '').split('.');
      if (parts.length < 2) return null;
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as {
        exp?: number;
      };
      return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
    } catch {
      return null;
    }
  }

  private rememberAgingSecondaryToken(
    token: string,
    expiresInSeconds?: string | number | null,
    refreshToken?: string | null,
  ): void {
    this.agingSecondaryCachedToken = token;
    if (refreshToken && refreshToken.trim()) {
      this.agingSecondaryRefreshTokenRuntime = refreshToken.trim();
    }
    const expiresIn =
      expiresInSeconds == null || expiresInSeconds === ''
        ? null
        : Number(expiresInSeconds);
    if (expiresIn != null && Number.isFinite(expiresIn) && expiresIn > 0) {
      this.agingSecondaryCachedTokenExpiresAtMs = Date.now() + expiresIn * 1000;
      return;
    }
    const jwtExp = this.decodeJwtExpiryMs(token);
    this.agingSecondaryCachedTokenExpiresAtMs = jwtExp ?? Number.MAX_SAFE_INTEGER;
  }

  private async getAgingSecondaryAccessToken(forceRefresh: boolean): Promise<string> {
    if (
      !forceRefresh &&
      this.agingSecondaryCachedToken &&
      this.isTokenStillUsable(this.agingSecondaryCachedTokenExpiresAtMs)
    ) {
      return this.agingSecondaryCachedToken;
    }
    if (!forceRefresh && this.agingSecondaryTokenPromise) {
      return this.agingSecondaryTokenPromise;
    }
    const promise = this.resolveAgingSecondaryAccessToken(forceRefresh).finally(() => {
      if (this.agingSecondaryTokenPromise === promise) {
        this.agingSecondaryTokenPromise = null;
      }
    });
    this.agingSecondaryTokenPromise = promise;
    return promise;
  }

  private async resolveAgingSecondaryAccessToken(forceRefresh: boolean): Promise<string> {
    const staticTokenExpiry =
      this.decodeJwtExpiryMs(this.agingApiTokenSecondary) ?? Number.MAX_SAFE_INTEGER;
    if (!forceRefresh && this.agingApiTokenSecondary && this.isTokenStillUsable(staticTokenExpiry)) {
      this.rememberAgingSecondaryToken(this.agingApiTokenSecondary, null, null);
      return this.agingApiTokenSecondary;
    }

    if (this.agingIdentityApiKeySecondary && this.agingSecondaryRefreshTokenRuntime) {
      try {
        return await this.refreshAgingSecondaryFirebaseToken(this.agingSecondaryRefreshTokenRuntime);
      } catch (e: any) {
        if (!(this.agingAuthEmailSecondary && this.agingAuthPasswordSecondary)) {
          throw e;
        }
        this.logger.warn(
          `Siteline aging secondary token refresh failed; trying password login: ${e?.message ?? e}`,
        );
      }
    }

    if (
      this.agingIdentityApiKeySecondary &&
      this.agingAuthEmailSecondary &&
      this.agingAuthPasswordSecondary
    ) {
      return this.loginAgingSecondaryViaPassword();
    }

    if (this.agingApiTokenSecondary) {
      this.logger.warn(
        'Siteline aging secondary token appears expired and no refresh/login credentials are configured; attempting the static token anyway.',
      );
      this.rememberAgingSecondaryToken(this.agingApiTokenSecondary, null, null);
      return this.agingApiTokenSecondary;
    }

    throw new Error(
      'Siteline aging secondary auth not configured. Set SITELINE_API_TOKEN_SECONDARY, or SITELINE_REFRESH_TOKEN_SECONDARY + SITELINE_IDENTITY_API_KEY_SECONDARY, or SITELINE_AUTH_EMAIL_SECONDARY + SITELINE_AUTH_PASSWORD_SECONDARY + SITELINE_IDENTITY_API_KEY_SECONDARY.',
    );
  }

  private async loginAgingSecondaryViaPassword(): Promise<string> {
    const url = `${FIREBASE_SIGN_IN_URL}?key=${encodeURIComponent(this.agingIdentityApiKeySecondary)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: this.agingAuthEmailSecondary,
        password: this.agingAuthPasswordSecondary,
        returnSecureToken: true,
      }),
    });
    const raw = await res.text();
    let json: FirebasePasswordSignInResponse;
    try {
      json = JSON.parse(raw) as FirebasePasswordSignInResponse;
    } catch {
      throw new Error(`Siteline aging password login failed: ${raw}`);
    }
    if (!res.ok || !json.idToken) {
      throw new Error(`Siteline aging password login failed: ${json.error?.message ?? raw}`);
    }
    this.rememberAgingSecondaryToken(json.idToken, json.expiresIn ?? null, json.refreshToken ?? null);
    return json.idToken;
  }

  private async refreshAgingSecondaryFirebaseToken(refreshToken: string): Promise<string> {
    const url = `${FIREBASE_REFRESH_URL}?key=${encodeURIComponent(this.agingIdentityApiKeySecondary)}`;
    const body = new URLSearchParams();
    body.set('grant_type', 'refresh_token');
    body.set('refresh_token', refreshToken);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    const raw = await res.text();
    let json: FirebaseRefreshTokenResponse;
    try {
      json = JSON.parse(raw) as FirebaseRefreshTokenResponse;
    } catch {
      throw new Error(`Siteline aging token refresh failed: ${raw}`);
    }
    if (!res.ok || !json.id_token) {
      throw new Error(`Siteline aging token refresh failed: ${json.error?.message ?? raw}`);
    }
    this.rememberAgingSecondaryToken(
      json.id_token,
      json.expires_in ?? null,
      json.refresh_token ?? null,
    );
    return json.id_token;
  }

  async getCurrentCompany(apiToken?: string): Promise<unknown> {
    const token = apiToken ? normalizeSitelineApiToken(apiToken) : this.apiToken;
    if (!this.apiUrl || !token) {
      return { configured: false, message: 'Siteline API not configured' };
    }
    try {
      const data = await this.graphqlWithTarget<{ currentCompany: unknown }>(
        this.apiTarget(token),
        `
        query CurrentCompanyMinimal {
          currentCompany {
            id
            name
          }
        }
      `,
      );
      return data.currentCompany;
    } catch (e: any) {
      return { error: e?.message ?? String(e) };
    }
  }

  /**
   * Siteline's GraphQL does not expose a "list all contracts" query (no root `contracts`,
   * and Company has `contacts` not `contracts`). We return an empty list and a message.
   * Use GET /siteline/contracts/:id with a known contract id for single-contract data.
   */
  async getContracts(): Promise<unknown> {
    if (!this.isConfigured()) {
      return { configured: false, message: 'Siteline API not configured' };
    }
    return {
      contracts: [],
      message:
        "Siteline's API does not provide a list of contracts. Use GET /siteline/contracts/:id with a contract id, or check Siteline docs for another way to list contracts.",
    };
  }

  /**
   * **Lean** `contract(id)` — matches the fields you persist for listings / `GET /siteline/contracts/:id`.
   * Does **not** include `payApps`, `sov`, or `leadPMs` (see `getContractFull` for sync).
   */
  async getContract(id: string): Promise<unknown> {
    if (!this.isConfigured()) {
      return { configured: false, message: 'Siteline API not configured' };
    }
    try {
      const data = await this.graphql<{ contract: unknown }>(
        `
        query ContractSummary($id: ID!) {
          contract(id: $id) {
            id
            latestTotalValue
            contractNumber
            projectNumber
            project {
              name
            }
          }
        }
      `,
        { id },
      );
      return data.contract ?? null;
    } catch (e: any) {
      return { error: e?.message ?? String(e) };
    }
  }

  /**
   * **`leadPMs` only** — used when DB has no cached PM (e.g. aging overdue) without pulling pay apps / SOV.
   */
  async getContractLeadPms(id: string): Promise<unknown> {
    if (!this.isConfigured()) {
      return { configured: false, message: 'Siteline API not configured' };
    }
    try {
      const data = await this.graphql<{ contract: unknown }>(
        `
        query ContractLeadPms($id: ID!) {
          contract(id: $id) {
            id
            leadPMs {
              id
              firstName
              lastName
              email
            }
          }
        }
      `,
        { id },
      );
      return data.contract ?? null;
    } catch (e: any) {
      return { error: e?.message ?? String(e) };
    }
  }

  /**
   * **Full** `contract(id)` for cron sync: `payApps`, `sov`, `project`, `leadPMs`, billing fields, etc.
   */
  async getContractFull(id: string, apiToken?: string): Promise<unknown> {
    const token = apiToken ? normalizeSitelineApiToken(apiToken) : this.apiToken;
    if (!this.apiUrl || !token) {
      return { configured: false, message: 'Siteline API not configured' };
    }
    try {
      const data = await this.graphqlWithTarget<{ contract: unknown }>(
        this.apiTarget(token),
        `
        query ContractFull($id: ID!) {
          contract(id: $id) {
            id
            latestTotalValue
            contractNumber
            projectNumber
            company {
              id
            }
            createdAt
            updatedAt
            internalProjectNumber
            billingType
            status
            timeZone
            paymentTermsType
            paymentTerms
            percentComplete
            leadPMs {
              id
              firstName
              lastName
              email
            }
            project {
              id
              name
              projectNumber
              timeZone
              createdAt
              updatedAt
              gcName
              bondNumber
              gcAddress {
                street1
                city
                state
                postalCode
                country
              }
            }
            sov {
              id
              totalValue
              totalBilled
              totalRetention
              progressComplete
              lineItems {
                id
                code
                name
                originalTotalValue
                latestTotalValue
                totalBilled
                totalRetention
                progressComplete
              }
            }
            payApps {
              id
              createdAt
              payAppNumber
              billingType
              billingStart
              billingEnd
              payAppDueDate
              timeZone
              status
              statusChangedAt
              retentionOnly
              currentBilled
              currentRetention
              totalRetention
              totalValue
              balanceToFinish
              previousRetentionBilled
              retentionReleased
              retentionHeldPercent
              updatedAt
            }
          }
        }
      `,
        { id },
      );
      return data.contract ?? null;
    } catch (e: any) {
      return { error: e?.message ?? String(e) };
    }
  }

  /**
   * Lightweight `paginatedPayApps` page for cron sync (small payload).
   * Returns same envelope shape: `totalCount`, `cursor`, `hasNext`, `payApps`.
   */
  async getPaginatedPayAppsDiscovery(
    input: { limit?: number; cursor?: string },
    apiToken?: string,
  ): Promise<unknown> {
    const token = apiToken ? normalizeSitelineApiToken(apiToken) : this.apiToken;
    if (!this.apiUrl || !token) {
      return { configured: false, message: 'Siteline API not configured' };
    }

    const gqlInput: Record<string, unknown> = {};
    if (typeof input.limit === 'number') gqlInput.limit = input.limit;
    if (input.cursor) gqlInput.cursor = input.cursor;

    try {
      const data = await this.graphqlWithTarget<{ paginatedPayApps: unknown }>(
        this.apiTarget(token),
        `
        query paginatedPayAppsDiscovery($input: GetPaginatedPayAppsInput!) {
          paginatedPayApps(input: $input) {
            totalCount
            cursor
            hasNext
            payApps {
              id
              payAppNumber
              billingType
              contract {
                id
                internalProjectNumber
                project {
                  projectNumber
                }
              }
            }
          }
        }
      `,
        { input: gqlInput },
      );
      return data.paginatedPayApps;
    } catch (e: any) {
      return { error: e?.message ?? String(e) };
    }
  }

  async getPayApp(id: string): Promise<unknown> {
    if (!this.isConfigured()) {
      return { configured: false, message: 'Siteline API not configured' };
    }
    try {
      const data = await this.graphql<{ payApp: unknown }>(
        `
        query PayApp($id: ID!) {
          payApp(id: $id) {
            id
            createdAt
            payAppNumber
            billingType
            billingStart
            billingEnd
            payAppDueDate
            status
            statusChangedAt
            updatedAt
            retentionOnly
            currentBilled
            currentRetention
            totalRetention
            totalValue
            balanceToFinish
            previousRetentionBilled
            retentionReleased
            retentionHeldPercent
            timeZone
            progress {
              id
              progressBilled
              storedMaterialBilled
              totalValue
              sovLineItem {
                id
                code
                name
              }
            }
            contract {
              id
              project {
                id
                name
                projectNumber
                timeZone
                architect {
                  name
                }
                bondNumber
                bondProvider {
                  name
                }
                createdAt
                gc {
                  name
                }
                gcAddress {
                  street1
                  city
                  state
                  postalCode
                  country
                }
                owner {
                  name
                }
                updatedAt
              }
            }
            g702Values {
              originalContractSum
              netChangeByChangeOrders
              contractSumToDate
              totalCompletedToDate
              progressRetentionPercent
              progressRetentionAmount
              materialsRetentionPercent
              materialsRetentionAmount
              totalRetention
              totalLessRetainage
              previousPayments
              balanceToFinish
              balanceToFinishWithRetention
            }
          }
        }
      `,
        { id },
      );
      return data.payApp ?? null;
    } catch (e: any) {
      return { error: e?.message ?? String(e) };
    }
  }

  /**
   * Wraps Siteline's paginatedContracts(input: GetPaginatedContractsInput!) GraphQL query.
   * Only limit + cursor — no month/status filters (full list per Siteline).
   */
  async getPaginatedContracts(input: { limit?: number; cursor?: string }): Promise<unknown> {
    if (!this.isConfigured()) {
      return { configured: false, message: 'Siteline API not configured' };
    }

    const gqlInput: Record<string, unknown> = {};
    if (typeof input.limit === 'number') gqlInput.limit = input.limit;
    if (input.cursor) gqlInput.cursor = input.cursor;

    const payAppsField = 'payApps {';

    try {
      const data = await this.graphql<{ paginatedContracts: unknown }>(
        `
        query paginatedContracts($input: GetPaginatedContractsInput!) {
          paginatedContracts(input: $input) {
            cursor
            hasNext
            contracts {
              id
              createdAt
              updatedAt
              internalProjectNumber
              billingType
              percentComplete
              status
              timeZone
              paymentTermsType
              paymentTerms
              project {
                id
                name
                projectNumber
                timeZone
                gcName
                bondNumber
                createdAt
                updatedAt
                gcAddress {
                  street1
                  city
                  state
                  postalCode
                  country
                }
              }
              ${payAppsField}
                id
                createdAt
                payAppNumber
                billingType
                status
                statusChangedAt
                billingStart
                billingEnd
                payAppDueDate
                timeZone
                retentionOnly
                currentBilled
                currentRetention
                totalRetention
                totalValue
                balanceToFinish
                previousRetentionBilled
                retentionReleased
                retentionHeldPercent
                updatedAt
              }
            }
          }
        }
      `,
        { input: gqlInput },
      );
      return data.paginatedContracts;
    } catch (e: any) {
      return { error: e?.message ?? String(e) };
    }
  }

  /**
   * `paginatedContracts` for **cron discovery**: `contractStatus` (default ACTIVE), no month filter.
   * Returns only `contracts { id }` and pagination fields to keep payloads small.
   * Hydration still uses `getContractFull` per unique id.
   */
  async getPaginatedContractsActiveDiscovery(
    input: {
      limit?: number;
      cursor?: string;
      contractStatus?: string;
      payAppStatus?: string;
    },
    apiToken?: string,
  ): Promise<unknown> {
    const token = apiToken ? normalizeSitelineApiToken(apiToken) : this.apiToken;
    if (!this.apiUrl || !token) {
      return { configured: false, message: 'Siteline API not configured' };
    }

    const gqlInput: Record<string, unknown> = {
      contractStatus: String(input.contractStatus ?? 'ACTIVE').trim(),
    };
    if (typeof input.limit === 'number') gqlInput.limit = input.limit;
    if (input.cursor) gqlInput.cursor = input.cursor;
    if (input.payAppStatus && input.payAppStatus.trim()) {
      gqlInput.payAppStatus = input.payAppStatus.trim();
    }

    try {
      const data = await this.graphqlWithTarget<{ paginatedContracts: unknown }>(
        this.apiTarget(token),
        `
        query paginatedContractsActiveDiscovery($input: GetPaginatedContractsInput!) {
          paginatedContracts(input: $input) {
            cursor
            hasNext
            contracts {
              id
            }
          }
        }
      `,
        { input: gqlInput },
      );
      return data.paginatedContracts;
    } catch (e: any) {
      return { error: e?.message ?? String(e) };
    }
  }

  /**
   * Wraps Siteline's paginatedPayApps(input: GetPaginatedPayAppsInput!) GraphQL query.
   * Only limit + cursor — no month filter.
   */
  async getPaginatedPayApps(input: { limit?: number; cursor?: string }): Promise<unknown> {
    if (!this.isConfigured()) {
      return { configured: false, message: 'Siteline API not configured' };
    }

    const gqlInput: Record<string, unknown> = {};
    if (typeof input.limit === 'number') gqlInput.limit = input.limit;
    if (input.cursor) gqlInput.cursor = input.cursor;

    try {
      const data = await this.graphql<{ paginatedPayApps: unknown }>(
        `
        query paginatedPayApps($input: GetPaginatedPayAppsInput!) {
          paginatedPayApps(input: $input) {
            totalCount
            cursor
            hasNext
            payApps {
              id
              createdAt
              updatedAt
              payAppNumber
              billingType
              billingStart
              billingEnd
              payAppDueDate
              status
              statusChangedAt
              retentionOnly
              currentBilled
              currentRetention
              totalRetention
              totalValue
              balanceToFinish
              previousRetentionBilled
              retentionReleased
              retentionHeldPercent
              timeZone
              contract {
                id
                billingType
                status
                timeZone
                paymentTermsType
                paymentTerms
                percentComplete
                internalProjectNumber
                project {
                  id
                  name
                  projectNumber
                  timeZone
                  bondNumber
                  createdAt
                  updatedAt
                  gcName
                  gcAddress {
                    street1
                    city
                    state
                    postalCode
                    country
                  }
                }
                leadPMs {
                  id
                  firstName
                  lastName
                  email
                }
              }
              progress {
                id
                progressBilled
                storedMaterialBilled
                totalValue
                sovLineItem {
                  id
                  code
                  name
                }
              }
              g702Values {
                originalContractSum
                netChangeByChangeOrders
                contractSumToDate
                totalCompletedToDate
                progressRetentionPercent
                progressRetentionAmount
                materialsRetentionPercent
                materialsRetentionAmount
                totalRetention
                totalLessRetainage
                previousPayments
                balanceToFinish
                balanceToFinishWithRetention
              }
            }
          }
        }
      `,
        { input: gqlInput },
      );
      return data.paginatedPayApps;
    } catch (e: any) {
      return { error: e?.message ?? String(e) };
    }
  }

  /**
   * Wraps Siteline's agingDashboard(input: DashboardInput!) query.
   * Can use a dedicated secondary URL/token flow for aging only.
   */
  async getAgingDashboard(
    input: {
      companyId?: string | null;
      startDate: string; // YYYY-MM-DD
      endDate: string; // YYYY-MM-DD
      search?: string;
      overdueOnly?: boolean;
    },
    _apiToken?: string,
  ): Promise<unknown> {
    if (!this.isAgingDashboardConfigured()) {
      return {
        configured: false,
        message:
          'Siteline agingDashboard requires SITELINE_API_URL_SECONDARY (https://api.siteline.com) and Firebase auth (SITELINE_IDENTITY_API_KEY_SECONDARY + SITELINE_AUTH_EMAIL_SECONDARY / SITELINE_AUTH_PASSWORD_SECONDARY, or refresh token). Entity siteline_* tokens only work on api-external (contracts), not aging.',
      };
    }

    const gqlInput: Record<string, unknown> = {
      companyId: input.companyId ?? null,
      startDate: input.startDate,
      endDate: input.endDate,
      filters: {
        overdueOnly: input.overdueOnly ?? false,
        search: input.search ?? '',
      },
    };

    try {
      const data = await this.agingGraphql<{ agingDashboard: unknown }>(
        `
        query agingDashboard($input: DashboardInput!) {
          agingDashboard(input: $input) {
            __typename
            payAppAgingSummary {
              __typename
              amountOutstandingThisMonth
              amountOutstandingMonthOverMonthPercent
              amountAged30Days
              amountAged30DaysMonthOverMonthPercent
              amountAged60Days
              amountAged60DaysMonthOverMonthPercent
              amountAged90Days
              amountAged90DaysMonthOverMonthPercent
              amountAged120Days
              amountAged120DaysMonthOverMonthPercent
              averageDaysToPaid
              averageDaysToPaidMonthOverMonthPercent
              payAppAgingBreakdown {
                __typename
                numCurrent
                numAged30Days
                numAged60Days
                numAged90Days
                numAged120Days
                amountAgedTotal
                amountAgedCurrent
                amountAged30Days
                amountAged60Days
                amountAged90Days
                amountAged120Days
                amountAgedTotalOverdueOnly
                averageDaysToPaid
              }
            }
            contracts {
              __typename
              contract {
                __typename
                id
                billingType
                internalProjectNumber
                paymentTermsType
                paymentTerms
                project {
                  __typename
                  id
                  name
                  projectNumber
                  gcName
                  gc {
                    __typename
                    id
                    name
                  }
                }
                company {
                  __typename
                  id
                }
                leadPMs {
                  __typename
                  id
                  firstName
                  lastName
                }
              }
              agingBreakdown {
                __typename
                numCurrent
                numAged30Days
                numAged60Days
                numAged90Days
                numAged120Days
                amountAgedTotal
                amountAgedCurrent
                amountAged30Days
                amountAged60Days
                amountAged90Days
                amountAged120Days
                amountAgedTotalOverdueOnly
                averageDaysToPaid
              }
              billingStatus
              hasMissingPreSitelinePayApps
            }
          }
        }
      `,
        { input: gqlInput },
      );
      return data.agingDashboard;
    } catch (e: any) {
      return { error: e?.message ?? String(e) };
    }
  }
}
