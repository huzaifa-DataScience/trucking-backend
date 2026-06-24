import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppEmailTemplate } from '../database/entities';

const REPORT_ISSUE_FOOTER_HTML = `<p style="font-size:12px;color:#6b7280;margin-top:20px;border-top:1px solid #e5e7eb;padding-top:14px;">If you find any issue with this report, please contact the technical team.</p>`;

/**
 * Admin-editable, DB-backed email templates.
 *
 * Best practice pattern:
 * - Store templates with a technical identifier (`TemplateKey`)
 * - Store a runtime selector key (`Purpose`)
 * - Allow multiple templates per Purpose but only one Active per Purpose
 * - Use `{{placeholder}}` variables replaced at render time
 */
@Injectable()
export class EmailTemplateService implements OnModuleInit {
  private readonly logger = new Logger(EmailTemplateService.name);

  constructor(
    @InjectRepository(AppEmailTemplate)
    private readonly repo: Repository<AppEmailTemplate>,
  ) {}

  // Legacy key used earlier for Siteline overdue; kept for backward compatibility.
  static readonly SITELINE_OVERDUE_TEMPLATE_KEY = 'siteline_overdue';

  // Runtime selector key used by the cron email job.
  static readonly SITELINE_OVERDUE_PURPOSE = 'siteline.overdue_leadpm';

  /** Weekly PM digest: AR aging + Clearstory vs Siteline contract totals. */
  static readonly SITELINE_PM_WEEKLY_PURPOSE = 'siteline.pm_weekly_report';

  /** Weekly PM COR logs: approved table + open CORs (Clearstory). */
  static readonly PJ_COR_WEEKLY_PURPOSE = 'clearstory.pj_cor_weekly_report';

  /** Ops alert: Siteline AR/billing with no Clearstory project to compare. */
  static readonly SITELINE_CLEARSTORY_DATA_GAP_PURPOSE = 'siteline.clearstory_data_gap';

  // Runtime selector key for OTP emails (when/if wired by backend auth flows).
  static readonly AUTH_OTP_PURPOSE = 'auth.otp';

  private static readonly PURPOSE_PLACEHOLDERS: Record<string, string[]> = {
    [EmailTemplateService.SITELINE_OVERDUE_PURPOSE]: [
      '{{leadPmName}}',
      '{{daysThreshold}}',
      '{{itemCount}}',
      '{{itemsTableHtml}}',
    ],
    [EmailTemplateService.SITELINE_PM_WEEKLY_PURPOSE]: [
      '{{leadPmName}}',
      '{{weekEnding}}',
      '{{daysThreshold}}',
      '{{contractCount}}',
      '{{corDataQualityCount}}',
      '{{reportTableHtml}}',
      '{{corDataQualityTableHtml}}',
    ],
    [EmailTemplateService.PJ_COR_WEEKLY_PURPOSE]: [
      '{{leadPmName}}',
      '{{weekEnding}}',
      '{{daysThreshold}}',
      '{{portfolioCount}}',
      '{{approvedCount}}',
      '{{openCount}}',
      '{{dataQualityCount}}',
      '{{portfolioTableHtml}}',
      '{{approvedTableHtml}}',
      '{{openTableHtml}}',
      '{{dataQualityTableHtml}}',
    ],
    [EmailTemplateService.AUTH_OTP_PURPOSE]: [
      '{{appName}}',
      '{{otpCode}}',
      '{{expiresMinutes}}',
    ],
    [EmailTemplateService.SITELINE_CLEARSTORY_DATA_GAP_PURPOSE]: [
      '{{gapCount}}',
      '{{entityName}}',
      '{{gapsTableHtml}}',
      '{{dashboardUrl}}',
      '{{emailSubject}}',
      '{{summaryHtml}}',
      '{{headerTitle}}',
      '{{footerHtml}}',
    ],
  };

