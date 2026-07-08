import { Body, Controller, Get, Headers, Post, Query, UseGuards } from '@nestjs/common';
import { Public } from '../auth/decorators';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { Role } from '../database/entities';
import { ConnecteamChatService } from './connecteam-chat.service';
import { ConnecteamWebhookPayload, ConnecteamWebhookService } from './connecteam-webhook.service';

@Controller('connecteam/webhooks')
export class ConnecteamWebhookController {
  constructor(
    private readonly webhooks: ConnecteamWebhookService,
    private readonly chat: ConnecteamChatService,
  ) {}

  /** Inbound Connecteam webhook receiver (HTTPS). Configure in Connecteam Settings → API & Integrations. */
  @Public()
  @Post('inbound')
  async inbound(
    @Headers('x-webhook-secret') webhookSecret: string | undefined,
    @Body() body: ConnecteamWebhookPayload,
  ) {
    this.webhooks.verifySecret(webhookSecret);
    const result = await this.webhooks.storeInbound(body, body);
    return { ok: true, ...result };
  }

  @UseGuards(JwtAuthGuard)
  @Get('events')
  async listEvents(@Query('limit') limit?: string) {
    const rows = await this.webhooks.listRecent(limit ? Number(limit) : undefined);
    return { events: rows };
  }

  /** Register Connecteam chat webhook (admin). Requires CONNECTEAM_WEBHOOK_PUBLIC_URL + CONNECTEAM_WEBHOOK_SECRET in .env */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  @Post('register-chat')
  async registerChatWebhook() {
    return this.chat.registerChatWebhook();
  }
}
