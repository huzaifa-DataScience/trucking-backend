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
   * Cron job: runs every 10 minutes.
   * Temporarily disabled.
   */
  // @Cron('*/10 * * * *')
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
              lastSyncedAt: new Date(),
            });
            await this.contractRepo.save(contractEntity);
          } catch (dbErr: any) {
            this.logger.error(
              `Siteline sync: DB error saving contract ${c.id}: ${dbErr?.message ?? dbErr}. Skipping contract.`,
            );
            continue;
          }

          // Fetch full contract detail to get all pay apps for this contract
          const detail = (await this.siteline.getContract(c.id)) as any;
          const payApps: any[] = detail?.payApps ?? [];

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

      this.logger.log(
        `Siteline sync finished. Total contracts processed this run: ${totalContracts}.`,
      );
    } catch (err: any) {
      this.logger.error(
        `Siteline sync failed (will retry next run): ${err?.message ?? err}`,
      );
    }
  }
}

