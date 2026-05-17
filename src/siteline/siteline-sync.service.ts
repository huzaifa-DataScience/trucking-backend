import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SitelineService } from './siteline.service';
import { resolveLeadPmEmail, resolveLeadPmEmailFromFullName } from './siteline-pm-email.util';
import {
  SitelineContract,
  SitelinePayApp,
  SitelineAgingSummary,
  SitelineAgingContract,
} from '../database/entities';

/**
 * Periodically pulls billing data from Siteline into SQL (`Siteline_Contracts`, `Siteline_PayApps`,
 * aging tables). Contract sync uses **`paginatedPayApps`** + optional **`paginatedContracts`**
 * (`ACTIVE`) for discovery, then **`contract(id)`** hydrate.
 */
@Injectable()
export class SitelineSyncService {
  private readonly logger = new Logger(SitelineSyncService.name);

  /** Prevents stacking another sync while the previous run is still awaiting Siteline/DB. */
  private contractsSyncInFlight = false;
  private agingSyncInFlight = false;

  constructor(
    private readonly config: ConfigService,
    private readonly siteline: SitelineService,
    @InjectRepository(SitelineContract)
    private readonly contractRepo: Repository<SitelineContract>,
    @InjectRepository(SitelinePayApp)
    private readonly payAppRepo: Repository<SitelinePayApp>,
  ) {}

