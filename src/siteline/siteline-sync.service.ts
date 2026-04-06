import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SitelineService } from './siteline.service';
import {
  SitelineContract,
  SitelinePayApp,
  SitelineAgingSummary,
  SitelineAgingContract,
} from '../database/entities';

/**
 * Periodically pulls billing data from Siteline.
 * For now this only logs what it would sync; later we can upsert into SQL Server tables.
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
            const emailRaw = primaryPm?.email;
            const email =
              emailRaw != null && String(emailRaw).trim() ? String(emailRaw).trim() : null;

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
   * Optional: contract/pay-app sync (NOT used by /siteline/aging-report).
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
    let cursor: string | undefined;
    let totalContracts = 0;
    try {
      this.logger.log('Starting Siteline contract sync (paginatedContracts: limit + cursor only, all pages).');

      do {
        const result = (await this.siteline.getPaginatedContracts({
          limit: 100,
          cursor,
        })) as any;

        if (result && typeof result === 'object' && 'error' in result) {
          const errMsg = String(result.error);
          this.logger.warn(`Siteline paginatedContracts failed: ${errMsg}`);
          sitelineAuthFailureHint(this.logger, errMsg);
          break;
        }

        const page = result?.paginatedContracts ?? result;
        const contracts: any[] = page?.contracts ?? [];
        cursor = page?.hasNext ? page.cursor : undefined;
        this.logger.log(
          `Siteline contract sync page: fetched ${contracts.length} contracts (cursor=${cursor ?? 'end'})`,
        );

        for (const c of contracts) {
          if (!c?.id) continue;
          totalContracts += 1;
          const detail = (await this.siteline.getContract(c.id)) as any;
          if (this.config.get<string>('SITELINE_CRON_LOG_CONTRACT_DETAIL', 'false') === 'true') {
            this.logger.log(`Siteline getContract(${c.id}) detail fetched.`);
          } else {
            this.logger.log(
              `Siteline getContract(${c.id}) summary: payApps=${Array.isArray(detail?.payApps) ? detail.payApps.length : 0}, leadPMs=${Array.isArray(detail?.leadPMs) ? detail.leadPMs.length : 0}.`,
            );
          }
          const primaryPm = detail?.leadPMs?.[0];
          const leadPmFirst = primaryPm?.firstName ?? '';
          const leadPmLast = primaryPm?.lastName ?? '';
          const fullName = `${leadPmFirst} ${leadPmLast}`.trim();
          const leadPmName: string | null = fullName.length ? fullName : null;
          const leadPmEmail: string | null = primaryPm?.email ?? null;
          const payApps: any[] = detail?.payApps ?? [];

          try {
            const contractEntity = this.contractRepo.create({
              id: c.id,
              projectNumber: c.project?.projectNumber ?? null,
              projectName: c.project?.name ?? null,
              internalProjectNumber: c.internalProjectNumber ?? null,
              billingType: c.billingType ?? null,
              percentComplete: c.percentComplete ?? null,
              status: c.status ?? null,
              timeZone: c.timeZone ?? null,
              leadPmName,
              leadPmEmail,
              lastSyncedAt: new Date(),
            });
            await this.contractRepo.save(contractEntity);
          } catch (dbErr: any) {
            this.logger.error(
              `Siteline contract sync: DB error saving contract ${c.id}: ${dbErr?.message ?? dbErr}. Skipping contract.`,
            );
            continue;
          }

          for (const pa of payApps) {
            if (!pa?.id) continue;
            try {
              const payAppEntity = this.payAppRepo.create({
                id: pa.id,
                contractId: c.id,
                number: pa.payAppNumber ?? null,
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
      } while (cursor);

      this.logger.log(`Siteline contract sync finished. Total contracts processed: ${totalContracts}.`);
    } catch (err: any) {
      this.logger.error(`Siteline contract sync failed (will retry next run): ${err?.message ?? err}`);
    } finally {
      this.contractsSyncInFlight = false;
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
          leadPmEmail: (pa.contract as any).leadPmEmail ?? null,
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

/** Logs once when Siteline rejects credentials (GraphQL error text varies by spelling). */
function sitelineAuthFailureHint(logger: Logger, errMsg: string): void {
  const m = String(errMsg).toLowerCase();
  if (
    m.includes('not authorised') ||
    m.includes('not authorized') ||
    m.includes('unauthorized')
  ) {
    logger.error(
      'Siteline API rejected this app token (Not Authorised). Create or rotate the API token in Siteline, set SITELINE_API_TOKEN in .env to match what works in Postman, restart the server, and confirm SITELINE_API_URL. If Postman uses a non-Bearer header, set SITELINE_AUTH_HEADER.',
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
