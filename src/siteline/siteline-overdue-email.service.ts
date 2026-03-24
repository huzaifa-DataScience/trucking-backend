import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as nodemailer from 'nodemailer';
import { SitelinePayApp } from '../database/entities';
import { EmailTemplateService } from '../email/email-template.service';

type OverdueRow = {
  payAppId: string;
  contractId: string;
  projectName: string | null;
  projectNumber: string | null;
  internalProjectNumber: string | null;
  invoiceNumber: number | null;
  dueDate: Date;
  daysPastDue: number;
  netDollars: number;
  leadPmName: string | null;
  leadPmEmail: string;
};

@Injectable()
export class SitelineOverdueEmailService {
  private readonly logger = new Logger(SitelineOverdueEmailService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly emailTemplates: EmailTemplateService,
    @InjectRepository(SitelinePayApp)
    private readonly payAppRepo: Repository<SitelinePayApp>,
  ) {}

  // TEMP: scheduling disabled — uncomment the line below to resume overdue emails every 5 min.
  // @Cron('0 */5 * * * *')
  async sendOverdueEmails(): Promise<void> {
    if (this.config.get<string>('OVERDUE_EMAIL_ENABLED', 'false') !== 'true') {
      return;
    }

    const smtpHost = this.config.get<string>('SMTP_HOST', '').trim();
    const smtpPort = parseInt(this.config.get<string>('SMTP_PORT', '587'), 10);
    const smtpUser = this.config.get<string>('SMTP_USER', '').trim();
    const smtpPass = this.config.get<string>('SMTP_PASS', '').trim();
    const fromEmail = this.config.get<string>('OVERDUE_EMAIL_FROM', smtpUser || '').trim();
    const daysThreshold = parseInt(this.config.get<string>('OVERDUE_EMAIL_DAYS', '50'), 10);

    if (!smtpHost || !smtpUser || !smtpPass || !fromEmail) {
      this.logger.warn(
        'Overdue email job skipped: set SMTP_HOST, SMTP_USER, SMTP_PASS, OVERDUE_EMAIL_FROM, and OVERDUE_EMAIL_ENABLED=true',
      );
      return;
    }

    await this.ensureNotificationLogTable();

    const overdue = await this.getOverdueRows(daysThreshold);
    if (!overdue.length) {
      this.logger.log(`Overdue email job: no rows past ${daysThreshold} days.`);
      return;
    }

    const todaysNotified = await this.getNotifiedTodaySet();
    const pending = overdue.filter((r) => !todaysNotified.has(this.keyForToday(r.payAppId, r.leadPmEmail)));
    if (!pending.length) {
      this.logger.log('Overdue email job: all overdue rows already notified today.');
      return;
    }

    const grouped = new Map<string, OverdueRow[]>();
    for (const row of pending) {
      const list = grouped.get(row.leadPmEmail) ?? [];
      list.push(row);
      grouped.set(row.leadPmEmail, list);
    }

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: smtpUser, pass: smtpPass },
    });

    let sent = 0;
    let failed = 0;
    for (const [email, items] of grouped.entries()) {
      const name = items.find((i) => i.leadPmName)?.leadPmName ?? 'PM';
      const itemsTableHtml = this.buildItemsTableHtml(items);
      const { subject, html } = await this.emailTemplates.renderSitelineOverdueEmail({
        leadPmName: name,
        daysThreshold,
        itemCount: items.length,
        itemsTableHtml,
      });

      try {
        await transporter.sendMail({
          from: fromEmail,
          to: email,
          subject,
          html,
        });

        await this.logSentNotifications(items);
        sent += 1;
      } catch (err: any) {
        failed += 1;
        this.logger.error(`Overdue email send failed for ${email}: ${err?.message ?? err}`);
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

  private buildItemsTableHtml(items: OverdueRow[]): string {
    const htmlRows = items
      .map(
        (i) => `
            <tr>
              <td>${this.escapeHtml(i.projectName)}</td>
              <td>${this.escapeHtml(i.internalProjectNumber)}</td>
              <td>${i.invoiceNumber ?? ''}</td>
              <td>${i.dueDate.toISOString().slice(0, 10)}</td>
              <td>${i.daysPastDue}</td>
              <td>$${i.netDollars.toLocaleString()}</td>
            </tr>`,
      )
      .join('');
    return `
        <table border="1" cellpadding="6" cellspacing="0" style="border-collapse: collapse;">
          <thead>
            <tr>
              <th>Project</th>
              <th>Internal Project #</th>
              <th>Invoice #</th>
              <th>Due Date</th>
              <th>Days Past Due</th>
              <th>Net Dollars</th>
            </tr>
          </thead>
          <tbody>${htmlRows}</tbody>
        </table>`;
  }

  private async getOverdueRows(daysThreshold: number): Promise<OverdueRow[]> {
    const payApps = await this.payAppRepo.find({ relations: ['contract'] });
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const rows: OverdueRow[] = [];
    for (const pa of payApps) {
      if (pa.status === 'PAID' || pa.status === 'DRAFT') continue;
      const contract = pa.contract as any;
      if (!contract) continue;
      if (!contract.leadPmEmail) continue;
      if (!pa.dueDate) continue;

      const dueDate = new Date(pa.dueDate);
      const daysPastDue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
      if (daysPastDue <= daysThreshold) continue;

      const billed = Number(pa.billed ?? 0);
      const retention = Number(pa.retention ?? 0);
      const netDollars = (billed - retention) / 100;
      if (netDollars <= 0) continue;

      rows.push({
        payAppId: pa.id,
        contractId: contract.id,
        projectName: contract.projectName ?? null,
        projectNumber: contract.projectNumber ?? null,
        internalProjectNumber: contract.internalProjectNumber ?? null,
        invoiceNumber: pa.number ?? null,
        dueDate,
        daysPastDue,
        netDollars,
        leadPmName: contract.leadPmName ?? null,
        leadPmEmail: contract.leadPmEmail,
      });
    }
    return rows;
  }

  private keyForToday(payAppId: string, leadPmEmail: string): string {
    const day = new Date().toISOString().slice(0, 10);
    return `${payAppId}|${leadPmEmail.toLowerCase()}|${day}`;
  }

  private async ensureNotificationLogTable(): Promise<void> {
    await this.payAppRepo.query(`
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
      await this.payAppRepo.query(`
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

  private async logSentNotifications(items: OverdueRow[]): Promise<void> {
    for (const item of items) {
      const payAppId = item.payAppId.replace(/'/g, "''");
      const leadPmEmail = item.leadPmEmail.replace(/'/g, "''");
      await this.payAppRepo.query(
        `
        MERGE dbo.Siteline_OverdueEmailLog AS target
        USING (
          SELECT '${payAppId}' AS PayAppId, '${leadPmEmail}' AS LeadPmEmail, CONVERT(date, SYSUTCDATETIME()) AS NotificationDate
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

