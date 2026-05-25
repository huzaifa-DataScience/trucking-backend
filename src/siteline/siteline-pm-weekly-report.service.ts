import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OutboundEmailService } from '../email/outbound-email.service';
import { SitelineAgingSummary } from '../database/entities';
import { PmWeeklyReportBuilderService } from './pm-weekly-report-builder.service';
import {
  pmWeeklyReportCronExpression,
  sitelinePmEmailCronOptions,
} from './siteline-pm-email-cron.util';

@Injectable()
export class SitelinePmWeeklyReportService {
  private readonly logger = new Logger(SitelinePmWeeklyReportService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly outbound: OutboundEmailService,
    private readonly reportBuilder: PmWeeklyReportBuilderService,
    @InjectRepository(SitelineAgingSummary)
    private readonly agingSummaryRepo: Repository<SitelineAgingSummary>,
  ) {}

  /** Monday 6:00 AM US Eastern — portfolio + Clearstory comparison (Job C). */
  @Cron(pmWeeklyReportCronExpression(), sitelinePmEmailCronOptions())
  async sendWeeklyPmReports(): Promise<void> {
    if (this.config.get<string>('PM_WEEKLY_REPORT_ENABLED', 'false') !== 'true') {
      return;
    }
    await this.runWeeklyReports();
  }

  async runWeeklyReports(): Promise<{ sent: number; failed: number; pms: number }> {
    if (!this.outbound.isConfigured()) {
      this.logger.warn('PM weekly report skipped: outbound email not configured');
      return { sent: 0, failed: 0, pms: 0 };
    }

    const daysThreshold = parseInt(this.config.get<string>('PM_WEEKLY_REPORT_DAYS', '50'), 10);
    const testRecipient = (
      this.config.get<string>('PM_WEEKLY_REPORT_TEST_TO', '') ||
      this.config.get<string>('OVERDUE_EMAIL_TEST_TO', '')
    )
      .trim()
      .toLowerCase();
    const weekStart = this.weekStartIsoDate();
    const weekEnding = new Date().toISOString().slice(0, 10);

    await this.ensureLogTable();

    const byPm = await this.reportBuilder.loadContractsGroupedByPm();
    if (!byPm.size) {
      this.logger.warn(
        'PM weekly report skipped: no Siteline_AgingContracts for entities 1–3 — run aging sync first.',
      );
      return { sent: 0, failed: 0, pms: 0 };
    }

    const alreadySent = await this.getSentPmSet(weekStart);
    let sent = 0;
    let failed = 0;

    for (const [pmEmail, contracts] of byPm.entries()) {
      if (alreadySent.has(`${pmEmail}|${weekStart}`)) continue;

      try {
        const content = await this.reportBuilder.buildPmReportContent(pmEmail, contracts, {
          daysThreshold,
          weekEnding,
        });
        if (!content) {
          this.logger.log(
            `PM weekly report skipped for ${pmEmail}: no AR aging rows and no COR T&M alerts`,
          );
          continue;
        }

        const { provider } = await this.outbound.send({
          to: testRecipient || pmEmail,
          subject: content.subject,
          html: content.html,
        });

        await this.logSent(pmEmail, weekStart);
        sent += 1;
        if (testRecipient) {
          this.logger.warn(
            `PM weekly report TEST via ${provider} → ${testRecipient} (PM ${pmEmail}, ${content.contractCount} rows)`,
          );
        }
      } catch (err: unknown) {
        failed += 1;
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(`PM weekly report failed for ${pmEmail}: ${msg}`);
      }
    }

    this.logger.log(
      `PM weekly report finished. week=${weekStart}, pms=${byPm.size}, sent=${sent}, failed=${failed}`,
    );
    return { sent, failed, pms: byPm.size };
  }

  private weekStartIsoDate(): string {
    const d = new Date();
    const day = d.getUTCDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setUTCDate(d.getUTCDate() + diff);
    return d.toISOString().slice(0, 10);
  }

  private async ensureLogTable(): Promise<void> {
    await this.agingSummaryRepo.query(`
      IF OBJECT_ID('dbo.Siteline_WeeklyPmReportLog', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.Siteline_WeeklyPmReportLog (
          Id bigint IDENTITY(1,1) PRIMARY KEY,
          LeadPmEmail nvarchar(255) NOT NULL,
          WeekStartDate date NOT NULL,
          SentAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME()
        );
        CREATE UNIQUE INDEX UX_Siteline_WeeklyPmReportLog_Email_Week
          ON dbo.Siteline_WeeklyPmReportLog (LeadPmEmail, WeekStartDate);
      END
    `);
  }

  private async getSentPmSet(weekStart: string): Promise<Set<string>> {
    const rows: Array<{ LeadPmEmail: string; WeekStartDate: string }> =
      await this.agingSummaryRepo.query(
        `
        SELECT LeadPmEmail, CONVERT(varchar(10), WeekStartDate, 23) AS WeekStartDate
        FROM dbo.Siteline_WeeklyPmReportLog
        WHERE WeekStartDate = @0
      `,
        [weekStart],
      );
    const set = new Set<string>();
    for (const r of rows) {
      set.add(`${String(r.LeadPmEmail).toLowerCase()}|${r.WeekStartDate}`);
    }
    return set;
  }

  private async logSent(pmEmail: string, weekStart: string): Promise<void> {
    await this.agingSummaryRepo.query(
      `
      MERGE dbo.Siteline_WeeklyPmReportLog AS target
      USING (SELECT @0 AS LeadPmEmail, @1 AS WeekStartDate) AS src
      ON target.LeadPmEmail = src.LeadPmEmail AND target.WeekStartDate = src.WeekStartDate
      WHEN NOT MATCHED THEN INSERT (LeadPmEmail, WeekStartDate) VALUES (src.LeadPmEmail, src.WeekStartDate);
    `,
      [pmEmail.toLowerCase(), weekStart],
    );
  }
}