  /**
   * Cron job: **only** Siteline `agingDashboard` → `Siteline_AgingSummary` / `Siteline_AgingContracts`.
   * No data is copied from `Siteline_PayApps` or computed locally here.
   * If `agingDashboard` fails (wrong URL, schema, 429, etc.), aging tables are left unchanged.
   *
   * GET /siteline/aging-report reads these tables (unless `useSitelineDashboard=false`, which uses pay apps in-process only).
   *
   * Runs every 10 minutes at second 0.
   */
  @Cron('0 */10 * * * *')
  async syncAgingSnapshot(): Promise<void> {
    if (this.config.get<string>('SITELINE_AGING_SNAPSHOT_ENABLED', 'true') !== 'true') {
      return;
    }
    if (!this.siteline.isConfigured()) {
      this.logger.warn('Siteline sync skipped: API not configured');
      return;
    }
    if (this.agingSyncInFlight) {
      this.logger.warn(
        'Siteline aging sync skipped: previous run still in progress (next tick in <= 10 min).',
      );
      return;
    }
    this.agingSyncInFlight = true;
    try {
      const endDate = new Date().toISOString().slice(0, 10);
      /** Widest window Siteline accepts — no day/month lookback env; all historical through today. */
      const startDate = '1970-01-01';
      const agingSource = (this.config.get<string>('SITELINE_AGING_SOURCE', 'auto') || 'auto')
        .trim()
        .toLowerCase();
      this.logger.log(
        `Starting Siteline aging sync (source=${agingSource}, ${startDate}..${endDate}).`,
      );

      let agingCompanyId: string | null = null;
      const curCo = (await this.siteline.getCurrentCompany()) as Record<string, unknown> | null;
      if (curCo && typeof curCo === 'object' && 'error' in curCo) {
        const errMsg = String(curCo.error);
        sitelineAuthFailureHint(this.logger, errMsg);
      } else if (curCo && typeof curCo === 'object' && curCo.id != null) {
        agingCompanyId = String(curCo.id);
      }
      if (!agingCompanyId && !(curCo && typeof curCo === 'object' && 'error' in curCo)) {
        this.logger.warn(
          'Siteline aging sync: could not resolve currentCompany.id — agingDashboard may return empty.',
        );
      }


      if (agingSource === 'local') {
        await this.rebuildAgingFromLocalPayApps(startDate, endDate, agingCompanyId);
        return;
      }

      const aging: any = await this.siteline.getAgingDashboard({
        companyId: agingCompanyId,
        startDate,
        endDate,
      });

      if (aging && typeof aging === 'object' && 'error' in aging) {
        const errMsg = String(aging.error);
        this.logger.warn(`Siteline agingDashboard returned error: ${errMsg}`);
        sitelineAuthFailureHint(this.logger, errMsg);
      }
      if (aging && typeof aging === 'object' && aging.configured === false) {
        this.logger.warn('Siteline agingDashboard skipped: API not configured (SITELINE_API_TOKEN / URL).');
      }

      const agingRefreshFailed =
        !aging ||
        (typeof aging === 'object' && ('error' in aging || aging.configured === false));

      if (agingRefreshFailed) {
        if (agingSource === 'auto') {
          this.logger.warn(
            'Siteline agingDashboard failed. Falling back to local pay-app aging snapshot for this run.',
          );
          await this.rebuildAgingFromLocalPayApps(startDate, endDate, agingCompanyId);
          return;
        }
        this.logger.warn(
          'Siteline aging sync: did not update Siteline_AgingSummary / Siteline_AgingContracts (agingDashboard failed). Existing rows were left unchanged.',
        );
        return;
      }

      const contractsFromAging: any[] = aging?.contracts ?? [];
      if (!contractsFromAging.length) {
        this.logger.warn(
          'Siteline agingDashboard returned zero contracts[] — writing summary row only if present.',
        );
      }

      await this.contractRepo.manager.transaction(async (em) => {
          await em.createQueryBuilder().delete().from(SitelineAgingContract).execute();
          await em.createQueryBuilder().delete().from(SitelineAgingSummary).execute();

          const pay = aging?.payAppAgingSummary ?? {};
          const bd = pay.payAppAgingBreakdown ?? {};
          const companyIdFromAging =
            contractsFromAging.find((e: any) => e?.contract?.company?.id)?.contract?.company?.id ??
            null;

          const summary = em.create(SitelineAgingSummary, {
            companyId: companyIdFromAging != null ? String(companyIdFromAging) : null,
            startDate,
            endDate,
            amountOutstandingThisMonth: pickBigint(pay.amountOutstandingThisMonth),
            amountAged30Days: pickBigint(pay.amountAged30Days),
            amountAged60Days: pickBigint(pay.amountAged60Days),
            amountAged90Days: pickBigint(pay.amountAged90Days),
            amountAged120Days: pickBigint(pay.amountAged120Days),
            averageDaysToPaid: pickDecimal(pay.averageDaysToPaid ?? bd.averageDaysToPaid),
            numCurrent: pickInt(bd.numCurrent),
            numAged30Days: pickInt(bd.numAged30Days),
            numAged60Days: pickInt(bd.numAged60Days),
            numAged90Days: pickInt(bd.numAged90Days),
            numAged120Days: pickInt(bd.numAged120Days),
            amountAgedTotal: pickBigint(bd.amountAgedTotal),
            amountAgedCurrent: pickBigint(bd.amountAgedCurrent),
            amountAgedBreakdown30Days: pickBigint(bd.amountAged30Days),
            amountAgedBreakdown60Days: pickBigint(bd.amountAged60Days),
            amountAgedBreakdown90Days: pickBigint(bd.amountAged90Days),
            amountAgedBreakdown120Days: pickBigint(bd.amountAged120Days),
            amountAgedTotalOverdueOnly: pickBigint(bd.amountAgedTotalOverdueOnly),
            createdAt: new Date(),
          });
          await em.save(SitelineAgingSummary, summary);

          for (const entry of contractsFromAging) {
            const contract = entry?.contract;
            const ab = entry?.agingBreakdown;
            if (!contract?.id) continue;

            const primaryPm = contract.leadPMs?.[0];
            const first = primaryPm?.firstName ?? '';
            const last = primaryPm?.lastName ?? '';
            const fullName = `${first} ${last}`.trim() || null;
            const email = resolveLeadPmEmail(primaryPm?.email, first, last);

            const proj = contract.project ?? {};
            const row = em.create(SitelineAgingContract, {
              snapshotId: summary.id,
              contractId: contract.id,
              internalProjectNumber: contract.internalProjectNumber ?? null,
              projectName: typeof proj.name === 'string' ? proj.name : null,
              projectNumber: proj.projectNumber ?? null,
              companyId: contract.company?.id != null ? String(contract.company.id) : null,
              leadPmName: fullName,
              leadPmEmail: email,
              numCurrent: pickInt(ab?.numCurrent),
              numAged30Days: pickInt(ab?.numAged30Days),
              numAged60Days: pickInt(ab?.numAged60Days),
              numAged90Days: pickInt(ab?.numAged90Days),
              numAged120Days: pickInt(ab?.numAged120Days),
              amountAgedTotal: pickBigint(ab?.amountAgedTotal),
              amountAgedCurrent: pickBigint(ab?.amountAgedCurrent),
              amountAged30Days: pickBigint(ab?.amountAged30Days),
              amountAged60Days: pickBigint(ab?.amountAged60Days),
              amountAged90Days: pickBigint(ab?.amountAged90Days),
              amountAged120Days: pickBigint(ab?.amountAged120Days),
              amountAgedTotalOverdueOnly: pickBigint(ab?.amountAgedTotalOverdueOnly),
              averageDaysToPaid: pickDecimal(ab?.averageDaysToPaid),
            });
            await em.save(SitelineAgingContract, row);
          }
        });

      this.logger.log(
        `Siteline aging sync finished. Aging contract rows written: ${contractsFromAging.length}.`,
      );
    } catch (err: any) {
      this.logger.error(`Siteline aging sync failed (will retry next run): ${err?.message ?? err}`);
    } finally {
      this.agingSyncInFlight = false;
    }
  }

