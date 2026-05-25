import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmailTemplateService } from '../email/email-template.service';
import { HtmlToPdfService } from '../email/html-to-pdf.service';
import { OutboundEmailService } from '../email/outbound-email.service';
import { SitelineAgingSummary } from '../database/entities';
import { PmWeeklyReportBuilderService } from './pm-weekly-report-builder.service';
import {
  pjWeeklyReportCronExpression,
  sitelinePmEmailCronOptions,
} from './siteline-pm-email-cron.util';

/** Tuesday 6 AM US Eastern — one email to PJ with a PDF per PM (same report PMs get Monday). */
@Injectable()
export class SitelinePjWeeklyReportService {
  private readonly logger = new Logger(SitelinePjWeeklyReportService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly outbound: OutboundEmailService,
    private readonly emailTemplates: EmailTemplateService,
    private readonly htmlToPdf: HtmlToPdfService,
    private readonly reportBuilder: PmWeeklyReportBuilderService,
    @InjectRepository(SitelineAgingSummary)
    private readonly agingSummaryRepo: Repository<SitelineAgingSummary>,
  ) {}

  @Cron(pjWeeklyReportCronExpression(), sitelinePmEmailCronOptions())
  async sendWeeklyPjReportPack(): Promise<void> {
    if (this.config.get<string>('PJ_COR_WEEKLY_REPORT_ENABLED', 'false') !== 'true') {
      return;
    }
    await this.runPjWeeklyReportPack();
  }

  async runPjWeeklyReportPack(): Promise<{
    sent: boolean;
    pmCount: number;
    pdfCount: number;
    skippedPmCount: number;
  }> {
    if (!this.outbound.isConfigured()) {
      this.logger.warn('PJ weekly report pack skipped: outbound email not configured');
      return { sent: false, pmCount: 0, pdfCount: 0, skippedPmCount: 0 };
    }

    const recipient =
      this.config.get<string>('PJ_COR_WEEKLY_REPORT_TEST_TO', '').trim().toLowerCase() ||
      this.config.get<string>('PJ_COR_WEEKLY_REPORT_TO', '').trim().toLowerCase();

    if (!recipient) {
      this.logger.warn(
        'PJ weekly report pack skipped: set PJ_COR_WEEKLY_REPORT_TO or PJ_COR_WEEKLY_REPORT_TEST_TO',
      );
      return { sent: false, pmCount: 0, pdfCount: 0, skippedPmCount: 0 };
    }

    const weekStart = this.weekStartIsoDate();
    await this.ensureLogTable();

    if (await this.alreadySentThisWeek(weekStart)) {
      this.logger.log(`PJ weekly report pack already sent for week ${weekStart}`);
      return { sent: false, pmCount: 0, pdfCount: 0, skippedPmCount: 0 };
    }

    const daysThreshold = parseInt(this.config.get<string>('PM_WEEKLY_REPORT_DAYS', '50'), 10);
    const weekEnding = new Date().toISOString().slice(0, 10);
    const byPm = await this.reportBuilder.loadContractsGroupedByPm();

    if (!byPm.size) {
      this.logger.warn(
        'PJ weekly report pack skipped: no Siteline_AgingContracts for entities 1–3 — run aging sync first.',
      );
      return { sent: false, pmCount: 0, pdfCount: 0, skippedPmCount: 0 };
    }

    const reportContents = [];
    let skippedPmCount = 0;

    for (const [pmEmail, contracts] of byPm.entries()) {
      const content = await this.reportBuilder.buildPmReportContent(pmEmail, contracts, {
        daysThreshold,
        weekEnding,
      });
      if (!content) {
        skippedPmCount += 1;
        continue;
      }
      reportContents.push(content);
    }

    if (!reportContents.length) {
      this.logger.log('PJ weekly report pack skipped: no PM reports with AR or T&M data');
      return { sent: false, pmCount: byPm.size, pdfCount: 0, skippedPmCount };
    }

    const pdfAttachments = await this.htmlToPdf.renderPdfAttachments(
      reportContents.map((r) => ({ html: r.html, filename: r.pdfFilename })),
    );

    const pmListHtml = reportContents
      .map(
        (r) =>
          `<li><strong>${this.escapeHtml(r.leadPmName)}</strong> — ${r.contractCount} contract(s), ${r.pdfFilename}</li>`,
      )
      .join('');

    const { subject, html } = await this.emailTemplates.renderTemplate(
      EmailTemplateService.PJ_COR_WEEKLY_PURPOSE,
      {
        leadPmName: 'PJ',
        weekEnding,
        daysThreshold,
        portfolioCount: reportContents.length,
        approvedCount: reportContents.reduce((s, r) => s + r.contractCount, 0),
        openCount: reportContents.reduce((s, r) => s + r.corDataQualityCount, 0),
        dataQualityCount: reportContents.reduce((s, r) => s + r.corDataQualityCount, 0),
        portfolioTableHtml: '',
        approvedTableHtml: pmListHtml,
        openTableHtml: '',
        dataQualityTableHtml: '',
      },
    );

    try {
      const { provider } = await this.outbound.send({
        to: recipient,
        subject,
        html,
        attachments: pdfAttachments.map((a) => ({
          filename: a.filename,
          content: a.content,
          contentType: a.contentType,
        })),
      });

      await this.logSent(weekStart);
      this.logger.log(
        `PJ weekly report pack sent via ${provider} to ${recipient}: ${pdfAttachments.length} PDF(s) for ${reportContents.length} PM(s)`,
      );
      return {
        sent: true,
        pmCount: byPm.size,
        pdfCount: pdfAttachments.length,
        skippedPmCount,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`PJ weekly report pack send failed: ${msg}`);
      return {
        sent: false,
        pmCount: byPm.size,
        pdfCount: pdfAttachments.length,
        skippedPmCount,
      };
    }
  }

  private escapeHtml(s: string): string {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
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
      IF OBJECT_ID('dbo.Clearstory_PjCorWeeklyReportLog', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.Clearstory_PjCorWeeklyReportLog (
          Id bigint IDENTITY(1,1) PRIMARY KEY,
          LeadPmEmail nvarchar(255) NOT NULL,
          WeekStartDate date NOT NULL,
          SentAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME()
        );
        CREATE UNIQUE INDEX UX_Clearstory_PjCorWeeklyReportLog_Email_Week
          ON dbo.Clearstory_PjCorWeeklyReportLog (LeadPmEmail, WeekStartDate);
      END
    `);
  }

  private async alreadySentThisWeek(weekStart: string): Promise<boolean> {
    const rows: Array<{ n: number }> = await this.agingSummaryRepo.query(
      `SELECT COUNT(1) AS n FROM dbo.Clearstory_PjCorWeeklyReportLog WHERE LeadPmEmail = @0 AND WeekStartDate = @1`,
      ['pj-consolidated', weekStart],
    );
    return (rows[0]?.n ?? 0) > 0;
  }

  private async logSent(weekStart: string): Promise<void> {
    await this.agingSummaryRepo.query(
      `
      MERGE dbo.Clearstory_PjCorWeeklyReportLog AS target
      USING (SELECT @0 AS LeadPmEmail, @1 AS WeekStartDate) AS src
      ON target.LeadPmEmail = src.LeadPmEmail AND target.WeekStartDate = src.WeekStartDate
      WHEN NOT MATCHED THEN INSERT (LeadPmEmail, WeekStartDate) VALUES (src.LeadPmEmail, src.WeekStartDate);
    `,
      ['pj-consolidated', weekStart],
    );
  }
}
