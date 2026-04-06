import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppEmailTemplate } from '../database/entities';

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

  // Runtime selector key for OTP emails (when/if wired by backend auth flows).
  static readonly AUTH_OTP_PURPOSE = 'auth.otp';

  private static readonly PURPOSE_PLACEHOLDERS: Record<string, string[]> = {
    [EmailTemplateService.SITELINE_OVERDUE_PURPOSE]: [
      '{{leadPmName}}',
      '{{daysThreshold}}',
      '{{itemCount}}',
      '{{itemsTableHtml}}',
    ],
    [EmailTemplateService.AUTH_OTP_PURPOSE]: [
      '{{appName}}',
      '{{otpCode}}',
      '{{expiresMinutes}}',
    ],
  };

  private static readonly DEFAULTS_BY_PURPOSE: Record<
    string,
    { name: string; subject: string; html: string }
  > = {
    [EmailTemplateService.SITELINE_OVERDUE_PURPOSE]: {
      name: 'Siteline overdue lead PM (default)',
      subject: 'Action needed: {{itemCount}} overdue pay app(s) (> {{daysThreshold}} days)',
      html: `<!-- Best-practice HTML email: table layout + inline styles -->\n<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"background:#f3f4f6; margin:0; padding:0; width:100%;\">\n  <tr>\n    <td align=\"center\" style=\"padding:24px 12px;\">\n      <table role=\"presentation\" width=\"600\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"width:600px; max-width:600px; background:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 2px 10px rgba(0,0,0,0.06);\">\n        <tr>\n          <td style=\"padding:22px 24px; background:#0f172a; color:#ffffff; font-family:Arial,Helvetica,sans-serif;\">\n            <div style=\"font-size:16px; line-height:22px; font-weight:700;\">Trucking Dashboard</div>\n            <div style=\"font-size:12px; line-height:18px; opacity:0.85;\">Automated AR alert</div>\n          </td>\n        </tr>\n        <tr>\n          <td style=\"padding:24px; font-family:Arial,Helvetica,sans-serif; color:#111827;\">\n            <div style=\"font-size:16px; line-height:24px; margin:0 0 12px 0;\">Hi <strong>{{leadPmName}}</strong>,</div>\n            <div style=\"font-size:14px; line-height:22px; margin:0 0 14px 0; color:#374151;\">\n              The following pay app item(s) are now <strong>over {{daysThreshold}} days past due</strong>.\n            </div>\n            <div style=\"margin:16px 0; padding:14px 16px; border:1px solid #e5e7eb; border-radius:10px; background:#f9fafb;\">\n              <div style=\"font-size:13px; line-height:20px; color:#111827;\">\n                <strong>Summary</strong>\n              </div>\n              <div style=\"font-size:13px; line-height:20px; color:#374151; margin-top:6px;\">\n                Items: <strong>{{itemCount}}</strong>\n              </div>\n            </div>\n\n            <div style=\"font-size:13px; line-height:20px; color:#111827; margin:0 0 8px 0;\"><strong>Details</strong></div>\n            <div style=\"font-size:13px; line-height:20px; color:#374151; margin:0 0 12px 0;\">\n              (Table may render best on desktop email clients.)\n            </div>\n            {{itemsTableHtml}}\n\n            <div style=\"margin-top:18px; font-size:12px; line-height:18px; color:#6b7280;\">\n              If this email reached you in error, please ignore it.\n            </div>\n          </td>\n        </tr>\n        <tr>\n          <td style=\"padding:16px 24px; background:#f3f4f6; font-family:Arial,Helvetica,sans-serif; color:#6b7280; font-size:12px; line-height:18px;\">\n            Sent automatically by Trucking Dashboard.\n          </td>\n        </tr>\n      </table>\n    </td>\n  </tr>\n</table>`,
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
    const row = await this.repo.findOne({
      where: { purpose, isActive: true as any },
      order: { updatedAt: 'DESC' },
    });

    if (!row) {
      const d = EmailTemplateService.DEFAULTS_BY_PURPOSE[purpose];
      if (d) {
        return {
          subject: this.applyPlaceholders(d.subject, context),
          html: this.applyPlaceholders(d.html, context),
        };
      }
      throw new Error(`No active email template for purpose: ${purpose}`);
    }

    return {
      subject: this.applyPlaceholders(row.subjectTemplate, context),
      html: this.applyPlaceholders(row.bodyHtmlTemplate, context),
    };
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
      await this.ensurePurposeDefaults([EmailTemplateService.AUTH_OTP_PURPOSE]);
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
      await this.ensurePurposeDefaults([EmailTemplateService.AUTH_OTP_PURPOSE]);
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

    await this.ensurePurposeDefaults([EmailTemplateService.AUTH_OTP_PURPOSE]);
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
