import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as nodemailer from 'nodemailer';
import { EmailTemplateService } from '../email/email-template.service';
import { ClearstoryCorDataQualityService } from './clearstory-cor-data-quality.service';
import { PmWeeklyPortfolioScopeService } from './pm-weekly-portfolio-scope.service';
import { ClearstoryCor } from '../database/entities';
import {
  buildCorDataQualityAlertSectionHtml,
  corLogBucket,
  mapCorToLogRow,
  sortCorLogRows,
  type CorLogRow,
} from './clearstory-cor-log.util';

function corInJobScope(cor: ClearstoryCor, portfolioJobs: Set<string>): boolean {
  const job = cor.jobNumber?.trim().toLowerCase();
  return Boolean(job && portfolioJobs.has(job));
}

/** PJ weekly pack: COR log tables scoped to the same jobs as PM weekly emails (no PM AR portfolio table). */
@Injectable()
export class ClearstoryPjCorWeeklyReportService {
  private readonly logger = new Logger(ClearstoryPjCorWeeklyReportService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly emailTemplates: EmailTemplateService,
    private readonly corDataQuality: ClearstoryCorDataQualityService,
    private readonly portfolioScope: PmWeeklyPortfolioScopeService,
    @InjectRepository(ClearstoryCor)
    private readonly cors: Repository<ClearstoryCor>,
  ) {}

  @Cron(process.env.PJ_COR_WEEKLY_REPORT_CRON || '0 30 8 * * 1')
  async sendWeeklyCorReports(): Promise<void> {
    if (this.config.get<string>('PJ_COR_WEEKLY_REPORT_ENABLED', 'false') !== 'true') {
      return;
    }
    await this.runWeeklyCorReports();
  }

  async runWeeklyCorReports(): Promise<{
    sent: boolean;
    portfolioCount: number;
    approvedCoIssuedCount: number;
    approvedToProceedCount: number;
    dataQualityCount: number;
  }> {
    const smtp = this.readSmtp();
    if (!smtp) {
      this.logger.warn('PJ COR weekly report skipped: SMTP not configured');
      return {
        sent: false,
        portfolioCount: 0,
        approvedCoIssuedCount: 0,
        approvedToProceedCount: 0,
        dataQualityCount: 0,
      };
    }

    const recipient =
      this.config.get<string>('PJ_COR_WEEKLY_REPORT_TEST_TO', '').trim().toLowerCase() ||
      this.config.get<string>('PJ_COR_WEEKLY_REPORT_TO', '').trim().toLowerCase();

    if (!recipient) {
      this.logger.warn('PJ COR weekly report skipped: set PJ_COR_WEEKLY_REPORT_TO or PJ_COR_WEEKLY_REPORT_TEST_TO');
      return {
        sent: false,
        portfolioCount: 0,
        approvedCoIssuedCount: 0,
        approvedToProceedCount: 0,
        dataQualityCount: 0,
      };
    }

    const weekStart = this.weekStartIsoDate();
    await this.ensureLogTable();

    if (await this.alreadySentThisWeek(weekStart)) {
      this.logger.log(`PJ COR weekly report already sent for week ${weekStart}`);
      return {
        sent: false,
        portfolioCount: 0,
        approvedCoIssuedCount: 0,
        approvedToProceedCount: 0,
        dataQualityCount: 0,
      };
    }

    const daysThreshold = parseInt(
      this.config.get<string>('PM_WEEKLY_REPORT_DAYS', '50'),
      10,
    );
    const portfolioJobs = await this.portfolioScope.jobNumbersForPjCorReport();
    if (!portfolioJobs.size) {
      this.logger.warn('PJ COR weekly report skipped: no PM weekly portfolio jobs on latest aging snapshot');
      return {
        sent: false,
        portfolioCount: 0,
        approvedCoIssuedCount: 0,
        approvedToProceedCount: 0,
        dataQualityCount: 0,
      };
    }

    const dataQualityRows = (await this.corDataQuality.allAlertRows()).filter((r) => {
      const job = r.jobNumber?.trim().toLowerCase();
      return Boolean(job && portfolioJobs.has(job));
    });

    const allCors = await this.cors.find();

    const approvedCoIssued: CorLogRow[] = [];
    const approvedToProceed: CorLogRow[] = [];

    for (const cor of allCors) {
      if (!corInJobScope(cor, portfolioJobs)) continue;

      const bucket = corLogBucket(cor.status);
      if (!bucket) continue;

      const row = mapCorToLogRow(cor, false);
      if (bucket === 'approved_co_issued') approvedCoIssued.push(row);
      else approvedToProceed.push(row);
    }

    const coIssuedRows = sortCorLogRows(approvedCoIssued);
    const atpRows = sortCorLogRows(approvedToProceed);
    const dataQualityTableHtml = buildCorDataQualityAlertSectionHtml(
      dataQualityRows,
      (s) => this.escapeHtml(s),
    );

    const weekEnding = new Date().toISOString().slice(0, 10);
    const approvedTableHtml = this.buildCorTableHtml(
      'Approved CO Issued',
      coIssuedRows,
      true,
    );
    const atpTableHtml = this.buildCorTableHtml('Approved To Proceed', atpRows, true);

    try {
      const { subject, html } = await this.emailTemplates.renderTemplate(
        EmailTemplateService.PJ_COR_WEEKLY_PURPOSE,
        {
          leadPmName: 'PJ',
          weekEnding,
          daysThreshold,
          portfolioCount: portfolioJobs.size,
          approvedCount: coIssuedRows.length,
          openCount: atpRows.length,
          dataQualityCount: dataQualityRows.length,
          portfolioTableHtml: '',
          approvedTableHtml,
          openTableHtml: atpTableHtml,
          dataQualityTableHtml,
        },
      );

      const transporter = nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.port === 465,
        auth: { user: smtp.user, pass: smtp.pass },
      });

