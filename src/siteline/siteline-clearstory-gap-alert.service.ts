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
   * Manual trigger (admin) + cron. Sends one digest per entity with gaps to ops recipient.
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

    let totalGaps = 0;
    let emailsSent = 0;

    for (const entityId of SITELINE_ENTITY_IDS) {
      const { items, evaluatedAt, entityName } = await this.gapsService.findGaps(entityId);
      if (!items.length) continue;

      totalGaps += items.length;
      const gapsTableHtml = this.buildGapsTableHtml(items);
      const { subject, html } = await this.emailTemplates.renderSitelineClearstoryDataGapEmail({
        gapCount: items.length,
        runAt: evaluatedAt,
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
        emailsSent += 1;
        this.logger.log(
          `Clearstory gap alert sent via ${provider} for ${entityName} (${items.length} project(s)) → ${recipients.to}`,
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(`Clearstory gap alert failed for entity ${entityId}: ${msg}`);
        return {
          ok: false,
          message: `Send failed for ${entityName}: ${msg}`,
          gapCount: totalGaps,
        };
      }
    }

    if (totalGaps === 0) {
      return {
        ok: true,
        message: 'No Siteline/Clearstory gaps found for entities 1–3.',
        gapCount: 0,
      };
    }

    return {
      ok: true,
      message: `Gap alert finished. ${totalGaps} gap row(s); ${emailsSent} email(s) sent.`,
      gapCount: totalGaps,
    };
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

  private buildGapsTableHtml(items: SitelineReconciliationGapItem[]): string {
    const reasonLabel: Record<string, string> = {
      NO_CLEARSTORY_PROJECT: 'No Clearstory project',
      CLEARSTORY_EMPTY: 'Clearstory empty',
      NOT_COMPARABLE: 'No job number',
    };
    const rows = items
      .map(
        (i) => `
        <tr>
          <td>${this.escapeHtml(i.projectName)}</td>
          <td>${this.escapeHtml(i.internalProjectNumber ?? i.projectNumber)}</td>
          <td>${this.escapeHtml(i.leadPmName)}</td>
          <td>$${i.netDollars.toLocaleString()}</td>
          <td>${this.escapeHtml(reasonLabel[i.gapReason] ?? i.gapReason)}</td>
          <td>${this.escapeHtml(i.matchKeyTried)}</td>
        </tr>`,
      )
      .join('');
    return `
      <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;margin-top:12px;">
        <thead>
          <tr>
            <th>Project</th>
            <th>Job #</th>
            <th>Lead PM</th>
            <th>Net AR</th>
            <th>Issue</th>
            <th>Match tried</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;
  }
}