  private static readonly DEFAULTS_BY_PURPOSE: Record<
    string,
    { name: string; subject: string; html: string }
  > = {
    [EmailTemplateService.SITELINE_OVERDUE_PURPOSE]: {
      name: 'Siteline overdue lead PM (default)',
      subject: 'Action needed — {{leadPmName}}: {{itemCount}} overdue pay app(s) (> {{daysThreshold}} days)',
      html: `<!-- Best-practice HTML email: table layout + inline styles -->\n<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"background:#f3f4f6; margin:0; padding:0; width:100%;\">\n  <tr>\n    <td align=\"center\" style=\"padding:24px 12px;\">\n      <table role=\"presentation\" width=\"600\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"width:600px; max-width:600px; background:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 2px 10px rgba(0,0,0,0.06);\">\n        <tr>\n          <td style=\"padding:22px 24px; background:#0f172a; color:#ffffff; font-family:Arial,Helvetica,sans-serif;\">\n            <div style=\"font-size:16px; line-height:22px; font-weight:700;\">Trucking Dashboard</div>\n            <div style=\"font-size:12px; line-height:18px; opacity:0.85;\">Automated AR alert</div>\n          </td>\n        </tr>\n        <tr>\n          <td style=\"padding:24px; font-family:Arial,Helvetica,sans-serif; color:#111827;\">\n            <div style=\"font-size:16px; line-height:24px; margin:0 0 12px 0;\">Hi <strong>{{leadPmName}}</strong>,</div>\n            <div style=\"font-size:14px; line-height:22px; margin:0 0 14px 0; color:#374151;\">\n              The following pay app item(s) are now <strong>over {{daysThreshold}} days past due</strong>.\n            </div>\n            <div style=\"margin:16px 0; padding:14px 16px; border:1px solid #e5e7eb; border-radius:10px; background:#f9fafb;\">\n              <div style=\"font-size:13px; line-height:20px; color:#111827;\">\n                <strong>Summary</strong>\n              </div>\n              <div style=\"font-size:13px; line-height:20px; color:#374151; margin-top:6px;\">\n                Items: <strong>{{itemCount}}</strong>\n              </div>\n            </div>\n\n            <div style=\"font-size:13px; line-height:20px; color:#111827; margin:0 0 8px 0;\"><strong>Details</strong></div>\n            <div style=\"font-size:13px; line-height:20px; color:#374151; margin:0 0 12px 0;\">\n              (Table may render best on desktop email clients.)\n            </div>\n            {{itemsTableHtml}}\n\n            <div style=\"margin-top:18px; font-size:12px; line-height:18px; color:#6b7280;\">\n              If this email reached you in error, please ignore it.\n            </div>\n          </td>\n        </tr>\n        <tr>\n          <td style=\"padding:16px 24px; background:#f3f4f6; font-family:Arial,Helvetica,sans-serif; color:#6b7280; font-size:12px; line-height:18px;\">\n            Sent automatically by Trucking Dashboard.\n          </td>\n        </tr>\n      </table>\n    </td>\n  </tr>\n</table>`,
    },
    [EmailTemplateService.SITELINE_PM_WEEKLY_PURPOSE]: {
      name: 'Siteline PM weekly report (default)',
      subject: 'Weekly project report — {{leadPmName}} — {{contractCount}} contract(s) (week of {{weekEnding}})',
      html: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f4f6;">
  <tr><td align="center" style="padding:24px 12px;">
    <table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" style="max-width:640px;background:#fff;border-radius:12px;">
      <tr><td style="padding:22px 24px;background:#0f172a;color:#fff;font-family:Arial,sans-serif;">
        <div style="font-size:16px;font-weight:700;">Weekly PM report</div>
        <div style="font-size:12px;opacity:0.85;">Clearstory vs Siteline issues + T&amp;M alerts</div>
      </td></tr>
      <tr><td style="padding:24px;font-family:Arial,sans-serif;color:#111827;">
        <div style="font-size:16px;margin:0 0 12px;">Hi <strong>{{leadPmName}}</strong>,</div>
        <div style="font-size:14px;color:#374151;margin:0 0 14px;">
          Week ending <strong>{{weekEnding}}</strong>: projects below need attention (Clearstory vs Siteline mismatch or missing data). Matched projects are omitted. COR / T&amp;M alerts follow.
        </div>
        <div style="font-size:13px;margin:0 0 10px;"><strong>{{contractCount}}</strong> contract(s)</div>
        {{reportTableHtml}}
        {{corDataQualityTableHtml}}
        ${REPORT_ISSUE_FOOTER_HTML}
      </td></tr>
    </table>
  </td></tr>
</table>`,
    },
    [EmailTemplateService.PJ_COR_WEEKLY_PURPOSE]: {
      name: 'PJ weekly PM report pack (default)',
      subject: 'PJ weekly PM reports — {{portfolioCount}} PM(s) — week of {{weekEnding}}',
      html: `<table role="presentation" width="100%" style="background:#f3f4f6;font-family:Arial,sans-serif;">
  <tr><td style="padding:24px 12px;">
    <table role="presentation" width="640" style="max-width:640px;background:#fff;border-radius:12px;">
      <tr><td style="padding:20px 24px;background:#0f172a;color:#fff;">
        <div style="font-size:16px;font-weight:700;">PJ weekly PM report pack</div>
        <div style="font-size:12px;opacity:0.85;">Updated Tuesday snapshot — one PDF per PM (same report PMs receive Monday)</div>
      </td></tr>
      <tr><td style="padding:24px;color:#111827;">
        <p>Hi <strong>{{leadPmName}}</strong>,</p>
        <p>Week ending <strong>{{weekEnding}}</strong>. Attached are <strong>{{portfolioCount}}</strong> PDF report(s) — the same weekly PM report (AR aging, Clearstory comparison, T&amp;M alerts).</p>
        <p style="font-size:13px;color:#374151;margin:0 0 12px;">PMs had until this send to update Clearstory/Siteline; these PDFs reflect the latest synced data.</p>
        <ul style="font-size:13px;line-height:1.6;padding-left:20px;">{{approvedTableHtml}}</ul>
        ${REPORT_ISSUE_FOOTER_HTML}
      </td></tr>
    </table>
  </td></tr>
</table>`,
    },
    [EmailTemplateService.SITELINE_CLEARSTORY_DATA_GAP_PURPOSE]: {
      name: 'Siteline / Clearstory data gap (default)',
      subject: '{{emailSubject}}',
      html: `<table role="presentation" width="100%" style="background:#f3f4f6;font-family:Arial,sans-serif;">
  <tr><td style="padding:24px 12px;">
    <table role="presentation" width="640" style="max-width:640px;background:#fff;border-radius:12px;">
      <tr><td style="padding:20px 24px;background:#7c2d12;color:#fff;">
        <div style="font-size:16px;font-weight:700;">{{headerTitle}}</div>
        <div style="font-size:12px;opacity:0.9;">Siteline billing alert — {{entityName}}</div>
      </td></tr>
      <tr><td style="padding:24px;color:#111827;font-size:14px;line-height:1.5;">
        <p>Hi,</p>
        {{summaryHtml}}
        {{gapsTableHtml}}
        {{footerHtml}}
      </td></tr>
    </table>
  </td></tr>
</table>`,
    },
    [EmailTemplateService.AUTH_OTP_PURPOSE]: {
      name: 'OTP (default)',
      subject: '{{appName}} verification code: {{otpCode}}',
      html: `<!-- Best-practice OTP email: centered code + clear instructions -->\n<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"background:#f3f4f6; margin:0; padding:0; width:100%;\">\n  <tr>\n    <td align=\"center\" style=\"padding:24px 12px;\">\n      <table role=\"presentation\" width=\"600\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"width:600px; max-width:600px; background:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 2px 10px rgba(0,0,0,0.06);\">\n        <tr>\n          <td style=\"padding:22px 24px; background:#111827; color:#ffffff; font-family:Arial,Helvetica,sans-serif;\">\n            <div style=\"font-size:16px; line-height:22px; font-weight:700;\">{{appName}}</div>\n            <div style=\"font-size:12px; line-height:18px; opacity:0.85;\">Security verification</div>\n          </td>\n        </tr>\n        <tr>\n          <td style=\"padding:24px; font-family:Arial,Helvetica,sans-serif; color:#111827;\">\n            <div style=\"font-size:16px; line-height:24px; margin:0 0 10px 0;\"><strong>Your verification code</strong></div>\n            <div style=\"font-size:14px; line-height:22px; margin:0 0 16px 0; color:#374151;\">\n              Enter this code to continue. This code expires in <strong>{{expiresMinutes}} minutes</strong>.\n            </div>\n\n            <div style=\"text-align:center; margin:18px 0 8px 0;\">\n              <div style=\"display:inline-block; padding:14px 18px; border:1px solid #e5e7eb; border-radius:12px; background:#f9fafb; font-size:26px; letter-spacing:6px; font-weight:700; color:#111827;\">\n                {{otpCode}}\n              </div>\n            </div>\n\n            <div style=\"font-size:13px; line-height:20px; margin:14px 0 0 0; color:#6b7280;\">\n              If you didn’t request this code, you can safely ignore this email.\n            </div>\n          </td>\n        </tr>\n        <tr>\n          <td style=\"padding:16px 24px; background:#f3f4f6; font-family:Arial,Helvetica,sans-serif; color:#6b7280; font-size:12px; line-height:18px;\">\n            This is an automated message. Please do not reply.\n          </td>\n        </tr>\n      </table>\n    </td>\n  </tr>\n</table>`,
    },
  };