      await transporter.sendMail({
        from: smtp.from,
        to: recipient,
        subject,
        html,
      });

      await this.logSent(weekStart);
      this.logger.log(
        `PJ weekly sent to ${recipient}: scoped_jobs=${portfolioJobs.size}, approved_co_issued=${coIssuedRows.length}, approved_to_proceed=${atpRows.length}, data_quality=${dataQualityRows.length}`,
      );
      return {
        sent: true,
        portfolioCount: portfolioJobs.size,
        approvedCoIssuedCount: coIssuedRows.length,
        approvedToProceedCount: atpRows.length,
        dataQualityCount: dataQualityRows.length,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`PJ COR weekly send failed: ${msg}`);
      return {
        sent: false,
        portfolioCount: portfolioJobs.size,
        approvedCoIssuedCount: coIssuedRows.length,
        approvedToProceedCount: atpRows.length,
        dataQualityCount: dataQualityRows.length,
      };
    }
  }

  private buildCorTableHtml(title: string, rows: CorLogRow[], showTotals: boolean): string {
    const fmt = (n: number | null) =>
      n == null ? '' : `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const body = rows
      .map(
        (r) => `
        <tr>
          <td>${this.escapeHtml(r.corNumber)}</td>
          <td>${this.escapeHtml(r.corDate)}</td>
          <td>${this.escapeHtml(r.tmTagNumber)}</td>
          <td>${this.escapeHtml(r.customerCoNumber)}</td>
          <td>${this.escapeHtml(r.customerReferenceNumber)}</td>
          <td>${this.escapeHtml(r.jobNumber)}</td>
          <td>${this.escapeHtml(r.title)}</td>
          <td style="text-align:right">${fmt(r.requestedAmount)}</td>
          <td style="text-align:right">${fmt(r.approvedCoIssuedAmount)}</td>
          <td style="text-align:right">${r.daysInReview ?? ''}</td>
          <td>${this.escapeHtml(r.status)}</td>
          <td>${this.escapeHtml(r.stage)}</td>
          <td>${this.escapeHtml(r.responsibleParty)}</td>
        </tr>`,
      )
      .join('');

    let totalsRow = '';
    if (showTotals && rows.length) {
      const sumReq = rows.reduce((s, r) => s + (r.requestedAmount ?? 0), 0);
      const sumAppr = rows.reduce((s, r) => s + (r.approvedCoIssuedAmount ?? 0), 0);
      totalsRow = `
        <tr style="font-weight:bold;background:#f3f4f6;">
          <td colspan="7">Total</td>
          <td style="text-align:right">${fmt(sumReq)}</td>
          <td style="text-align:right">${fmt(sumAppr)}</td>
          <td colspan="4"></td>
        </tr>`;
    }

    return `
      <h3 style="font-family:Arial,sans-serif;margin:18px 0 8px;">${this.escapeHtml(title)}</h3>
      <div style="overflow-x:auto;-webkit-overflow-scrolling:touch;width:100%;margin:0 0 16px;">
      <table border="1" cellpadding="5" cellspacing="0" style="border-collapse:collapse;font-size:12px;min-width:1200px;">
        <thead>
          <tr style="background:#f3f4f6;">
            <th>COR Number</th>
            <th>COR Date</th>
            <th>TM Tag Number</th>
            <th>Customer CO Number</th>
            <th>Customer Reference Number</th>
            <th>My Job Number</th>
            <th>COR Title</th>
            <th>Requested Amount</th>
            <th>Approved CO Issued Amount</th>
            <th>Days in Review</th>
            <th>Status</th>
            <th>Stage</th>
            <th>Responsible Party</th>
          </tr>
        </thead>
        <tbody>${body}${totalsRow}</tbody>
      </table>
      </div>`;
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

  private readSmtp(): { host: string; port: number; user: string; pass: string; from: string } | null {
    const host = this.config.get<string>('SMTP_HOST', '').trim();
    const port = parseInt(this.config.get<string>('SMTP_PORT', '587'), 10);
    const user = this.config.get<string>('SMTP_USER', '').trim();
    const pass = this.config.get<string>('SMTP_PASS', '').trim().replace(/^"|"$/g, '');
    const from = this.config.get<string>('OVERDUE_EMAIL_FROM', user || '').trim();
    if (!host || !user || !pass || !from) return null;
    return { host, port, user, pass, from };
  }

  private async ensureLogTable(): Promise<void> {
    await this.cors.query(`
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
    const rows: Array<{ n: number }> = await this.cors.query(
      `SELECT COUNT(1) AS n FROM dbo.Clearstory_PjCorWeeklyReportLog WHERE LeadPmEmail = @0 AND WeekStartDate = @1`,
      ['pj-consolidated', weekStart],
    );
    return (rows[0]?.n ?? 0) > 0;
  }

  private async logSent(weekStart: string): Promise<void> {
    await this.cors.query(
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
