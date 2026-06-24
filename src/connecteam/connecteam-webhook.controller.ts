import { Body, Controller, Get, Headers, Post, Query, UseGuards } from '@nestjs/common';
import { Public } from '../auth/decorators';
import { JwtAuthGuard } from '../auth/guards';
import { ConnecteamWebhookPayload, ConnecteamWebhookService } from './connecteam-webhook.service';

@Controller('connecteam/webhooks')
export class ConnecteamWebhookController {
  constructor(private readonly webhooks: ConnecteamWebhookService) {}

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
}