  async onModuleInit(): Promise<void> {
    await this.ensureTable();
    await this.ensureDefaultTemplates();
    await this.refreshPmWeeklyTemplateIntro();
    await this.refreshClearstoryGapTemplate();
    await this.refreshReportIssueFooters();
  }

  /**
   * Admin listing for debugging/management.
   * If purpose is not provided, returns all templates.
   */
  async listTemplates(purpose?: string): Promise<AppEmailTemplate[]> {
    await this.ensureTable();
    const where = purpose ? { purpose } : {};
    return this.repo.find({ where });
  }

  async listKnownPurposes(): Promise<string[]> {
    await this.ensureTable();
    // Prefer purposes we know about in code (placeholders/context).
    // This keeps the frontend from showing templates for events that aren't wired yet.
    return Object.keys(EmailTemplateService.PURPOSE_PLACEHOLDERS);
  }

  async getActiveTemplateByPurpose(purpose: string): Promise<{
    templateKey: string;
    purpose: string;
    name: string | null;
    subjectTemplate: string;
    bodyHtmlTemplate: string;
    isActive: boolean;
    activatedAt: Date | null;
    updatedAt: Date;
    placeholders: string[];
  }> {
    await this.ensureDefaultTemplates();
    const row = await this.repo.findOne({
      where: { purpose, isActive: true as any },
      order: { updatedAt: 'DESC' },
    });
    if (!row) throw new Error(`No active template for purpose: ${purpose}`);

    return {
      templateKey: row.templateKey,
      purpose: row.purpose,
      name: row.name ?? null,
      subjectTemplate: row.subjectTemplate,
      bodyHtmlTemplate: row.bodyHtmlTemplate,
      isActive: Boolean(row.isActive),
      activatedAt: row.activatedAt ?? null,
      updatedAt: row.updatedAt,
      placeholders: EmailTemplateService.PURPOSE_PLACEHOLDERS[purpose] ?? [],
    };
  }

