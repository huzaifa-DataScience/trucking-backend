import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { Roles } from '../auth/decorators';
import { Role } from '../database/entities';
import { ConfigService } from '@nestjs/config';
import { SmtpOutboundService } from '../email/smtp-outbound.service';
import { EmailTemplateService } from '../email/email-template.service';
import { SmtpTestEmailDto } from './dto/smtp-test-email.dto';

@Controller('admin/settings')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Admin)
export class AdminSmtpTestController {
  constructor(
    private readonly smtp: SmtpOutboundService,
    private readonly config: ConfigService,
    private readonly emailTemplates: EmailTemplateService,
  ) {}

  /** Send a one-off test email using current SMTP_* / OVERDUE_EMAIL_FROM env (no cron, no OVERDUE_EMAIL_ENABLED required). */
  @Post('smtp-test-email')
  async sendTestEmail(@Body() body: SmtpTestEmailDto) {
    const to = body.to.trim();

    // If purpose is provided, render the active admin template for that purpose and send it.
    if (body.purpose) {
      const purpose = body.purpose.trim();
      const daysThreshold = parseInt(this.config.get<string>('OVERDUE_EMAIL_DAYS', '50'), 10);

      const context: Record<string, string | number | null | undefined> = {};

      if (purpose === EmailTemplateService.SITELINE_OVERDUE_PURPOSE) {
        const leadPmName = (body.leadPmName ?? 'Test Lead PM').trim();
        // Build a minimal HTML table body that matches what the Siteline overdue template expects.
        const itemsTableHtml = `
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
            <tbody>
              <tr>
                <td>Test Project</td>
                <td>INT-TEST</td>
                <td>12345</td>
                <td>${new Date().toISOString().slice(0, 10)}</td>
                <td>${daysThreshold + 10}</td>
                <td>$1,000.00</td>
              </tr>
            </tbody>
          </table>
        `.trim();

        context.leadPmName = leadPmName;
        context.daysThreshold = daysThreshold;
        context.itemCount = 1;
        context.itemsTableHtml = itemsTableHtml;
      } else if (purpose === EmailTemplateService.AUTH_OTP_PURPOSE) {
        const otpCode =
          (body.otpCode ?? String(Math.floor(100000 + Math.random() * 900000))).trim();
        const expiresMinutes = body.expiresMinutes ?? 10;
        const appName = (body.appName ?? 'Trucking Dashboard').trim();

        context.otpCode = otpCode;
        context.expiresMinutes = expiresMinutes;
        context.appName = appName;
      }

      const { subject, html } = await this.emailTemplates.renderTemplate(purpose, context);

      await this.smtp.sendEmail({ to, subject, html });
      return { ok: true, message: `Template test email sent to ${to}`, purpose };
    }

    // Otherwise send a simple fixed SMTP test.
    await this.smtp.sendTestEmail(to);
    return { ok: true, message: `Test email sent to ${to}` };
  }

  /**
   * Send the exact PM-lead overdue template as a test (no purpose string required).
   * Uses the active template for siteline.overdue_leadpm and fills placeholders with sample data.
   */
  @Post('smtp-test-overdue-email')
  async sendOverdueTemplateTest(@Body() body: { to: string; leadPmName?: string }) {
    const to = (body?.to ?? '').trim();
    if (!to) {
      // Keep validation lightweight: frontend/admin can ensure a real email
      // The SMTP send will fail if invalid; this is mainly to catch empty body.
      throw new Error('Missing "to" email');
    }

    const daysThreshold = parseInt(this.config.get<string>('OVERDUE_EMAIL_DAYS', '50'), 10);
    const leadPmName = (body.leadPmName ?? 'Test Lead PM').trim();

    const itemsTableHtml = `
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
        <tbody>
          <tr>
            <td>Test Project</td>
            <td>INT-TEST</td>
            <td>12345</td>
            <td>${new Date().toISOString().slice(0, 10)}</td>
            <td>${daysThreshold + 10}</td>
            <td>$1,000.00</td>
          </tr>
        </tbody>
      </table>
    `.trim();

    const { subject, html } = await this.emailTemplates.renderTemplate(
      EmailTemplateService.SITELINE_OVERDUE_PURPOSE,
      {
        leadPmName,
        daysThreshold,
        itemCount: 1,
        itemsTableHtml,
      },
    );

    await this.smtp.sendEmail({ to, subject, html });
    return {
      ok: true,
      purpose: EmailTemplateService.SITELINE_OVERDUE_PURPOSE,
      message: `Overdue PM template test email sent to ${to}`,
    };
  }
}
