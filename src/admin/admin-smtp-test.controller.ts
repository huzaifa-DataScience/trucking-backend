import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { Roles } from '../auth/decorators';
import { Role } from '../database/entities';
import { SmtpOutboundService } from '../email/smtp-outbound.service';
import { SmtpTestEmailDto } from './dto/smtp-test-email.dto';

@Controller('admin/settings')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Admin)
export class AdminSmtpTestController {
  constructor(private readonly smtp: SmtpOutboundService) {}

  /** Send a one-off test email using current SMTP_* / OVERDUE_EMAIL_FROM env (no cron, no OVERDUE_EMAIL_ENABLED required). */
  @Post('smtp-test-email')
  async sendTestEmail(@Body() body: SmtpTestEmailDto) {
    await this.smtp.sendTestEmail(body.to.trim());
    return { ok: true, message: `Test email sent to ${body.to.trim()}` };
  }
}