  async updateActiveTemplateByPurpose(
    purpose: string,
    input: { subjectTemplate?: string; bodyHtmlTemplate?: string; name?: string },
  ): Promise<void> {
    await this.ensureDefaultTemplates();
    const active = await this.repo.findOne({
      where: { purpose, isActive: true as any },
      order: { updatedAt: 'DESC' },
    });
    if (!active) throw new Error(`No active template for purpose: ${purpose}`);

    const now = new Date();
    if (input.subjectTemplate !== undefined) {
      active.subjectTemplate = input.subjectTemplate.trim().slice(0, 500);
    }
    if (input.bodyHtmlTemplate !== undefined) {
      active.bodyHtmlTemplate = input.bodyHtmlTemplate.trim();
    }
    if (input.name !== undefined) {
      active.name = input.name.trim() || null;
    }
    active.updatedAt = now;
    await this.repo.save(active);
  }

  async createTemplate(input: {
    templateKey: string;
    purpose: string;
    name?: string | null;
    subjectTemplate: string;
    bodyHtmlTemplate: string;
    isActive?: boolean;
  }): Promise<AppEmailTemplate> {
    await this.ensureTable();
    const now = new Date();
    const template = this.repo.create({
      templateKey: input.templateKey.trim(),
      purpose: input.purpose.trim(),
      name: input.name?.trim() ?? null,
      subjectTemplate: input.subjectTemplate.trim().slice(0, 500),
      bodyHtmlTemplate: input.bodyHtmlTemplate.trim(),
      isActive: input.isActive ?? false,
      activatedAt: input.isActive ? now : null,
      updatedAt: now,
    });

    await this.repo.save(template);
    if (template.isActive) {
      await this.activateTemplateForPurpose(template.templateKey, template.purpose);
    }
    return template;
  }

  async updateTemplate(
    templateKey: string,
    input: {
      purpose?: string;
      name?: string | null;
      subjectTemplate?: string;
      bodyHtmlTemplate?: string;
      isActive?: boolean;
    },
  ): Promise<void> {
    await this.ensureTable();
    const existing = await this.repo.findOne({ where: { templateKey } });
    if (!existing) throw new Error(`Template not found: ${templateKey}`);

    const now = new Date();
    const nextPurpose = input.purpose?.trim() ?? existing.purpose;
    const nextIsActive = input.isActive ?? existing.isActive;

    existing.purpose = nextPurpose;
    existing.name = input.name?.trim() ?? existing.name;
    if (input.subjectTemplate !== undefined) existing.subjectTemplate = input.subjectTemplate.trim().slice(0, 500);
    if (input.bodyHtmlTemplate !== undefined) existing.bodyHtmlTemplate = input.bodyHtmlTemplate.trim();
    existing.isActive = nextIsActive;
    existing.activatedAt = nextIsActive ? now : existing.activatedAt;
    existing.updatedAt = now;

    await this.repo.save(existing);

    // If admin turned it active: enforce single active per purpose
    if (nextIsActive) {
      await this.activateTemplateForPurpose(existing.templateKey, nextPurpose);
    }
  }

  async activateTemplate(templateKey: string): Promise<void> {
    await this.ensureTable();
    const existing = await this.repo.findOne({ where: { templateKey } });
    if (!existing) throw new Error(`Template not found: ${templateKey}`);
    await this.activateTemplateForPurpose(templateKey, existing.purpose);
  }

  async deleteTemplate(templateKey: string): Promise<void> {
    await this.ensureTable();
    await this.repo.delete({ templateKey });
  }

