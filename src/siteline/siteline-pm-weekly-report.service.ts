import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as nodemailer from 'nodemailer';
import { EmailTemplateService } from '../email/email-template.service';
import { ClearstoryContractComparisonService } from '../clearstory/clearstory-contract-comparison.service';
import { ClearstoryCorDataQualityService } from '../clearstory/clearstory-cor-data-quality.service';
import {
  buildCorDataQualityAlertSectionHtml,
  type CorLogRow,
} from '../clearstory/clearstory-cor-log.util';
import { SitelineAgingContract, SitelineAgingSummary } from '../database/entities';
import {
  agingCentsToDollars,
  overdueCentsFromAgingContract,
  totalAgedCentsFromAgingContract,
} from './siteline-aging-overdue.util';
import { resolveLeadPmEmailFromFullName } from './siteline-pm-email.util';

type PmReportRow = {
  projectName: string;
  jobNumber: string;
  overdueDollars: number;
  totalAgedDollars: number;
  clearstoryDollars: number | null;
  sitelineDollars: number | null;
  difference: number | null;
  comparisonStatus: string;
  /** Count of CORs on this job with Status In Review + TmTagNumbers set. */
  corTmIssueCount: number;
};

@Injectable()
export class SitelinePmWeeklyReportService {
  private readonly logger = new Logger(SitelinePmWeeklyReportService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly emailTemplates: EmailTemplateService,
    private readonly contractComparison: ClearstoryContractComparisonService,
    private readonly corDataQuality: ClearstoryCorDataQualityService,
    @InjectRepository(SitelineAgingSummary)
    private readonly agingSummaryRepo: Repository<SitelineAgingSummary>,
    @InjectRepository(SitelineAgingContract)
    private readonly agingContractRepo: Repository<SitelineAgingContract>,
  ) {}

  /** Weekly: one email per PM with AR aging + Clearstory vs Siteline contract totals. */
  @Cron(process.env.PM_WEEKLY_REPORT_CRON || '0 0 8 * * 1')
  async sendWeeklyPmReports(): Promise<void> {
    if (this.config.get<string>('PM_WEEKLY_REPORT_ENABLED', 'false') !== 'true') {
      return;
    }
    await this.runWeeklyReports();
  }

