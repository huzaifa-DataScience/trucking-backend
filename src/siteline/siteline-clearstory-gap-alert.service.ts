import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { AppSettingsService } from '../app-settings/app-settings.service';
import { EmailTemplateService } from '../email/email-template.service';
import { OutboundEmailService } from '../email/outbound-email.service';
import {
  SitelineReconciliationGapItem,
  SitelineReconciliationGapsService,
} from './siteline-reconciliation-gaps.service';
import { SITELINE_ENTITY_IDS } from './siteline-entity-config.service';

@Injectable()
export class SitelineClearstoryGapAlertService {
  private readonly logger = new Logger(SitelineClearstoryGapAlertService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly appSettings: AppSettingsService,
    private readonly emailTemplates: EmailTemplateService,
    private readonly outbound: OutboundEmailService,
    private readonly gapsService: SitelineReconciliationGapsService,
  ) {}

  /** Weekdays 08:15 UTC — after typical Siteline/Clearstory sync windows. */
  @Cron('0 15 8 * * 1-5')
  async sendGapAlertCron(): Promise<void> {
    await this.runGapAlertJob();
  }

  /**
   * Manual trigger (admin) + cron. One combined email for all companies with gaps.
   */
  async runGapAlertJob(): Promise<{ ok: boolean; message: string; gapCount: number }> {
    const status = await this.appSettings.getSitelineClearstoryGapAlertStatus();
    if (!status.effectiveEnabled) {
      return {
        ok: true,
        message: 'Gap alert skipped (env master or admin toggle off).',
        gapCount: 0,
      };
    }

    if (!this.outbound.isConfigured()) {
      return {
        ok: false,
        message: 'Outbound email not configured (Resend or SMTP).',
        gapCount: 0,
      };
    }

    const sections: Array<{ entityName: string; items: SitelineReconciliationGapItem[] }> = [];
    for (const entityId of SITELINE_ENTITY_IDS) {
      const { items, entityName } = await this.gapsService.findGaps(entityId);
      if (items.length) sections.push({ entityName, items });
    }

    const totalGaps = sections.reduce((n, s) => n + s.items.length, 0);
    if (totalGaps === 0) {
      return {
        ok: true,
        message: 'No Siteline/Clearstory gaps found for entities 1–3.',
        gapCount: 0,
      };
    }

    const entityName = sections.map((s) => s.entityName).join(', ');
    const gapsTableHtml = this.buildCombinedGapsTableHtml(sections);
    const { subject, html } = await this.emailTemplates.renderSitelineClearstoryDataGapEmail({
      gapCount: totalGaps,
      entityName,
      gapsTableHtml,
      dashboardUrl: this.config.get<string>('APP_DASHBOARD_URL', '').trim(),
    });

    const recipients = this.resolveRecipients(status.recipientTo);
    try {
      const { provider } = await this.outbound.send({
        to: recipients.to,
        cc: recipients.cc,
        subject,
        html,
      });
      this.logger.log(
        `Clearstory gap alert sent via ${provider} (${totalGaps} project(s), ${sections.length} companies) → ${recipients.to}`,
      );
      return {
        ok: true,
        message: `Gap alert finished. ${totalGaps} project(s) in 1 email.`,
        gapCount: totalGaps,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Clearstory gap alert send failed: ${msg}`);
      return { ok: false, message: `Send failed: ${msg}`, gapCount: totalGaps };
    }
  }

  private resolveRecipients(primary: string): { to: string; cc?: string } {
    const cc = this.config.get<string>('SITELINE_CLEARSTORY_GAP_ALERT_CC', '').trim();
    return cc ? { to: primary, cc } : { to: primary };
  }

  private escapeHtml(s: string | null | undefined): string {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private gapReasonLabel(gapReason: string): string {
    const reasonLabel: Record<string, string> = {
      NO_CLEARSTORY_PROJECT: 'Missing in Clearstory',
      CLEARSTORY_EMPTY: 'No COR data in Clearstory',
      NOT_COMPARABLE: 'No job number in Siteline',
    };
    return reasonLabel[gapReason] ?? gapReason;
  }

  private buildCombinedGapsTableHtml(
    sections: Array<{ entityName: string; items: SitelineReconciliationGapItem[] }>,
  ): string {
    const rows = sections
      .flatMap(({ entityName, items }) =>
        items.map(
          (i) => `
        <tr>
          <td>${this.escapeHtml(entityName)}</td>
          <td>${this.escapeHtml(i.projectName)}</td>
          <td>${this.escapeHtml(i.internalProjectNumber ?? i.projectNumber)}</td>
          <td>${this.escapeHtml(i.leadPmName)}</td>
          <td>${this.escapeHtml(this.gapReasonLabel(i.gapReason))}</td>
        </tr>`,
        ),
      )
      .join('');
    return `
      <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;margin-top:12px;font-size:13px;width:100%;">
        <thead>
          <tr style="background:#f3f4f6;">
            <th>Company</th>
            <th>Project</th>
            <th>Job #</th>
            <th>Lead PM</th>
            <th>Issue</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;
  }
}