  /**
   * Generic render for any Purpose.
   * Template placeholders are `{{someKey}}`.
   */
  async renderTemplate(
    purpose: string,
    context: Record<string, string | number | null | undefined>,
  ): Promise<{ subject: string; html: string }> {
    await this.ensureDefaultTemplates();
    await this.repairActiveTemplatePlaceholders(purpose);
    const row = await this.repo.findOne({
      where: { purpose, isActive: true as any },
      order: { updatedAt: 'DESC' },
    });

    if (!row) {
      const d = EmailTemplateService.DEFAULTS_BY_PURPOSE[purpose];
      if (d) {
        return {
          subject: this.applyPlaceholders(d.subject, context),
          html: this.appendReportIssueFooter(
            purpose,
            this.applyPlaceholders(d.html, context),
          ),
        };
      }
      throw new Error(`No active email template for purpose: ${purpose}`);
    }

    let html = this.applyPlaceholders(row.bodyHtmlTemplate, context);
    html = this.ensureInjectedTableBlocks(purpose, html, context);
    html = this.appendReportIssueFooter(purpose, html);

    return {
      subject: this.applyPlaceholders(row.subjectTemplate, context),
      html,
    };
  }

  /** PM / PJ weekly reports: standard footer for data issues. */
  private appendReportIssueFooter(purpose: string, html: string): string {
    const reportPurposes = [
      EmailTemplateService.SITELINE_PM_WEEKLY_PURPOSE,
      EmailTemplateService.PJ_COR_WEEKLY_PURPOSE,
    ];
    if (!reportPurposes.includes(purpose)) return html;
    if (/contact the technical team/i.test(html)) return html;
    const close = /(\s*<\/td><\/tr>\s*<\/table>\s*<\/td><\/tr>\s*<\/table>\s*)$/i;
    if (close.test(html)) {
      return html.replace(close, `${REPORT_ISSUE_FOOTER_HTML}$1`);
    }
    return `${html}${REPORT_ISSUE_FOOTER_HTML}`;
  }

  // ---- Backward-compatible helpers used by the Siteline overdue job ----

