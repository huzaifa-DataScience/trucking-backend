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
            users {
              id
              firstName
              lastName
              email
              jobTitle
              phoneNumber
              status
            }
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
   * Used by the cron job to refresh lead PM info for contracts and
   * (optionally) cached aging data.
   */
  async getAgingDashboard(input: {
    companyId?: string | null;
    startDate: string; // YYYY-MM-DD
    endDate: string;   // YYYY-MM-DD
    search?: string;
    overdueOnly?: boolean;
  }): Promise<unknown> {
    if (!this.isConfigured()) {
      return { configured: false, message: 'Siteline API not configured' };
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
      const data = await this.graphql<{ agingDashboard: unknown }>(
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