  /**
   * Contract + pay-app sync: discovery from **`paginatedPayApps`** plus optional **`paginatedContracts`**
   * with `contractStatus: ACTIVE`; union **contract ids**; then **`contract(id)`** hydrates each unique
   * contract into `Siteline_Contracts` / `Siteline_PayApps`.
   * Runs every 10 minutes at second 0.
   */
  @Cron('0 */10 * * * *')
  async syncContractsAndPayApps(): Promise<void> {
    if (!this.siteline.isConfigured()) {
      this.logger.warn('Siteline contract sync skipped: API not configured');
      return;
    }
    if (this.config.get<string>('SITELINE_CONTRACT_SYNC_ENABLED', 'true') !== 'true') {
      return;
    }
    if (this.contractsSyncInFlight) {
      this.logger.warn('Siteline contract sync skipped: previous run still in progress.');
      return;
    }
    this.contractsSyncInFlight = true;
    const pageSizeRaw = Math.floor(
      Number(this.config.get<string>('SITELINE_PAY_APPS_SYNC_PAGE_SIZE', '100')) || 100,
    );
    const pageSize = Math.min(200, Math.max(1, pageSizeRaw));
    const delayMs = Math.max(
      0,
      Math.floor(Number(this.config.get<string>('SITELINE_GET_CONTRACT_DELAY_MS', '0')) || 0),
    );

    const contractIdsToHydrate = new Set<string>();
    let cursor: string | undefined;
    let payAppsListed = 0;
    let contractsActiveListed = 0;
    let apiTotalCount: number | null = null;
    let hydrated = 0;
    let hydrateErrors = 0;

    try {
      this.logger.log(
        `Starting Siteline contract sync (paginatedPayApps + optional paginatedContracts ACTIVE → getContract hydrate, pageSize=${pageSize}, delayMs=${delayMs}).`,
      );

      do {
        const result = (await this.siteline.getPaginatedPayAppsDiscovery({
          limit: pageSize,
          cursor,
        })) as any;

        if (result && typeof result === 'object' && 'error' in result) {
          const errMsg = String(result.error);
          this.logger.warn(`Siteline paginatedPayApps (discovery) failed: ${errMsg}`);
          sitelineAuthFailureHint(this.logger, errMsg);
          break;
        }

        const page = result?.paginatedPayApps ?? result;
        const payApps: any[] = page?.payApps ?? [];
        if (apiTotalCount == null && typeof page?.totalCount === 'number') {
          apiTotalCount = page.totalCount;
        }

        const nextCursor =
          page?.hasNext && page?.cursor != null && page?.cursor !== '' ? String(page.cursor) : undefined;
        this.logger.log(
          `Siteline pay-apps page: rows=${payApps.length}, hasNext=${!!page?.hasNext}, totalCount(api)=${page?.totalCount ?? '?'}`,
        );

        for (const pa of payApps) {
          const cid = pa?.contract?.id;
          if (!pa?.id || !cid) continue;
          payAppsListed += 1;
          contractIdsToHydrate.add(String(cid));
          try {
            await this.payAppRepo.save(
              this.payAppRepo.create({
                id: String(pa.id),
                contractId: String(cid),
                number:
                  typeof pa.payAppNumber === 'number'
                    ? pa.payAppNumber
                    : pa.payAppNumber != null
                      ? parseInt(String(pa.payAppNumber), 10)
                      : null,
                billingType: pa.billingType != null ? String(pa.billingType) : null,
                status: null,
                billed: null,
                retention: null,
                totalValue: null,
                startDate: null,
                endDate: null,
                dueDate: null,
                updatedAt: null,
                createdAt: null,
                lastSyncedAt: new Date(),
              }),
            );
          } catch (stubErr: any) {
            this.logger.warn(
              `Siteline sync: stub save pay app ${pa.id}: ${stubErr?.message ?? stubErr}. Skipping stub.`,
            );
          }
        }

        cursor = nextCursor;
      } while (cursor);

      const contractsPagedEnabled =
        (this.config.get<string>('SITELINE_CONTRACTS_PAGINATED_SYNC_ENABLED', 'true') || '')
          .trim()
          .toLowerCase() !== 'false';
      const contractsPageLimit = Math.min(
        500,
        Math.max(
          1,
          Math.floor(
            Number(this.config.get<string>('SITELINE_CONTRACTS_PAGINATED_SYNC_PAGE_SIZE', '500')) ||
              500,
          ),
        ),
      );
      const optionalPayAppStatus = (
        this.config.get<string>('SITELINE_CONTRACTS_PAGINATED_PAY_APP_STATUS') || ''
      ).trim();
      let contractsCursor: string | undefined;
      if (contractsPagedEnabled) {
        let pcPage = 0;
        do {
          pcPage += 1;
          const pcRes = (await this.siteline.getPaginatedContractsActiveDiscovery({
            limit: contractsPageLimit,
            cursor: contractsCursor,
            contractStatus: 'ACTIVE',
            payAppStatus: optionalPayAppStatus || undefined,
          })) as any;
          if (pcRes && typeof pcRes === 'object' && 'error' in pcRes) {
            this.logger.warn(
              `Siteline paginatedContracts ACTIVE discovery failed: ${String(pcRes.error)}`,
            );
            sitelineAuthFailureHint(this.logger, String(pcRes.error));
            break;
          }
          const pcPageData = pcRes;
          const contracts: any[] = pcPageData?.contracts ?? [];
          for (const c of contracts) {
            if (c?.id) contractIdsToHydrate.add(String(c.id));
          }
          contractsActiveListed += contracts.length;
          contractsCursor =
            pcPageData?.hasNext &&
            pcPageData?.cursor != null &&
            String(pcPageData.cursor) !== ''
              ? String(pcPageData.cursor)
              : undefined;
          this.logger.log(
            `Siteline paginatedContracts ACTIVE: page=${pcPage}, rows=${contracts.length}, hasNext=${!!pcPageData?.hasNext}, uniqueContractsSoFar=${contractIdsToHydrate.size}`,
          );
        } while (contractsCursor);
      } else {
        this.logger.log('Siteline paginatedContracts ACTIVE discovery skipped (SITELINE_CONTRACTS_PAGINATED_SYNC_ENABLED=false).');
      }

      this.logger.log(
        `Siteline discovery done. payAppRows=${payAppsListed}, contractsActiveRows=${contractsActiveListed}, uniqueContracts=${contractIdsToHydrate.size}, payAppsTotalCount(api)=${apiTotalCount ?? '?'}.`,
      );

      for (const cid of contractIdsToHydrate) {
        if (delayMs > 0) {
          await new Promise((r) => setTimeout(r, delayMs));
        }
        const detail = (await this.siteline.getContractFull(cid)) as any;
        if (detail && typeof detail === 'object' && 'error' in detail) {
          this.logger.warn(`Siteline getContract(${cid}): ${String(detail.error)}`);
          hydrateErrors += 1;
          continue;
        }
        if (!detail || typeof detail !== 'object') {
          this.logger.warn(`Siteline getContract(${cid}): empty response`);
          hydrateErrors += 1;
          continue;
        }
        try {
          await this.persistContractDetail(cid, detail);
          hydrated += 1;
        } catch (persistErr: any) {
          this.logger.error(
            `Siteline sync: persist contract ${cid}: ${persistErr?.message ?? persistErr}. Skipping.`,
          );
          hydrateErrors += 1;
        }
        if (this.config.get<string>('SITELINE_CRON_LOG_CONTRACT_DETAIL', 'false') === 'true') {
          const payAppsArr = Array.isArray(detail?.payApps) ? detail.payApps : [];
          this.logger.log(
            `Siteline getContract(${cid}) detail: payApps=${payAppsArr.length}, leadPMs=${Array.isArray(detail?.leadPMs) ? detail.leadPMs.length : 0}.`,
          );
        }
      }

      this.logger.log(
        `Siteline contract sync finished. Hydrated=${hydrated}/${contractIdsToHydrate.size}, hydrateErrors=${hydrateErrors}.`,
      );
    } catch (err: any) {
      this.logger.error(`Siteline contract sync failed (will retry next run): ${err?.message ?? err}`);
    } finally {
      this.contractsSyncInFlight = false;
    }
  }

