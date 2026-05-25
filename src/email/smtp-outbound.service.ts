import { Injectable } from '@nestjs/common';
import { OutboundEmailService } from './outbound-email.service';

/** @deprecated Use OutboundEmailService — kept for admin SMTP test routes. */
@Injectable()
export class SmtpOutboundService {
  constructor(private readonly outbound: OutboundEmailService) {}

  getSmtpConfigurationGaps(): string[] {
    return this.outbound.getConfigurationGaps();
  }

  async sendTestEmail(to: string): Promise<void> {
    const ts = new Date().toISOString();
    const provider = this.outbound.resolveProvider() ?? 'none';

    await this.outbound.send({
      to,
      subject: `Trucking dashboard — email test (${provider})`,
      text: `Test message at ${ts}. Provider: ${provider}.`,
      html: `<p>Test message at <code>${ts}</code>.</p><p>Provider: <strong>${provider}</strong>.</p>`,
    });
  }

  async sendEmail(params: { to: string; subject: string; html: string; text?: string }): Promise<void> {
    await this.outbound.send(params);
  }
}