  async runWeeklyReports(): Promise<{ sent: number; failed: number; pms: number }> {
    const smtp = this.readSmtp();
    if (!smtp) {
      this.logger.warn('PM weekly report skipped: SMTP not configured');
      return { sent: 0, failed: 0, pms: 0 };
    }

    const daysThreshold = parseInt(this.config.get<string>('PM_WEEKLY_REPORT_DAYS', '50'), 10);
    const testRecipient = this.config.get<string>('PM_WEEKLY_REPORT_TEST_TO', '').trim().toLowerCase();
    const weekStart = this.weekStartIsoDate();

    await this.ensureLogTable();

    const latest = await this.latestAgingSummary();
    if (!latest) {
      this.logger.warn('PM weekly report skipped: no Siteline_AgingSummary snapshot');
      return { sent: 0, failed: 0, pms: 0 };
    }

    const agingRows = await this.agingContractRepo.find({ where: { snapshotId: latest.id } });
    const byPm = new Map<string, SitelineAgingContract[]>();

    for (const row of agingRows) {
      const email = resolveLeadPmEmailFromFullName(row.leadPmEmail, row.leadPmName);
      if (!email) continue;
      const list = byPm.get(email) ?? [];
      list.push(row);
      byPm.set(email, list);
    }

    if (!byPm.size) {
      this.logger.log('PM weekly report: no PM emails on latest aging snapshot');
      return { sent: 0, failed: 0, pms: 0 };
    }

    const alreadySent = await this.getSentPmSet(weekStart);
    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.port === 465,
      auth: { user: smtp.user, pass: smtp.pass },
    });

    const weekEnding = new Date().toISOString().slice(0, 10);
    let sent = 0;
    let failed = 0;

    for (const [pmEmail, contracts] of byPm.entries()) {
      if (alreadySent.has(`${pmEmail}|${weekStart}`)) continue;

      const corAlertRows = await this.corDataQuality.alertRowsForPm(pmEmail);
      const corTmIssuesByJob = this.corTmIssueCountByJob(corAlertRows);
      const reportRows = await this.buildRowsForPm(contracts, daysThreshold, corTmIssuesByJob);
      if (!reportRows.length) continue;

      const leadPmName = contracts.find((c) => c.leadPmName)?.leadPmName ?? 'PM';
      const reportTableHtml = this.buildReportTableHtml(reportRows, daysThreshold);
      const corDataQualityTableHtml = buildCorDataQualityAlertSectionHtml(corAlertRows, (s) =>
        this.escapeHtml(s),
      );

      try {
        const { subject, html } = await this.emailTemplates.renderTemplate(
          EmailTemplateService.SITELINE_PM_WEEKLY_PURPOSE,
          {
          leadPmName,
          weekEnding,
          daysThreshold,
          contractCount: reportRows.length,
          corDataQualityCount: corAlertRows.length,
            reportTableHtml,
            corDataQualityTableHtml,
          },
        );

        await transporter.sendMail({
          from: smtp.from,
          to: testRecipient || pmEmail,
          subject,
          html,
        });

        await this.logSent(pmEmail, weekStart);
        sent += 1;
        if (testRecipient) {
          this.logger.warn(`PM weekly report TEST → ${testRecipient} (PM ${pmEmail}, ${reportRows.length} rows)`);
        }
      } catch (err: any) {
        failed += 1;
        this.logger.error(`PM weekly report failed for ${pmEmail}: ${err?.message ?? err}`);
      }
    }

    this.logger.log(
      `PM weekly report finished. week=${weekStart}, pms=${byPm.size}, sent=${sent}, failed=${failed}`,
    );
    return { sent, failed, pms: byPm.size };
  }

  private corTmIssueCountByJob(corAlertRows: CorLogRow[]): Map<string, number> {
    const map = new Map<string, number>();
    for (const row of corAlertRows) {
      const job = row.jobNumber?.trim().toLowerCase();
      if (!job || job === '—') continue;
      map.set(job, (map.get(job) ?? 0) + 1);
    }
    return map;
  }

  private async buildRowsForPm(
    contracts: SitelineAgingContract[],
    daysThreshold: number,
    corTmIssuesByJob: Map<string, number>,
  ): Promise<PmReportRow[]> {
    const rows: PmReportRow[] = [];

    for (const ac of contracts) {
      const jobNumber = ac.internalProjectNumber?.trim() || ac.projectNumber?.trim() || '';
      const overdueCents = overdueCentsFromAgingContract(ac, daysThreshold);
      const totalCents = totalAgedCentsFromAgingContract(ac);

      let clearstoryDollars: number | null = null;
      let sitelineDollars: number | null = null;
      let difference: number | null = null;
      let comparisonStatus = 'no_job_number';

      if (jobNumber) {
        const cmp = await this.contractComparison.getByJobNumber(jobNumber);
        if (cmp) {
          clearstoryDollars = cmp.clearstory.approvedToProceedAndCoIssuedContractValue;
          sitelineDollars = cmp.siteline.latestTotalValue;
          difference = cmp.comparison.difference;
          comparisonStatus = cmp.comparison.status;
        } else {
          comparisonStatus = 'missing_clearstory';
        }
      }

      const projectName =
        ac.projectName?.trim() || jobNumber || ac.contractId;

      const jobKey = jobNumber.toLowerCase();
      rows.push({
        projectName,
        jobNumber: jobNumber || '—',
        overdueDollars: agingCentsToDollars(overdueCents),
        totalAgedDollars: agingCentsToDollars(totalCents),
        clearstoryDollars,
        sitelineDollars,
        difference,
        comparisonStatus,
        corTmIssueCount: jobKey ? (corTmIssuesByJob.get(jobKey) ?? 0) : 0,
      });
    }

    rows.sort((a, b) => b.overdueDollars - a.overdueDollars);
    return rows;
  }

  private buildReportTableHtml(rows: PmReportRow[], daysThreshold: number): string {
    const fmt = (n: number | null) =>
      n == null ? '—' : `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

    const body = rows
      .map(
        (r) => `
        <tr>
          <td>${this.escapeHtml(r.projectName)}</td>
          <td>${this.escapeHtml(r.jobNumber)}</td>
          <td>${fmt(r.overdueDollars)}</td>
          <td>${fmt(r.totalAgedDollars)}</td>
          <td>${fmt(r.clearstoryDollars)}</td>
          <td>${fmt(r.sitelineDollars)}</td>
          <td>${fmt(r.difference)}</td>
          <td>${this.escapeHtml(r.comparisonStatus)}</td>
          <td style="${r.corTmIssueCount > 0 ? 'color:#b91c1c;font-weight:bold;' : ''}">${
            r.corTmIssueCount > 0 ? String(r.corTmIssueCount) : '—'
          }</td>
        </tr>`,
      )
      .join('');

    return `
      <p style="font-size:12px;color:#6b7280;margin:0 0 8px;">Scroll horizontally if columns are cut off on mobile.</p>
      <div style="overflow-x:auto;-webkit-overflow-scrolling:touch;width:100%;margin:0 0 16px;">
      <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-size:13px;min-width:1040px;">
        <thead>
          <tr style="background:#f3f4f6;">
            <th>Project</th>
            <th>Job #</th>
            <th>Overdue AR (&gt;${daysThreshold}d)</th>
            <th>Total AR</th>
            <th>Clearstory bill</th>
            <th>Siteline bill</th>
            <th>Difference</th>
            <th>Compare</th>
            <th>COR TM issues</th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
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

  private async latestAgingSummary(): Promise<SitelineAgingSummary | null> {
    const rows = await this.agingSummaryRepo.find({ order: { id: 'DESC' }, take: 1 });
    return rows[0] ?? null;
  }

  private weekStartIsoDate(): string {
    const d = new Date();
    const day = d.getUTCDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setUTCDate(d.getUTCDate() + diff);
    return d.toISOString().slice(0, 10);
  }

  private readSmtp(): {
    host: string;
    port: number;
    user: string;
    pass: string;
    from: string;
  } | null {
    const host = this.config.get<string>('SMTP_HOST', '').trim();
    const port = parseInt(this.config.get<string>('SMTP_PORT', '587'), 10);
    const user = this.config.get<string>('SMTP_USER', '').trim();
    const pass = this.config.get<string>('SMTP_PASS', '').trim().replace(/^"|"$/g, '');
    const from = this.config.get<string>('OVERDUE_EMAIL_FROM', user || '').trim();
    if (!host || !user || !pass || !from) return null;
    return { host, port, user, pass, from };
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
      await this.agingSummaryRepo.query(`
        SELECT LeadPmEmail, CONVERT(varchar(10), WeekStartDate, 23) AS WeekStartDate
        FROM dbo.Siteline_WeeklyPmReportLog
        WHERE WeekStartDate = @0
      `, [weekStart]);
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