  /** Upsert one contract + nested pay apps from `contract(id)` response. */
  private async persistContractDetail(contractId: string, detail: any): Promise<void> {
    const existing = await this.contractRepo.findOne({ where: { id: contractId } });
    const proj = detail.project ?? {};
    const primaryPm = detail?.leadPMs?.[0];
    const leadPmFirst = primaryPm?.firstName ?? '';
    const leadPmLast = primaryPm?.lastName ?? '';
    const fullName = `${leadPmFirst} ${leadPmLast}`.trim();
    const leadPmName: string | null = fullName.length ? fullName : null;
    const leadPmEmail = resolveLeadPmEmail(primaryPm?.email, leadPmFirst, leadPmLast);

    const latestTotal =
      detail.latestTotalValue != null && detail.latestTotalValue !== ''
        ? String(detail.latestTotalValue)
        : null;
    const contractNumber =
      detail.contractNumber != null && String(detail.contractNumber).trim() !== ''
        ? String(detail.contractNumber).trim()
        : null;
    const projectNumber =
      (detail.projectNumber != null && String(detail.projectNumber).trim() !== ''
        ? String(detail.projectNumber).trim()
        : null) ??
      (proj.projectNumber != null ? String(proj.projectNumber) : null) ??
      null;

    const patch = {
      id: contractId,
      projectNumber,
      projectName: typeof proj.name === 'string' ? proj.name : null,
      internalProjectNumber: detail.internalProjectNumber ?? null,
      latestTotalValue: latestTotal,
      contractNumber,
      billingType: detail.billingType ?? null,
      percentComplete: parsePercentComplete(detail.percentComplete),
      status: detail.status ?? null,
      timeZone: detail.timeZone ?? null,
      leadPmName,
      leadPmEmail,
      lastSyncedAt: new Date(),
    };
    const contractEntity = this.contractRepo.merge(
      existing ?? this.contractRepo.create({ id: contractId }),
      patch,
    );
    await this.contractRepo.save(contractEntity);

    const payApps: any[] = detail?.payApps ?? [];
    for (const pa of payApps) {
      if (!pa?.id) continue;
      try {
        const payAppEntity = this.payAppRepo.create({
          id: String(pa.id),
          contractId,
          number: pa.payAppNumber ?? null,
          billingType: pa.billingType != null ? String(pa.billingType) : null,
          status: pa.status ?? null,
          billed: pa.currentBilled ?? null,
          retention: pa.currentRetention ?? null,
          totalValue: pa.totalValue ?? null,
          startDate: pa.billingStart ? new Date(pa.billingStart) : null,
          endDate: pa.billingEnd ? new Date(pa.billingEnd) : null,
          dueDate: pa.payAppDueDate ? new Date(pa.payAppDueDate) : null,
          updatedAt: pa.updatedAt ? new Date(pa.updatedAt) : null,
          createdAt: pa.createdAt ? new Date(pa.createdAt) : null,
          lastSyncedAt: new Date(),
        });
        await this.payAppRepo.save(payAppEntity);
      } catch (paErr: any) {
        this.logger.warn(
          `Siteline contract sync: DB error saving pay app ${pa.id}: ${paErr?.message ?? paErr}. Skipping.`,
        );
      }
    }
  }