  async getSitelineOverdueForAdmin(): Promise<{
    templateKey: string;
    subjectTemplate: string;
    bodyHtmlTemplate: string;
    updatedAt: string;
  }> {
    const row = await this.repo.findOne({
      where: { purpose: EmailTemplateService.SITELINE_OVERDUE_PURPOSE, isActive: true as any },
      order: { updatedAt: 'DESC' },
    });
    if (!row) throw new Error('Siteline overdue active template missing');
    return {
      templateKey: row.templateKey,
      subjectTemplate: row.subjectTemplate,
      bodyHtmlTemplate: row.bodyHtmlTemplate,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async updateSitelineOverdue(subjectTemplate: string, bodyHtmlTemplate: string): Promise<void> {
    // Keep legacy method signature: update the active template for the siteline overdue purpose.
    const active = await this.repo.findOne({
      where: { purpose: EmailTemplateService.SITELINE_OVERDUE_PURPOSE, isActive: true as any },
      order: { updatedAt: 'DESC' },
    });
    if (!active) {
      await this.ensureDefaultTemplates();
      return this.updateSitelineOverdue(subjectTemplate, bodyHtmlTemplate);
    }
    await this.updateTemplate(active.templateKey, { subjectTemplate, bodyHtmlTemplate, isActive: true });
  }

  async renderSitelineOverdueEmail(params: {
    leadPmName: string;
    daysThreshold: number;
    itemCount: number;
    itemsTableHtml: string;
  }): Promise<{ subject: string; html: string }> {
    return this.renderTemplate(EmailTemplateService.SITELINE_OVERDUE_PURPOSE, {
      leadPmName: params.leadPmName,
      daysThreshold: params.daysThreshold,
      itemCount: params.itemCount,
      itemsTableHtml: params.itemsTableHtml,
    });
  }

  async renderSitelineClearstoryDataGapEmail(params: {
    gapCount: number;
    entityName: string;
    gapsTableHtml: string;
    dashboardUrl?: string;
  }): Promise<{ subject: string; html: string }> {
    const allClear = params.gapCount === 0;
    const emailSubject = allClear
      ? 'Siteline/Clearstory — all clear (no gaps)'
      : `${params.gapCount} project(s) need Clearstory — all companies`;
    const headerTitle = allClear
      ? 'Siteline / Clearstory daily check'
      : 'Projects missing in Clearstory';
    const summaryHtml = allClear
      ? `<p style="margin:0 0 12px;padding:14px 16px;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;color:#065f46;"><strong>All clear.</strong> Every open Siteline billing project has a matching Clearstory project. Nothing needs attention today.</p>`
      : `<p>These projects have <strong>open billing in Siteline</strong>, but we could not find a matching project in Clearstory (or Clearstory has no COR data yet).</p>
        <p style="margin:12px 0;"><strong>Total projects:</strong> ${params.gapCount}</p>`;
    const gapsTableHtml = allClear ? '' : params.gapsTableHtml;
    const footerHtml = allClear
      ? ''
      : '<p style="font-size:12px;color:#6b7280;margin-top:16px;">Please add or fix the project in Clearstory, or confirm the job number matches Siteline.</p>';

    return this.renderTemplate(EmailTemplateService.SITELINE_CLEARSTORY_DATA_GAP_PURPOSE, {
      gapCount: params.gapCount,
      entityName: params.entityName,
      gapsTableHtml,
      dashboardUrl: params.dashboardUrl ?? '',
      emailSubject,
      summaryHtml,
      headerTitle,
      footerHtml,
    });
  }

  // ---- Internal helpers ----

  private applyPlaceholders(
    template: string,
    context: Record<string, string | number | null | undefined>,
  ): string {
    // Replace {{key}} placeholders. Unknown placeholders become ''.
    return template.replace(/\{\{(\w+)\}\}/g, (_match: string, key: string) => {
      const v = context[key];
      if (v === undefined || v === null) return '';
      return String(v);
    });
  }

  /** Patch active DB templates when new placeholders were added in code defaults. */
  private async repairActiveTemplatePlaceholders(purpose: string): Promise<void> {
    const d = EmailTemplateService.DEFAULTS_BY_PURPOSE[purpose];
    if (!d) return;

    const row = await this.repo.findOne({
      where: { purpose, isActive: true as any },
      order: { updatedAt: 'DESC' },
    });
    if (!row?.bodyHtmlTemplate) return;

    let body = row.bodyHtmlTemplate;
    let changed = false;

    if (purpose === EmailTemplateService.SITELINE_PM_WEEKLY_PURPOSE) {
      if (!row.subjectTemplate?.includes('{{leadPmName}}')) {
        row.subjectTemplate = d.subject;
        changed = true;
      }
      const stalePmWeeklyBody =
        body.includes('Avg days to paid') ||
        body.includes('Internal Project #') ||
        body.includes('{{itemsTableHtml}}') ||
        body.includes('Your portfolio snapshot');
      if (!body.includes('{{reportTableHtml}}') || stalePmWeeklyBody) {
        body = d.html;
        changed = true;
      } else if (!body.includes('{{corDataQualityTableHtml}}')) {
        body = body.replace(
          '{{reportTableHtml}}',
          '{{reportTableHtml}}\n        {{corDataQualityTableHtml}}',
        );
        changed = true;
      }
    }

    if (purpose === EmailTemplateService.SITELINE_OVERDUE_PURPOSE) {
      if (!row.subjectTemplate?.includes('{{leadPmName}}')) {
        row.subjectTemplate = d.subject;
        changed = true;
      }
    }

    if (purpose === EmailTemplateService.PJ_COR_WEEKLY_PURPOSE) {
      if (
        body.includes('{{portfolioTableHtml}}') ||
        body.includes('PM portfolio') ||
        !body.includes('{{approvedTableHtml}}')
      ) {
        body = d.html;
        changed = true;
      } else if (!body.includes('{{dataQualityTableHtml}}')) {
        body = body.replace(
          '{{openTableHtml}}',
          '{{openTableHtml}}\n    {{dataQualityTableHtml}}',
        );
        changed = true;
      }
    }

    if (changed) {
      if (purpose === EmailTemplateService.SITELINE_PM_WEEKLY_PURPOSE) {
        row.bodyHtmlTemplate = body;
      }
      row.updatedAt = new Date();
      await this.repo.save(row);
    }
  }

  /** If a table block was not in the template, append it so sends never drop columns/sections. */
  private ensureInjectedTableBlocks(
    purpose: string,
    html: string,
    context: Record<string, string | number | null | undefined>,
  ): string {
    let out = html;

    if (purpose === EmailTemplateService.SITELINE_PM_WEEKLY_PURPOSE) {
      const reportTable = String(context.reportTableHtml ?? '').trim();
      const hasComparisonTable = out.includes('<th>Clearstory Contract Value</th>');
      if (reportTable && !hasComparisonTable) {
        out = out.replace(/\{\{reportTableHtml\}\}/g, '').trimEnd();
        out += `\n${reportTable}`;
      }
      const corDq = String(context.corDataQualityTableHtml ?? '').trim();
      const hasTmAlertTable = out.includes('<th>TM Tag Number</th>');
      if (corDq && !hasTmAlertTable) {
        out = out.replace(/\{\{corDataQualityTableHtml\}\}/g, '').trimEnd();
        out += `\n${corDq}`;
      }
    }

    if (purpose === EmailTemplateService.PJ_COR_WEEKLY_PURPOSE) {
      const dq = String(context.dataQualityTableHtml ?? '').trim();
      if (dq && !out.includes('<th>TM Tag Number</th>')) {
        out = out.replace(/\{\{dataQualityTableHtml\}\}/g, '').trimEnd();
        out += `\n${dq}`;
      }
    }

    return out;
  }

  private async ensureTable(): Promise<void> {
    await this.repo.query(`
      IF OBJECT_ID('dbo.App_EmailTemplates', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.App_EmailTemplates (
          TemplateKey nvarchar(100) NOT NULL PRIMARY KEY,
          Purpose nvarchar(100) NOT NULL CONSTRAINT DF_App_EmailTemplates_Purpose DEFAULT '',
          Name nvarchar(200) NULL,
          SubjectTemplate nvarchar(500) NOT NULL,
          BodyHtmlTemplate nvarchar(max) NOT NULL,
          IsActive bit NOT NULL CONSTRAINT DF_App_EmailTemplates_IsActive DEFAULT 0,
          ActivatedAt datetime2 NULL,
          UpdatedAt datetime2 NOT NULL CONSTRAINT DF_App_EmailTemplates_UpdatedAt DEFAULT SYSUTCDATETIME()
        );
      END

      -- Add missing columns if the table was created earlier with fewer fields.
      IF COL_LENGTH('dbo.App_EmailTemplates', 'Purpose') IS NULL
        ALTER TABLE dbo.App_EmailTemplates ADD Purpose nvarchar(100) NOT NULL CONSTRAINT DF_App_EmailTemplates_Purpose2 DEFAULT '';

      IF COL_LENGTH('dbo.App_EmailTemplates', 'Name') IS NULL
        ALTER TABLE dbo.App_EmailTemplates ADD Name nvarchar(200) NULL;

      IF COL_LENGTH('dbo.App_EmailTemplates', 'IsActive') IS NULL
        ALTER TABLE dbo.App_EmailTemplates ADD IsActive bit NOT NULL CONSTRAINT DF_App_EmailTemplates_IsActive2 DEFAULT 0;

      IF COL_LENGTH('dbo.App_EmailTemplates', 'ActivatedAt') IS NULL
        ALTER TABLE dbo.App_EmailTemplates ADD ActivatedAt datetime2 NULL;
    `);
  }

  private async ensureDefaultTemplates(): Promise<void> {
    // Ensure the Siteline overdue active template exists.
    const active = await this.repo.findOne({
      where: { purpose: EmailTemplateService.SITELINE_OVERDUE_PURPOSE, isActive: true as any },
    });
    if (active) {
      // Still ensure any other known purposes have at least one active template.
      await this.ensurePurposeDefaults([
        EmailTemplateService.AUTH_OTP_PURPOSE,
        EmailTemplateService.SITELINE_PM_WEEKLY_PURPOSE,
        EmailTemplateService.PJ_COR_WEEKLY_PURPOSE,
        EmailTemplateService.SITELINE_CLEARSTORY_DATA_GAP_PURPOSE,
      ]);
      return;
    }

    const existingLegacy = await this.repo.findOne({
      where: { templateKey: EmailTemplateService.SITELINE_OVERDUE_TEMPLATE_KEY },
    });

    const now = new Date();
    if (existingLegacy) {
      existingLegacy.purpose = EmailTemplateService.SITELINE_OVERDUE_PURPOSE;
      existingLegacy.isActive = true;
      existingLegacy.activatedAt = now;
      existingLegacy.updatedAt = now;
      const d = EmailTemplateService.DEFAULTS_BY_PURPOSE[EmailTemplateService.SITELINE_OVERDUE_PURPOSE];
      existingLegacy.subjectTemplate = existingLegacy.subjectTemplate || d.subject;
      existingLegacy.bodyHtmlTemplate =
        existingLegacy.bodyHtmlTemplate || d.html;
      await this.repo.save(existingLegacy);
      await this.activateTemplateForPurpose(existingLegacy.templateKey, existingLegacy.purpose);
      await this.ensurePurposeDefaults([
        EmailTemplateService.AUTH_OTP_PURPOSE,
        EmailTemplateService.SITELINE_PM_WEEKLY_PURPOSE,
        EmailTemplateService.PJ_COR_WEEKLY_PURPOSE,
        EmailTemplateService.SITELINE_CLEARSTORY_DATA_GAP_PURPOSE,
      ]);
      return;
    }

    const d = EmailTemplateService.DEFAULTS_BY_PURPOSE[EmailTemplateService.SITELINE_OVERDUE_PURPOSE];
    await this.createTemplate({
      templateKey: EmailTemplateService.SITELINE_OVERDUE_TEMPLATE_KEY,
      purpose: EmailTemplateService.SITELINE_OVERDUE_PURPOSE,
      name: d.name,
      subjectTemplate: d.subject,
      bodyHtmlTemplate: d.html,
      isActive: true,
    });

    await this.ensurePurposeDefaults([
        EmailTemplateService.AUTH_OTP_PURPOSE,
        EmailTemplateService.SITELINE_PM_WEEKLY_PURPOSE,
        EmailTemplateService.PJ_COR_WEEKLY_PURPOSE,
        EmailTemplateService.SITELINE_CLEARSTORY_DATA_GAP_PURPOSE,
      ]);
  }

  private async ensurePurposeDefaults(purposes: string[]): Promise<void> {
    await this.ensureTable();
    const now = new Date();
    for (const purpose of purposes) {
      const active = await this.repo.findOne({
        where: { purpose, isActive: true as any },
      });
      if (active) continue;
      const d = EmailTemplateService.DEFAULTS_BY_PURPOSE[purpose];
      if (!d) continue;
      await this.createTemplate({
        templateKey: `${purpose}.v1`,
        purpose,
        name: d.name,
        subjectTemplate: d.subject,
        bodyHtmlTemplate: d.html,
        isActive: true,
      });
      // Ensure single-active enforcement (createTemplate will already do it when isActive=true)
      await this.repo.update({ templateKey: `${purpose}.v1` }, { updatedAt: now });
    }
  }

  /** Push simplified gap-alert copy into SQL templates that still use the old wording. */
  private async refreshClearstoryGapTemplate(): Promise<void> {
    const purpose = EmailTemplateService.SITELINE_CLEARSTORY_DATA_GAP_PURPOSE;
    const d = EmailTemplateService.DEFAULTS_BY_PURPOSE[purpose];
    if (!d) return;

    const rows = await this.repo.find({ where: { purpose } });
    for (const row of rows) {
      const body = row.bodyHtmlTemplate ?? '';
      const subject = row.subjectTemplate ?? '';
      const legacy =
        /Run time:/i.test(body) ||
        /no usable Clearstory data/i.test(body) ||
        /Siteline billing without Clearstory match/i.test(subject) ||
        /Reconciliation alert/i.test(body) ||
        /<strong>Company:<\/strong> \{\{entityName\}\}/i.test(body) ||
        (/need Clearstory — GOEL$/i.test(subject) && !/all companies/i.test(subject)) ||
        !/\{\{summaryHtml\}\}/i.test(body);
      if (!legacy) continue;
      row.subjectTemplate = d.subject;
      row.bodyHtmlTemplate = d.html;
      row.updatedAt = new Date();
      await this.repo.save(row);
    }
  }

  /** Ensure PM / PJ SQL templates include the technical-team footer. */
  private async refreshReportIssueFooters(): Promise<void> {
    const purposes = [
      EmailTemplateService.SITELINE_PM_WEEKLY_PURPOSE,
      EmailTemplateService.PJ_COR_WEEKLY_PURPOSE,
    ];
    for (const purpose of purposes) {
      const d = EmailTemplateService.DEFAULTS_BY_PURPOSE[purpose];
      if (!d) continue;
      const rows = await this.repo.find({ where: { purpose } });
      for (const row of rows) {
        const body = row.bodyHtmlTemplate ?? '';
        if (/contact the technical team/i.test(body)) continue;
        row.bodyHtmlTemplate = this.appendReportIssueFooter(
          purpose,
          body || d.html,
        );
        row.updatedAt = new Date();
        await this.repo.save(row);
      }
    }
  }

  /** Replace legacy PM weekly intro copy still stored in SQL (admin templates). */
  private async refreshPmWeeklyTemplateIntro(): Promise<void> {
    const purpose = EmailTemplateService.SITELINE_PM_WEEKLY_PURPOSE;
    const d = EmailTemplateService.DEFAULTS_BY_PURPOSE[purpose];
    if (!d) return;

    const rows = await this.repo.find({ where: { purpose } });
    for (const row of rows) {
      const body = row.bodyHtmlTemplate ?? '';
      const legacy =
        /approved[- ]to[- ]proceed/i.test(body) ||
        /Overdue AR (uses|column uses)/i.test(body) ||
        /open AR across GOEL/i.test(body) ||
        /Clearstory comparison, and COR/i.test(body);
      if (!legacy) continue;
      row.bodyHtmlTemplate = d.html;
      row.updatedAt = new Date();
      await this.repo.save(row);
    }
  }

  private async activateTemplateForPurpose(templateKey: string, purpose: string): Promise<void> {
    const now = new Date();

    // Deactivate any other templates for this purpose.
    await this.repo
      .createQueryBuilder()
      .update(AppEmailTemplate)
      .set({
        isActive: false,
        activatedAt: null,
        updatedAt: now,
      })
      .where('purpose = :purpose AND templateKey <> :templateKey', { purpose, templateKey })
      .execute();

    // Activate the selected template row.
    await this.repo.update({ templateKey }, { isActive: true, activatedAt: now, updatedAt: now });
  }
}
