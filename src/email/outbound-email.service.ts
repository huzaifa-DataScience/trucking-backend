import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { Resend } from 'resend';

export type OutboundEmailAttachment = {
  filename: string;
  content: Buffer;
  contentType?: string;
};

export type OutboundEmailParams = {
  to: string;
  cc?: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: OutboundEmailAttachment[];
};

export type OutboundEmailProvider = 'resend' | 'smtp';

@Injectable()
export class OutboundEmailService {
  private readonly logger = new Logger(OutboundEmailService.name);

  constructor(private readonly config: ConfigService) {}

  /** Which provider will be used (null if nothing is configured). */
  resolveProvider(): OutboundEmailProvider | null {
    const forced = this.config.get<string>('EMAIL_PROVIDER', 'auto').trim().toLowerCase();
    if (forced === 'resend') return this.isResendConfigured() ? 'resend' : null;
    if (forced === 'smtp') return this.isSmtpConfigured() ? 'smtp' : null;
    if (this.isResendConfigured()) return 'resend';
    if (this.isSmtpConfigured()) return 'smtp';
    return null;
  }

  getConfigurationGaps(): string[] {
    const provider = this.resolveProvider();
    if (provider === 'resend') return this.getResendConfigurationGaps();
    if (provider === 'smtp') return this.getSmtpConfigurationGaps();
    const resendGaps = this.getResendConfigurationGaps();
    const smtpGaps = this.getSmtpConfigurationGaps();
    if (!this.config.get<string>('RESEND_API_KEY', '').trim()) {
      return smtpGaps.length ? smtpGaps : resendGaps;
    }
    return resendGaps;
  }

  isConfigured(): boolean {
    return this.resolveProvider() != null;
  }

  getFromAddress(): string {
    return this.readFromAddress();
  }

  async send(params: OutboundEmailParams): Promise<{ provider: OutboundEmailProvider }> {
    const provider = this.resolveProvider();
    if (!provider) {
      const missing = this.getConfigurationGaps();
      throw new BadRequestException({
        message: 'Outbound email is not configured.',
        missing,
      });
    }

    if (provider === 'resend') {
      await this.sendViaResend(params);
    } else {
      await this.sendViaSmtp(params);
    }

    this.logger.log(
      `Email sent via ${provider} → ${params.to}${params.cc ? ` (cc ${params.cc})` : ''} — ${params.subject}`,
    );
    return { provider };
  }

  private isResendConfigured(): boolean {
    return (
      Boolean(this.config.get<string>('RESEND_API_KEY', '').trim()) &&
      Boolean(this.readFromAddress())
    );
  }

  private isSmtpConfigured(): boolean {
    return this.getSmtpConfigurationGaps().length === 0;
  }

  private getResendConfigurationGaps(): string[] {
    const missing: string[] = [];
    if (!this.config.get<string>('RESEND_API_KEY', '').trim()) missing.push('RESEND_API_KEY');
    if (!this.readFromAddress()) missing.push('RESEND_FROM or OVERDUE_EMAIL_FROM');
    return missing;
  }

  getSmtpConfigurationGaps(): string[] {
    const { host, user, pass, from } = this.readSmtp();
    const missing: string[] = [];
    if (!host) missing.push('SMTP_HOST');
    if (!user) missing.push('SMTP_USER');
    if (!pass) missing.push('SMTP_PASS');
    if (!from) missing.push('OVERDUE_EMAIL_FROM');
    return missing;
  }

  private readFromAddress(): string {
    return (
      this.config.get<string>('RESEND_FROM', '').trim() ||
      this.config.get<string>('OVERDUE_EMAIL_FROM', '').trim() ||
      this.config.get<string>('SMTP_USER', '').trim()
    );
  }

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
    let pass = this.config.get<string>('SMTP_PASS', '').trim();
    if (pass.startsWith('"') || pass.startsWith("'")) {
      pass = pass.slice(1, -1);
    }
    const from = this.readFromAddress();
    return { host, port, user, pass, from };
  }

  private async sendViaResend(params: OutboundEmailParams): Promise<void> {
    const apiKey = this.config.get<string>('RESEND_API_KEY', '').trim();
    const from = this.readFromAddress();
    const missing = this.getResendConfigurationGaps();
    if (missing.length) {
      throw new BadRequestException({ message: 'Resend is not fully configured.', missing });
    }

    const resend = new Resend(apiKey);
    const toList = params.to
      .split(',')
      .map((e) => e.trim())
      .filter(Boolean);
    const ccList = params.cc
      ? params.cc
          .split(',')
          .map((e) => e.trim())
          .filter(Boolean)
      : undefined;

    const { error } = await resend.emails.send({
      from,
      to: toList.length === 1 ? toList[0] : toList,
      cc: ccList?.length ? (ccList.length === 1 ? ccList[0] : ccList) : undefined,
      subject: params.subject,
      html: params.html,
      text: params.text,
      attachments: params.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
      })),
    });

    if (error) {
      throw new Error(error.message);
    }
  }

  private async sendViaSmtp(params: OutboundEmailParams): Promise<void> {
    const { host, port, user, pass, from } = this.readSmtp();
    const missing = this.getSmtpConfigurationGaps();
    if (missing.length) {
      throw new BadRequestException({ message: 'SMTP is not fully configured.', missing });
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });

    await transporter.sendMail({
      from,
      to: params.to,
      cc: params.cc,
      subject: params.subject,
      text: params.text,
      html: params.html,
      attachments: params.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType,
      })),
    });
  }
}
