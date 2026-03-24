import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SitelineService } from './siteline.service';
import { SitelineContract, SitelinePayApp } from '../database/entities';

/**
 * Periodically pulls billing data from Siteline.
 * For now this only logs what it would sync; later we can upsert into SQL Server tables.
 */
@Injectable()
export class SitelineSyncService {
  private readonly logger = new Logger(SitelineSyncService.name);

  constructor(
    private readonly siteline: SitelineService,
    @InjectRepository(SitelineContract)
    private readonly contractRepo: Repository<SitelineContract>,
    @InjectRepository(SitelinePayApp)
    private readonly payAppRepo: Repository<SitelinePayApp>,
  ) {}

  /**
   * Cron job: runs periodically to sync Siteline data from Siteline's API
   * into our local SQL tables.
   * Configured to run every 5 minutes.
   * TEMP: scheduling disabled — uncomment the line below to resume automatic sync.
   */
  // @Cron('0 */5 * * * *')
  async syncHourly(): Promise<void> {
    if (!this.siteline.isConfigured()) {
      this.logger.warn('Siteline sync skipped: API not configured');
      return;
    }

    this.logger.log('Starting Siteline sync (all paginated contracts, no month/status filter)...');

    let cursor: string | undefined;
    let totalContracts = 0;

    try {
      do {
        const result = (await this.siteline.getPaginatedContracts({
          limit: 100,
          cursor,
        })) as any;

        const page = result?.paginatedContracts ?? result;
        const contracts: any[] = page?.contracts ?? [];
        cursor = page?.hasNext ? page.cursor : undefined;

        this.logger.log(
          `Siteline sync page: fetched ${contracts.length} contracts (cursor=${cursor ?? 'end'})`,
        );

        for (const c of contracts) {
          if (!c?.id) continue;
          totalContracts += 1;

          // Fetch full contract detail to get PM info and all pay apps for this contract
          const detail = (await this.siteline.getContract(c.id)) as any;
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
              `Siteline sync: DB error saving contract ${c.id}: ${dbErr?.message ?? dbErr}. Skipping contract.`,
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
                `Siteline sync: DB error saving pay app ${pa.id}: ${paErr?.message ?? paErr}. Skipping.`,
              );
            }
          }
        }
      } while (cursor);

      // After syncing contracts/pay apps, refresh lead PM info using agingDashboard
      try {
        const today = new Date();
        const endDate = today.toISOString().slice(0, 10); // YYYY-MM-DD
        const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
        const startDate = start.toISOString().slice(0, 10);

        const aging: any = await this.siteline.getAgingDashboard({
          companyId: null,
          startDate,
          endDate,
        });
        const contractsFromAging: any[] = aging?.contracts ?? [];

        // Log full agingDashboard payload (trimmed a bit) so we can see exactly what Siteline returns.
        this.logger.log(
          `Siteline agingDashboard raw: ${JSON.stringify(
            {
              summary: aging?.payAppAgingSummary ?? null,
              firstContracts: (contractsFromAging || []).slice(0, 5),
            },
          )}`,
        );

        for (const entry of contractsFromAging) {
          const contract = entry?.contract;
          if (!contract?.id) continue;
          const primaryPm = contract.leadPMs?.[0];
          const first = primaryPm?.firstName ?? '';
          const last = primaryPm?.lastName ?? '';
          const fullName = `${first} ${last}`.trim() || null;
          const email = primaryPm?.email ?? null;
          await this.contractRepo.update(
            { id: contract.id },
            { leadPmName: fullName, leadPmEmail: email },
          );
        }

        this.logger.log(
          `Siteline sync finished. Total contracts processed this run: ${totalContracts}. Lead PMs refreshed for ${contractsFromAging.length} aging contracts.`,
        );
      } catch (pmErr: any) {
        this.logger.warn(
          `Siteline sync: failed to refresh lead PMs from agingDashboard: ${
            pmErr?.message ?? pmErr
          }`,
        );
        this.logger.log(
          `Siteline sync finished. Total contracts processed this run: ${totalContracts}.`,
        );
      }
    } catch (err: any) {
      this.logger.error(
        `Siteline sync failed (will retry next run): ${err?.message ?? err}`,
      );
    }
  }
}