  /**
   * Fallback/source=local: build aging snapshot from synced pay apps.
   * Buckets are based on payApp due date and net cents = billed - retention.
   */
  private async rebuildAgingFromLocalPayApps(
    startDate: string,
    endDate: string,
    companyId: string | null,
  ): Promise<void> {
    const payApps = await this.payAppRepo.find({ relations: ['contract'] });
        const today = new Date();
    today.setHours(0, 0, 0, 0);

    type RowAgg = {
      contractId: string;
      internalProjectNumber: string | null;
      projectName: string | null;
      projectNumber: string | null;
      leadPmName: string | null;
      leadPmEmail: string | null;
      numCurrent: number;
      numAged30Days: number;
      numAged60Days: number;
      numAged90Days: number;
      numAged120Days: number;
      amountAgedCurrent: number;
      amountAged30Days: number;
      amountAged60Days: number;
      amountAged90Days: number;
      amountAged120Days: number;
      amountAgedTotal: number;
    };

    const byContract = new Map<string, RowAgg>();
    const summary = {
      numCurrent: 0,
      numAged30Days: 0,
      numAged60Days: 0,
      numAged90Days: 0,
      numAged120Days: 0,
      amountAgedCurrent: 0,
      amountAged30Days: 0,
      amountAged60Days: 0,
      amountAged90Days: 0,
      amountAged120Days: 0,
      amountAgedTotal: 0,
    };

    for (const pa of payApps) {
      if (pa.status === 'PAID') continue;
      if (!pa.contract) continue;
      const netCents = Math.trunc(Number(pa.billed ?? 0) - Number(pa.retention ?? 0));
      if (!Number.isFinite(netCents) || netCents <= 0) continue;
      // Siteline aging dashboard buckets align with billing period end date.
      // Fall back to due date only when billing end is missing.
      const anchorDate = pa.endDate ? new Date(pa.endDate) : pa.dueDate ? new Date(pa.dueDate) : null;
      const daysPastDue = anchorDate
        ? Math.floor((today.getTime() - anchorDate.getTime()) / (24 * 60 * 60 * 1000))
        : 0;
      // Siteline dashboard excludes future-cycle items from aging totals.
      if (daysPastDue < 0) continue;

      let row = byContract.get(pa.contractId);
      if (!row) {
        row = {
          contractId: pa.contractId,
          internalProjectNumber: pa.contract.internalProjectNumber ?? null,
          projectName: pa.contract.projectName ?? null,
          projectNumber: pa.contract.projectNumber ?? null,
          leadPmName: (pa.contract as any).leadPmName ?? null,
          leadPmEmail: resolveLeadPmEmailFromFullName(
            (pa.contract as any).leadPmEmail,
            (pa.contract as any).leadPmName,
          ),
          numCurrent: 0,
          numAged30Days: 0,
          numAged60Days: 0,
          numAged90Days: 0,
          numAged120Days: 0,
          amountAgedCurrent: 0,
          amountAged30Days: 0,
          amountAged60Days: 0,
          amountAged90Days: 0,
          amountAged120Days: 0,
          amountAgedTotal: 0,
        };
        byContract.set(pa.contractId, row);
      }

      row.amountAgedTotal += netCents;
      summary.amountAgedTotal += netCents;
      // Siteline bucket semantics (as shown in their UI / AgingBreakdown):
      // - Current: 0..30 days
      // - 30: 31..60
      // - 60: 61..90
      // - 90: 91..120
      // - 120: >120
      if (daysPastDue <= 30) {
        row.numCurrent += 1;
        row.amountAgedCurrent += netCents;
        summary.numCurrent += 1;
        summary.amountAgedCurrent += netCents;
      } else if (daysPastDue <= 60) {
        row.numAged30Days += 1;
        row.amountAged30Days += netCents;
        summary.numAged30Days += 1;
        summary.amountAged30Days += netCents;
      } else if (daysPastDue <= 90) {
        row.numAged60Days += 1;
        row.amountAged60Days += netCents;
        summary.numAged60Days += 1;
        summary.amountAged60Days += netCents;
      } else if (daysPastDue <= 120) {
        row.numAged90Days += 1;
        row.amountAged90Days += netCents;
        summary.numAged90Days += 1;
        summary.amountAged90Days += netCents;
      } else {
        row.numAged120Days += 1;
        row.amountAged120Days += netCents;
        summary.numAged120Days += 1;
        summary.amountAged120Days += netCents;
      }
    }

    await this.contractRepo.manager.transaction(async (em) => {
      await em.createQueryBuilder().delete().from(SitelineAgingContract).execute();
      await em.createQueryBuilder().delete().from(SitelineAgingSummary).execute();

      const summaryRow = em.create(SitelineAgingSummary, {
        companyId,
          startDate,
          endDate,
        amountOutstandingThisMonth: String(summary.amountAgedTotal),
        amountAged30Days: String(summary.amountAged30Days),
        amountAged60Days: String(summary.amountAged60Days),
        amountAged90Days: String(summary.amountAged90Days),
        amountAged120Days: String(summary.amountAged120Days),
        averageDaysToPaid: null,
        numCurrent: summary.numCurrent,
        numAged30Days: summary.numAged30Days,
        numAged60Days: summary.numAged60Days,
        numAged90Days: summary.numAged90Days,
        numAged120Days: summary.numAged120Days,
        amountAgedTotal: String(summary.amountAgedTotal),
        amountAgedCurrent: String(summary.amountAgedCurrent),
        amountAgedBreakdown30Days: String(summary.amountAged30Days),
        amountAgedBreakdown60Days: String(summary.amountAged60Days),
        amountAgedBreakdown90Days: String(summary.amountAged90Days),
        amountAgedBreakdown120Days: String(summary.amountAged120Days),
        amountAgedTotalOverdueOnly: String(
          summary.amountAged30Days +
            summary.amountAged60Days +
            summary.amountAged90Days +
            summary.amountAged120Days,
        ),
        createdAt: new Date(),
      });
      await em.save(SitelineAgingSummary, summaryRow);

      for (const row of byContract.values()) {
        const contractRow = em.create(SitelineAgingContract, {
          snapshotId: summaryRow.id,
          contractId: row.contractId,
          internalProjectNumber: row.internalProjectNumber,
          projectName: row.projectName,
          projectNumber: row.projectNumber,
          companyId,
          leadPmName: row.leadPmName,
          leadPmEmail: row.leadPmEmail,
          numCurrent: row.numCurrent,
          numAged30Days: row.numAged30Days,
          numAged60Days: row.numAged60Days,
          numAged90Days: row.numAged90Days,
          numAged120Days: row.numAged120Days,
          amountAgedTotal: String(row.amountAgedTotal),
          amountAgedCurrent: String(row.amountAgedCurrent),
          amountAged30Days: String(row.amountAged30Days),
          amountAged60Days: String(row.amountAged60Days),
          amountAged90Days: String(row.amountAged90Days),
          amountAged120Days: String(row.amountAged120Days),
          amountAgedTotalOverdueOnly: String(
            row.amountAged30Days + row.amountAged60Days + row.amountAged90Days + row.amountAged120Days,
          ),
          averageDaysToPaid: null,
        });
        await em.save(SitelineAgingContract, contractRow);
      }
    });

        this.logger.log(
      `Siteline aging sync (local pay-apps) finished. Aging contract rows written: ${byContract.size}.`,
    );
  }

}

/** Maps Siteline percentComplete to entity `decimal(5,2)` / number. */
function parsePercentComplete(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Logs once when Siteline rejects credentials (GraphQL error text varies by spelling). */
function sitelineAuthFailureHint(logger: Logger, errMsg: string): void {
  const m = String(errMsg).toLowerCase();
  if (
    m.includes('not authorised') ||
    m.includes('not authorized') ||
    m.includes('unauthorized')
  ) {
    logger.error(
      'Siteline API rejected this app token (Not Authorised). Fix: (1) GET /siteline/status — if dotEnvTokenMatchesLoaded is false, process.env overrides .env (unset SITELINE_API_TOKEN in shell/Docker/IDE). (2) Match SITELINE_API_URL to Postman (often https://api-external.siteline.com). (3) SITELINE_API_TOKEN = same value as Postman after "Bearer ".',
    );
  }
}

function pickInt(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : parseInt(String(v), 10);
  return Number.isFinite(n) ? n : null;
}

function pickBigint(v: unknown): string | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? Math.trunc(v) : parseInt(String(v), 10);
  return Number.isFinite(n) ? String(n) : null;
}

function pickDecimal(v: unknown): string | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : null;
}
