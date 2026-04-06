import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class SmtpOutboundService {
  constructor(private readonly config: ConfigService) {}

  private readSmtp(): {
    host: string;
    port: number;
    user: string;
    pass: string;
    from: string;
  } {
    const host = this.config.get<string>('SMTP_HOST', '').trim();
    const port = parseInt(this.config.get<string>('SMTP_PORT', '587'), 10);
    const user = this.config.get<string>('SMTP_USER', '').trim();
    const pass = this.config.get<string>('SMTP_PASS', '').trim();
    const from = this.config.get<string>('OVERDUE_EMAIL_FROM', user || '').trim();
    return { host, port, user, pass, from };
  }

  /** Returns human-readable list of missing env vars (empty if SMTP is ready). */
  getSmtpConfigurationGaps(): string[] {
    const { host, user, pass, from } = this.readSmtp();
    const missing: string[] = [];
    if (!host) missing.push('SMTP_HOST');
    if (!user) missing.push('SMTP_USER');
    if (!pass) missing.push('SMTP_PASS');
    if (!from) missing.push('OVERDUE_EMAIL_FROM');
    return missing;
  }

  private async getValidatedTransport(): Promise<{
    transporter: nodemailer.Transporter;
    from: string;
  }> {
    const { host, port, user, pass, from } = this.readSmtp();
    const missing = this.getSmtpConfigurationGaps();
    if (missing.length) {
      throw new BadRequestException({
        message: 'SMTP is not fully configured.',
        missing,
      });
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });

    return { transporter, from };
  }

  /**
   * Sends a simple message to verify SMTP. Does not require OVERDUE_EMAIL_ENABLED.
   */
  async sendTestEmail(to: string): Promise<void> {
    const ts = new Date().toISOString();

    await this.sendEmail({
      to,
      subject: 'Trucking dashboard — SMTP test',
      text: `This is a test message sent at ${ts}. If you received it, outbound SMTP is working.`,
      html: `<p>This is a <strong>test message</strong> sent at <code>${ts}</code>.</p><p>If you received it, outbound SMTP is working.</p>`,
    });
  }

  /** Sends a fully custom message using the current SMTP_* env settings. */
  async sendEmail(params: { to: string; subject: string; html: string; text?: string }): Promise<void> {
    const { transporter, from } = await this.getValidatedTransport();
    await transporter.sendMail({
      from,
      to: params.to,
      subject: params.subject,
      text: params.text,
      html: params.html,
    });
  }
}
