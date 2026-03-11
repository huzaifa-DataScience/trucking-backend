import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const GRAPHQL_PATH = '/graphql';

/** Siteline GraphQL response envelope (data + optional errors). */
interface GraphQLResponse<T = unknown> {
  data?: T;
  errors?: Array<{ message: string; path?: string[] }>;
}

/**
 * Service that calls Siteline's GraphQL API to fetch real billing data.
 * Schema: docs/SITELINE_SCHEMA_REFERENCE.md.
 */
@Injectable()
export class SitelineService {
  private readonly apiUrl: string;
  private readonly apiToken: string;

  /** Optional: e.g. "Api-Token" or "X-API-Key" to send token in that header; if unset, use "Authorization: Bearer <token>". */
  private readonly authHeader: string;

  constructor(private readonly config: ConfigService) {
    const base = this.config.get<string>('SITELINE_API_URL', '').replace(/\/$/, '');
    this.apiUrl = base.endsWith(GRAPHQL_PATH) ? base : `${base}${GRAPHQL_PATH}`;
    this.apiToken = this.config.get<string>('SITELINE_API_TOKEN', '') ?? '';
    this.authHeader = this.config.get<string>('SITELINE_AUTH_HEADER', '')?.trim() ?? '';
  }

  isConfigured(): boolean {
    return Boolean(this.apiUrl && this.apiToken);
  }

  private async graphql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.authHeader) {
      headers[this.authHeader] = this.apiToken;
    } else {
      headers.Authorization = `Bearer ${this.apiToken}`;
    }
    const res = await fetch(this.apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query, variables: variables ?? {} }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Siteline API HTTP ${res.status}: ${text}`);
    }
    const json = (await res.json()) as GraphQLResponse<T>;
    if (json.errors?.length) {
      const msg = json.errors.map((e) => e.message).join('; ');
      throw new Error(`Siteline GraphQL errors: ${msg}`);
    }
    if (json.data === undefined) throw new Error('Siteline API returned no data');
    return json.data as T;
  }

  async getCurrentCompany(): Promise<unknown> {
    if (!this.isConfigured()) {
      return { configured: false, message: 'Siteline API not configured' };
    }
    try {
      const data = await this.graphql<{ currentCompany: unknown }>(`
        query {
          currentCompany {
            id
            createdAt
            updatedAt
            name
            phoneNumber
            locations {
              id
              nickname
              street1
              street2
              city
              county
              state
              country
              postalCode
              timeZone
            }
          }
        }
      `);
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

  async getContract(id: string): Promise<unknown> {
    if (!this.isConfigured()) {
      return { configured: false, message: 'Siteline API not configured' };
    }
    try {
      const data = await this.graphql<{ contract: unknown }>(
        `
        query Contract($id: ID!) {
          contract(id: $id) {
            id
            createdAt
            updatedAt
            billingType
            status
            timeZone
            internalProjectNumber
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
              location {
                id
                nickname
                street1
                city
                state
                country
                postalCode
                timeZone
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
                sortOrder
                code
                name
                originalTotalValue
                latestTotalValue
                totalBilled
                progressComplete
              }
            }
            payApps {
              id
              payAppNumber
              billingStart
              billingEnd
              payAppDueDate
              status
              statusChangedAt
              currentBilled
              currentRetention
              totalRetention
              totalValue
              balanceToFinish
              retentionOnly
              updatedAt
            }
            changeOrderRequests {
              id
              name
              internalNumber
              amount
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
   * Input roughly matches the Postman collection: month, payAppStatus, contractStatus, limit, cursor.
   */
  async getPaginatedContracts(input: {
    month?: string;
    payAppStatus?: string;
    contractStatus?: string;
    limit?: number;
    cursor?: string;
  }): Promise<unknown> {
    if (!this.isConfigured()) {
      return { configured: false, message: 'Siteline API not configured' };
    }

    const gqlInput: Record<string, unknown> = {};
    if (input.month) gqlInput.month = input.month;
    if (input.payAppStatus) gqlInput.payAppStatus = input.payAppStatus;
    if (input.contractStatus) gqlInput.contractStatus = input.contractStatus;
    if (typeof input.limit === 'number') gqlInput.limit = input.limit;
    if (input.cursor) gqlInput.cursor = input.cursor;

    const monthForArg = (input.month ?? '').replace(/"/g, '\\"');

    try {
      const data = await this.graphql<{ paginatedContracts: unknown }>(
        `
        query paginatedContracts($input: GetPaginatedContractsInput!) {
          paginatedContracts(input: $input) {
            cursor
            hasNext
            contracts {
              id
              internalProjectNumber
              billingType
              percentComplete
              project {
                id
                name
                projectNumber
                timeZone
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
              payApps (months:["${monthForArg}"]) {
                id
                status
                billingStart
                billingEnd
                timeZone
                status
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
   * Wraps Siteline's paginatedPayApps(input: GetPaginatedPayAppsInput!) GraphQL query.
   * Input roughly matches the Postman collection: submittedInMonth, limit, cursor.
   */
  async getPaginatedPayApps(input: {
    submittedInMonth?: string;
    limit?: number;
    cursor?: string;
  }): Promise<unknown> {
    if (!this.isConfigured()) {
      return { configured: false, message: 'Siteline API not configured' };
    }

    const gqlInput: Record<string, unknown> = {};
    if (input.submittedInMonth) gqlInput.submittedInMonth = input.submittedInMonth;
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
              payAppNumber
              billingType
              contract {
                id
                internalProjectNumber
                project {
                  id
                  name
                  projectNumber
                  timeZone
                  architect
                  bondNumber
                  bondProvider
                  createdAt
                  gcAddress
                  gcName
                  owner
                  updatedAt
                  metadata
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
}
