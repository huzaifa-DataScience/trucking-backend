import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConnecteamWebhookEvent } from '../database/entities';

export type ConnecteamWebhookPayload = {
  requestId?: string;
  company?: string;
  activityType?: string;
  eventType?: string;
  eventTimestamp?: number;
  data?: unknown;
};

@Injectable()
export class ConnecteamWebhookService {
  private readonly logger = new Logger(ConnecteamWebhookService.name);

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(ConnecteamWebhookEvent)
    private readonly events: Repository<ConnecteamWebhookEvent>,
  ) {}

  verifySecret(headerSecret: string | undefined): void {
    const expected = (this.config.get<string>('CONNECTEAM_WEBHOOK_SECRET') ?? '').trim();
    if (!expected) return;
    if (!headerSecret || headerSecret !== expected) {
      throw new UnauthorizedException('Invalid Connecteam webhook secret');
    }
  }

  async storeInbound(payload: ConnecteamWebhookPayload, rawBody: unknown): Promise<{ id: string }> {
    const saved = await this.events.save({
      requestId: payload.requestId ?? null,
      featureType: this.inferFeatureType(payload),
      eventType: payload.eventType ?? null,
      activityType: payload.activityType ?? null,
      eventTimestamp: payload.eventTimestamp != null ? String(payload.eventTimestamp) : null,
      payloadJson: JSON.stringify(rawBody ?? payload).slice(0, 8000),
      receivedAt: new Date(),
    });
    this.logger.log(
      `Connecteam webhook stored: id=${saved.id} eventType=${payload.eventType ?? 'unknown'}`,
    );
    return { id: String(saved.id) };
  }

  async listRecent(limit = 50): Promise<ConnecteamWebhookEvent[]> {
    const take = Math.max(1, Math.min(200, limit));
    return this.events.find({ order: { receivedAt: 'DESC' }, take });
  }

  private inferFeatureType(payload: ConnecteamWebhookPayload): string | null {
    const activity = (payload.activityType ?? '').trim();
    if (activity) return activity;
    const event = (payload.eventType ?? '').trim();
    if (event.startsWith('form_')) return 'forms';
    if (event.startsWith('user_')) return 'users';
    if (event.includes('shift') || event.includes('scheduler')) return 'shift_scheduler';
    if (event.includes('clock') || event.includes('time_activity')) return 'time_activity';
    if (event.startsWith('message_') || event.startsWith('conversation_')) return 'chat';
    if (event.includes('task')) return 'tasks';
    return null;
  }
}
