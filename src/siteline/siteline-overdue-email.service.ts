import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppSettingsService } from '../app-settings/app-settings.service';
import { OutboundEmailService } from '../email/outbound-email.service';
import { SitelineAgingContract, SitelineAgingSummary } from '../database/entities';
import { EmailTemplateService } from '../email/email-template.service';
import {
  agingCentsToDollars,
  overdueCentsFromAgingContract,
  totalAgedCentsFromAgingContract,
} from './siteline-aging-overdue.util';
import { loadAgingContractsFromLatestPerEntitySnapshots } from './siteline-aging-snapshot.util';
import { resolveLeadPmEmailFromFullName } from './siteline-pm-email.util';

type OverdueRow = {
  /** Contract id — stored in Siteline_OverdueEmailLog.PayAppId for dedupe. */
  contractId: string;
  projectName: string | null;
  projectNumber: string | null;
  internalProjectNumber: string | null;
  overdueDollars: number;
  totalAgedDollars: number;
  averageDaysToPaid: number | null;
  leadPmName: string | null;
  leadPmEmail: string;
};

@Injectable()
export class SitelineOverdueEmailService {
  private readonly logger = new Logger(SitelineOverdueEmailService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly appSettings: AppSettingsService,
    private readonly emailTemplates: EmailTemplateService,
    private readonly outbound: OutboundEmailService,
    @InjectRepository(SitelineAgingSummary)
    private readonly agingSummaryRepo: Repository<SitelineAgingSummary>,
    @InjectRepository(SitelineAgingContract)
    private readonly agingContractRepo: Repository<SitelineAgingContract>,
  ) {}

  /**
   * Legacy overdue-only digest. No cron — use Monday PM weekly report instead.
   * Manual: `npm run run-overdue-email` (requires OVERDUE_EMAIL_ENABLED=true).
   */
  async sendOverdueEmails(): Promise<void> {
    if (this.config.get<string>('OVERDUE_EMAIL_ENABLED', 'false') !== 'true') {
      return;
    }
    if (!(await this.appSettings.getOverdueEmailSendingEnabled())) {
      return;
    }

    if (!this.outbound.isConfigured()) {
      this.logger.warn(
        'Overdue email job skipped: configure Resend (RESEND_API_KEY) or SMTP (SMTP_HOST, SMTP_USER, SMTP_PASS, OVERDUE_EMAIL_FROM)',
      );
      return;
    }

    const daysThreshold = parseInt(this.config.get<string>('OVERDUE_EMAIL_DAYS', '50'), 10);
    const testRecipient = this.config.get<string>('OVERDUE_EMAIL_TEST_TO', '').trim().toLowerCase();

    await this.ensureNotificationLogTable();

    const overdue = await this.getOverdueRowsFromAgingContracts(daysThreshold);
    if (!overdue.length) {
      this.logger.log(
        `Overdue email job: no contracts with AR past ${daysThreshold} days in latest Siteline_AgingContracts snapshot.`,
      );
      return;
    }

    const todaysNotified = await this.getNotifiedTodaySet();
    const pending = overdue.filter(
      (r) => !todaysNotified.has(this.keyForToday(r.contractId, testRecipient || r.leadPmEmail)),
    );
    if (!pending.length) {
      this.logger.log('Overdue email job: all overdue rows already notified today.');
      return;
    }
    if (testRecipient) {
      this.logger.warn(
        `Overdue email TEST override active: redirecting all PM emails to ${testRecipient}.`,
      );
    }

    const grouped = new Map<string, OverdueRow[]>();
    for (const row of pending) {
      const list = grouped.get(row.leadPmEmail) ?? [];
      list.push(row);
      grouped.set(row.leadPmEmail, list);
    }

    let sent = 0;
    let failed = 0;
    for (const [pmEmail, items] of grouped.entries()) {
      const name = items.find((i) => i.leadPmName)?.leadPmName ?? 'PM';
      const itemsTableHtml = this.buildItemsTableHtml(items, daysThreshold);
      const { subject, html } = await this.emailTemplates.renderSitelineOverdueEmail({
        leadPmName: name,
        daysThreshold,
        itemCount: items.length,
        itemsTableHtml,
      });
      const recipientEmail = testRecipient || pmEmail;

      try {
        await this.outbound.send({
          to: recipientEmail,
          subject,
          html,
        });

        await this.logSentNotifications(items, recipientEmail);
        sent += 1;
      } catch (err: unknown) {
        failed += 1;
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(`Overdue email send failed for ${recipientEmail}: ${msg}`);
      }
    }

    this.logger.log(`Overdue email job finished. sent=${sent}, failed=${failed}, rows=${pending.length}`);
  }

  private escapeHtml(s: string | null | undefined): string {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private buildItemsTableHtml(items: OverdueRow[], daysThreshold: number): string {
    const htmlRows = items
      .map(
        (i) => `
            <tr>
              <td>${this.escapeHtml(i.projectName)}</td>
              <td>${this.escapeHtml(i.internalProjectNumber)}</td>
              <td>$${i.overdueDollars.toLocaleString()}</td>
              <td>$${i.totalAgedDollars.toLocaleString()}</td>
              <td>${i.averageDaysToPaid != null ? i.averageDaysToPaid.toFixed(1) : '—'}</td>
            </tr>`,
      )
      .join('');
    return `
        <table border="1" cellpadding="6" cellspacing="0" style="border-collapse: collapse;">
          <thead>
            <tr>
              <th>Project</th>
              <th>Internal Project #</th>
              <th>Overdue AR (&gt;${daysThreshold} days)</th>
              <th>Total AR</th>
              <th>Avg days to paid</th>
            </tr>
          </thead>
          <tbody>${htmlRows}</tbody>
        </table>`;
  }

  /** Latest per-entity snapshots (GOEL + GOEL DC + DCB); same basis as `GET /siteline/aging-overdue`. */
  private async getOverdueRowsFromAgingContracts(
    daysThreshold: number,
  ): Promise<OverdueRow[]> {
    const contracts = await loadAgingContractsFromLatestPerEntitySnapshots(
      this.agingSummaryRepo,
      this.agingContractRepo,
    );
    if (!contracts.length) {
      this.logger.warn(
        'Overdue email job: no Siteline_AgingContracts rows for entities 1–3 — run aging sync first.',
      );
      return [];
    }

    const rows: OverdueRow[] = [];
    for (const row of contracts) {
      const leadPmEmail = resolveLeadPmEmailFromFullName(row.leadPmEmail, row.leadPmName);
      if (!leadPmEmail) continue;

      const overdueCents = overdueCentsFromAgingContract(row, daysThreshold);
      if (overdueCents <= 0) continue;

      const totalCents = totalAgedCentsFromAgingContract(row);
      const avgRaw = row.averageDaysToPaid;
      const averageDaysToPaid =
        avgRaw != null && String(avgRaw).trim() !== '' && Number.isFinite(Number(avgRaw))
          ? Number(avgRaw)
          : null;

      rows.push({
        contractId: row.contractId,
        projectName: row.projectName ?? null,
        projectNumber: row.projectNumber ?? null,
        internalProjectNumber: row.internalProjectNumber ?? null,
        overdueDollars: agingCentsToDollars(overdueCents),
        totalAgedDollars: agingCentsToDollars(totalCents),
        averageDaysToPaid,
        leadPmName: row.leadPmName ?? null,
        leadPmEmail,
      });
    }
    return rows;
  }

  private keyForToday(contractId: string, recipientEmail: string): string {
    const day = new Date().toISOString().slice(0, 10);
    return `${contractId}|${recipientEmail.toLowerCase()}|${day}`;
  }

  private async ensureNotificationLogTable(): Promise<void> {
    await this.agingSummaryRepo.query(`
      IF OBJECT_ID('dbo.Siteline_OverdueEmailLog', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.Siteline_OverdueEmailLog (
          Id bigint IDENTITY(1,1) PRIMARY KEY,
          PayAppId nvarchar(50) NOT NULL,
          LeadPmEmail nvarchar(255) NOT NULL,
          NotificationDate date NOT NULL,
          SentAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME()
        );
        CREATE UNIQUE INDEX UX_Siteline_OverdueEmailLog_PayApp_Lead_Date
          ON dbo.Siteline_OverdueEmailLog (PayAppId, LeadPmEmail, NotificationDate);
      END
    `);
  }

  private async getNotifiedTodaySet(): Promise<Set<string>> {
    const rows: Array<{ PayAppId: string; LeadPmEmail: string; NotificationDate: string }> =
      await this.agingSummaryRepo.query(`
        SELECT PayAppId, LeadPmEmail, CONVERT(varchar(10), NotificationDate, 23) AS NotificationDate
        FROM dbo.Siteline_OverdueEmailLog
        WHERE NotificationDate = CONVERT(date, SYSUTCDATETIME())
      `);

    const set = new Set<string>();
    for (const r of rows) {
      set.add(`${r.PayAppId}|${String(r.LeadPmEmail).toLowerCase()}|${r.NotificationDate}`);
    }
    return set;
  }

  private async logSentNotifications(items: OverdueRow[], recipientEmail: string): Promise<void> {
    for (const item of items) {
      const contractId = item.contractId.replace(/'/g, "''");
      const loggedRecipient = recipientEmail.replace(/'/g, "''");
      await this.agingSummaryRepo.query(
        `
        MERGE dbo.Siteline_OverdueEmailLog AS target
        USING (
          SELECT '${contractId}' AS PayAppId, '${loggedRecipient}' AS LeadPmEmail, CONVERT(date, SYSUTCDATETIME()) AS NotificationDate
        ) AS src
        ON target.PayAppId = src.PayAppId
          AND target.LeadPmEmail = src.LeadPmEmail
          AND target.NotificationDate = src.NotificationDate
        WHEN NOT MATCHED THEN
          INSERT (PayAppId, LeadPmEmail, NotificationDate)
          VALUES (src.PayAppId, src.LeadPmEmail, src.NotificationDate);
        `,
      );
    }
  }
}
