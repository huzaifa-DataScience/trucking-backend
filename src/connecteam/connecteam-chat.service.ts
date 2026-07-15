import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ConnecteamConversation,
  ConnecteamMessage,
  ConnecteamUser,
} from '../database/entities';
import { ConnecteamApiClient } from './connecteam-api.client';
import { ConnecteamChatGateway } from './connecteam-chat.gateway';
import { ConnecteamDisplayService } from './connecteam-display.service';
import type { ConnecteamWebhookPayload } from './connecteam-webhook.service';
import { unixSecondsToIso } from './connecteam-display.util';
import { unixSecondsToDate } from './connecteam.util';
import { dmConversationId } from './connecteam-native-id.util';

type ConnecteamWebhookMessage = {
  id?: string;
  conversationId?: string;
  conversationSource?: string;
  conversationType?: string;
  senderId?: number;
  senderType?: string;
  recipientId?: number | null;
  type?: string;
  content?: string | null;
  attachments?: Array<{ type?: string; url?: string; fileName?: string | null; fileSize?: number | null }> | null;
  isSystem?: boolean;
  createdAt?: number;
  modifiedAt?: number;
  deletedAt?: number;
};

type ConnecteamWebhookConversation = {
  id?: string;
  title?: string | null;
  type?: string;
  conversationSource?: string;
  createdBy?: number;
  createdAt?: number;
  modifiedAt?: number;
  deletedAt?: number;
};

@Injectable()
export class ConnecteamChatService {
  private readonly logger = new Logger(ConnecteamChatService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly api: ConnecteamApiClient,
    private readonly display: ConnecteamDisplayService,
    @InjectRepository(ConnecteamConversation)
    private readonly conversations: Repository<ConnecteamConversation>,
    @InjectRepository(ConnecteamMessage) private readonly messages: Repository<ConnecteamMessage>,
    @InjectRepository(ConnecteamUser) private readonly users: Repository<ConnecteamUser>,
    @Optional() private readonly chatGateway?: ConnecteamChatGateway,
  ) {}

  skipSystemMessages(): boolean {
    return this.config.get<string>('CONNECTEAM_CHAT_SKIP_SYSTEM', 'true') !== 'false';
  }

  skippedSources(): Set<string> {
    const raw = (this.config.get<string>('CONNECTEAM_CHAT_SKIP_SOURCES') ?? 'helpDesk,connecteamTips').trim();
    return new Set(raw.split(',').map((s) => s.trim()).filter(Boolean));
  }

  async processWebhook(payload: ConnecteamWebhookPayload): Promise<{ handled: boolean; detail?: string }> {
    const eventType = (payload.eventType ?? '').trim();
    if (!eventType) return { handled: false };

    if (eventType.startsWith('message_')) {
      const msg = this.extractMessage(payload);
      if (!msg?.id || !msg.conversationId) return { handled: false, detail: 'missing message id' };
      if (eventType === 'message_deleted') {
        await this.markMessageDeleted(msg);
        return { handled: true, detail: 'message_deleted' };
      }
      await this.upsertWebhookMessage(msg);
      return { handled: true, detail: eventType };
    }

    if (eventType.startsWith('conversation_')) {
      const conv = this.extractConversation(payload);
      if (!conv?.id) return { handled: false, detail: 'missing conversation id' };
      if (eventType === 'conversation_deleted') {
        await this.markConversationDeleted(conv.id);
        return { handled: true, detail: 'conversation_deleted' };
      }
      await this.upsertWebhookConversation(conv);
      return { handled: true, detail: eventType };
    }

    return { handled: false };
  }

  getChatSyncStatus() {
    const apiConfigured = this.api.isConfigured();
    const webhookUrl = (this.config.get<string>('CONNECTEAM_WEBHOOK_PUBLIC_URL') ?? '').trim();
    const webhookSecret = (this.config.get<string>('CONNECTEAM_WEBHOOK_SECRET') ?? '').trim();
    const writeThrough =
      this.config.get<string>('CONNECTEAM_WRITE_THROUGH', 'false') === 'true' && apiConfigured;
    const publisherRaw = (this.config.get<string>('CONNECTEAM_CHAT_PUBLISHER_ID') ?? '').trim();
    const publisherId = publisherRaw ? Number(publisherRaw) : NaN;
    const publisherConfigured = Number.isFinite(publisherId) && publisherId > 0;

    const inboundReady = apiConfigured && Boolean(webhookUrl);
    const outboundReady = writeThrough && publisherConfigured;

    return {
      bidirectionalReady: inboundReady && outboundReady,
      inbound: {
        ready: inboundReady,
        apiKeyConfigured: apiConfigured,
        webhookUrlConfigured: Boolean(webhookUrl),
        webhookSecretConfigured: Boolean(webhookSecret),
        steps: [
          'Set CONNECTEAM_WEBHOOK_PUBLIC_URL + CONNECTEAM_WEBHOOK_SECRET in server .env',
          'POST /connecteam/webhooks/register-chat (admin JWT)',
          'Ask Connecteam to enable chat webhooks (Beta) on your company account',
        ],
      },
      outbound: {
        ready: outboundReady,
        writeThroughEnabled: writeThrough,
        publisherIdConfigured: publisherConfigured,
        steps: [
          'Set CONNECTEAM_WRITE_THROUGH=true',
          'Create Custom Publisher in Connecteam → Settings → Feed settings',
          'Set CONNECTEAM_CHAT_PUBLISHER_ID to that publisher id',
        ],
      },
      history: {
        backfillAvailable: false,
        note: 'Connecteam has no message history API. Only messages after the webhook is live are mirrored inbound.',
      },
      nativeChannels: {
        note: 'Conversations with id app-* exist only on our site unless you create them in Connecteam separately.',
      },
    };
  }

  async registerChatWebhook(): Promise<{ ok: boolean; webhook?: unknown; error?: string; syncStatus?: ReturnType<ConnecteamChatService['getChatSyncStatus']> }> {
    const publicUrl = (this.config.get<string>('CONNECTEAM_WEBHOOK_PUBLIC_URL') ?? '').trim();
    const secret = (this.config.get<string>('CONNECTEAM_WEBHOOK_SECRET') ?? '').trim();
    if (!publicUrl) {
      return { ok: false, error: 'CONNECTEAM_WEBHOOK_PUBLIC_URL is not set (e.g. https://api.yoursite.com/connecteam/webhooks/inbound)' };
    }
    if (!this.api.isConfigured()) {
      return { ok: false, error: 'CONNECTEAM_API_KEY is not set' };
    }
    try {
      const webhook = await this.api.registerWebhook({
        name: 'Goel workforce chat mirror',
        url: publicUrl,
        featureType: 'chat',
        eventTypes: [
          'message_created',
          'message_updated',
          'message_deleted',
          'conversation_created',
          'conversation_updated',
          'conversation_deleted',
        ],
        secretKey: secret || undefined,
      });
      return { ok: true, webhook, syncStatus: this.getChatSyncStatus() };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`Chat webhook registration failed: ${msg}`);
      return { ok: false, error: msg, syncStatus: this.getChatSyncStatus() };
    }
  }

  async listMessagesForConversation(
    conversationId: string,
    page = 1,
    pageSize = 50,
    includeDeleted = false,
  ) {
    const take = Math.max(1, Math.min(200, pageSize));
    const skip = (Math.max(1, page) - 1) * take;
    const qb = this.messages
      .createQueryBuilder('m')
      .where('m.conversationId = :conversationId', { conversationId })
      .orderBy('m.sentAt', 'DESC');
    if (!includeDeleted) qb.andWhere('m.isDeleted = 0');
    qb.skip(skip).take(take);
    const [rows, total] = await qb.getManyAndCount();
    return {
      page,
      pageSize: take,
      total,
      messages: await this.display.enrichMessages(rows),
      source: 'local' as const,
    };
  }

  async saveNativeMessage(input: {
    conversationId: string;
    userId: number | null;
    appUserId: number;
    body: string;
    externalMessageId?: string | null;
  }): Promise<ConnecteamMessage> {
    const row = this.messages.create({
      conversationId: input.conversationId,
      userId: input.userId,
      appUserId: input.appUserId,
      body: input.body.trim(),
      sentAt: new Date(),
      recordSource: 'native',
      externalMessageId: input.externalMessageId ?? null,
      isDeleted: false,
      messageType: 'text',
      attachmentsJson: null,
      modifiedAt: null,
    });
    await this.messages.save(row);
    await this.refreshConversationPreview(input.conversationId, row);
    await this.emitMessageLive(input.conversationId, row);
    return row;
  }

  /** Push enriched message + conversation to connected Socket.IO clients. */
  async emitMessageLive(conversationId: string, message: ConnecteamMessage): Promise<void> {
    if (!this.chatGateway) return;
    const [enrichedMsg] = await this.display.enrichMessages([message]);
    const conv = await this.conversations.findOne({ where: { conversationId } });
    const [enrichedConv] = conv ? this.display.enrichConversations([conv]) : [null];
    this.chatGateway.emitMessage({ message: enrichedMsg, conversation: enrichedConv });
  }

  async emitConversationLive(conversationId: string): Promise<void> {
    if (!this.chatGateway) return;
    const conv = await this.conversations.findOne({ where: { conversationId } });
    if (!conv) return;
    const [enriched] = this.display.enrichConversations([conv]);
    this.chatGateway.emitConversationUpdated({ conversation: enriched });
  }

  private extractMessage(payload: ConnecteamWebhookPayload): ConnecteamWebhookMessage | null {
    const data = payload.data as { message?: ConnecteamWebhookMessage } | undefined;
    return data?.message ?? null;
  }

  private extractConversation(payload: ConnecteamWebhookPayload): ConnecteamWebhookConversation | null {
    const data = payload.data as { conversation?: ConnecteamWebhookConversation } | undefined;
    return data?.conversation ?? null;
  }

  private shouldSkipMessage(msg: ConnecteamWebhookMessage): boolean {
    if (msg.isSystem && this.skipSystemMessages()) return true;
    const src = (msg.conversationSource ?? '').trim();
    if (src && this.skippedSources().has(src)) return true;
    return false;
  }

  private formatMessageBody(msg: ConnecteamWebhookMessage): string {
    if (msg.content?.trim()) return msg.content.trim();
    const att = msg.attachments?.[0];
    if (att?.fileName) return `[${att.type ?? 'file'}: ${att.fileName}]`;
    if (att?.type) return `[${att.type} attachment]`;
    if (msg.type && msg.type !== 'text') return `[${msg.type}]`;
    return '';
  }

  /** The employee on the far side of a 1:1 (the participant that isn't our publisher/bot). */
  private otherPrivateUserId(msg: ConnecteamWebhookMessage): number | null {
    if ((msg.senderType ?? '') === 'user' && msg.senderId != null && msg.senderId > 0) {
      return msg.senderId;
    }
    if (msg.recipientId != null && msg.recipientId > 0) return msg.recipientId;
    return null;
  }

  /**
   * Private messages are stored under `dm-<otherUserId>` so both directions land
   * in one thread (Connecteam's privateMessage API never returns a conversation
   * id). Non-private events keep their Connecteam conversation id.
   * ponytail: if we can't identify the other user, fall back to the raw id.
   */
  private conversationKeyFor(msg: ConnecteamWebhookMessage): string {
    const raw = String(msg.conversationId);
    if ((msg.conversationType ?? '') !== 'private') return raw;
    const other = this.otherPrivateUserId(msg);
    return other != null ? dmConversationId(other) : raw;
  }

  /** Name a DM thread after the other participant, so the inbox shows a person. */
  private async privateThreadTitle(
    msg: ConnecteamWebhookMessage,
    conversationId: string,
  ): Promise<string | null> {
    if (!conversationId.startsWith('dm-')) return null;
    const otherId = this.otherPrivateUserId(msg);
    if (otherId == null) return null;
    const u = await this.users.findOne({ where: { userId: otherId } });
    return u ? this.display.formatUserDisplayName(u) : null;
  }

  private async upsertWebhookMessage(msg: ConnecteamWebhookMessage): Promise<void> {
    if (this.shouldSkipMessage(msg)) return;

    const conversationId = this.conversationKeyFor(msg);
    const externalId = String(msg.id);
    const body = this.formatMessageBody(msg);
    const sentAt = unixSecondsToDate(msg.createdAt) ?? new Date();
    const modifiedAt = unixSecondsToDate(msg.modifiedAt);
    const userId = msg.senderId != null && msg.senderId > 0 ? msg.senderId : null;

    const dmTitle = await this.privateThreadTitle(msg, conversationId);
    await this.ensureConversationStub(
      conversationId,
      msg.conversationType ?? null,
      msg.conversationSource ?? null,
      dmTitle,
    );

    let row = await this.messages.findOne({
      where: { conversationId, externalMessageId: externalId },
    });

    if (!row) {
      row = this.messages.create({
        conversationId,
        externalMessageId: externalId,
        userId,
        appUserId: null,
        body: body || '(empty)',
        sentAt,
        recordSource: 'sync',
        isDeleted: false,
        messageType: msg.type ?? null,
        attachmentsJson: msg.attachments?.length ? JSON.stringify(msg.attachments) : null,
        modifiedAt,
      });
    } else {
      row.body = body || row.body;
      row.userId = userId ?? row.userId;
      row.messageType = msg.type ?? row.messageType;
      row.attachmentsJson = msg.attachments?.length ? JSON.stringify(msg.attachments) : row.attachmentsJson;
      row.modifiedAt = modifiedAt ?? row.modifiedAt;
      row.isDeleted = false;
      row.sentAt = sentAt;
    }

    await this.messages.save(row);
    await this.refreshConversationPreview(conversationId, row);
    await this.emitMessageLive(conversationId, row);
  }

  private async markMessageDeleted(msg: ConnecteamWebhookMessage): Promise<void> {
    const conversationId = this.conversationKeyFor(msg);
    const externalId = String(msg.id);
    const row = await this.messages.findOne({ where: { conversationId, externalMessageId: externalId } });
    if (!row) return;
    row.isDeleted = true;
    row.modifiedAt = unixSecondsToDate(msg.deletedAt) ?? new Date();
    await this.messages.save(row);
    await this.recomputeConversationPreview(conversationId);
    this.chatGateway?.emitMessageDeleted({
      conversationId,
      messageId: row.messageId,
      externalMessageId: row.externalMessageId,
    });
    await this.emitConversationLive(conversationId);
  }

  private async upsertWebhookConversation(conv: ConnecteamWebhookConversation): Promise<void> {
    // Private conversation events carry no participant list, so we can't map them
    // to our dm-<userId> thread. Message events create/maintain DM threads instead.
    if ((conv.type ?? '') === 'private') return;

    const id = String(conv.id);
    let row = await this.conversations.findOne({ where: { conversationId: id } });
    if (!row) {
      row = this.conversations.create({
        conversationId: id,
        title: conv.title ?? null,
        type: conv.type ?? null,
        conversationSource: conv.conversationSource ?? 'chat',
        lastSyncedAt: new Date(),
        recordSource: 'sync',
        isDeleted: false,
        messageCount: 0,
      });
    } else {
      if (conv.title !== undefined) row.title = conv.title;
      if (conv.type) row.type = conv.type;
      if (conv.conversationSource) row.conversationSource = conv.conversationSource;
      row.isDeleted = false;
      row.lastSyncedAt = new Date();
    }
    await this.conversations.save(row);
    await this.emitConversationLive(id);
  }

  private async markConversationDeleted(conversationId: string): Promise<void> {
    const row = await this.conversations.findOne({ where: { conversationId } });
    if (!row) return;
    row.isDeleted = true;
    row.lastSyncedAt = new Date();
    await this.conversations.save(row);
    await this.emitConversationLive(conversationId);
  }

  private async ensureConversationStub(
    conversationId: string,
    type: string | null,
    source: string | null,
    title: string | null = null,
  ): Promise<void> {
    const exists = await this.conversations.findOne({ where: { conversationId } });
    if (exists) {
      if (title && !exists.title?.trim()) {
        exists.title = title;
        await this.conversations.save(exists);
      }
      return;
    }
    await this.conversations.save(
      this.conversations.create({
        conversationId,
        title,
        type,
        conversationSource: source ?? 'chat',
        lastSyncedAt: new Date(),
        recordSource: 'sync',
        isDeleted: false,
        messageCount: 0,
      }),
    );
  }

  private async refreshConversationPreview(conversationId: string, message: ConnecteamMessage): Promise<void> {
    const conv = await this.conversations.findOne({ where: { conversationId } });
    if (!conv) return;

    const count = await this.messages.count({ where: { conversationId, isDeleted: false } });
    conv.messageCount = count;

    const latest = await this.messages.findOne({
      where: { conversationId, isDeleted: false },
      order: { sentAt: 'DESC' },
    });
    if (latest) {
      conv.lastMessageAt = latest.sentAt;
      conv.lastMessagePreview = latest.body.slice(0, 500);
      if (latest.userId != null) {
        const u = await this.users.findOne({ where: { userId: latest.userId } });
        conv.lastMessageSenderName = u ? this.display.formatUserDisplayName(u) : null;
      }
    }

    await this.conversations.save(conv);
  }

  private async recomputeConversationPreview(conversationId: string): Promise<void> {
    const conv = await this.conversations.findOne({ where: { conversationId } });
    if (!conv) return;
    const count = await this.messages.count({ where: { conversationId, isDeleted: false } });
    conv.messageCount = count;
    const latest = await this.messages.findOne({
      where: { conversationId, isDeleted: false },
      order: { sentAt: 'DESC' },
    });
    if (latest) {
      conv.lastMessageAt = latest.sentAt;
      conv.lastMessagePreview = latest.body.slice(0, 500);
      const u = latest.userId != null ? await this.users.findOne({ where: { userId: latest.userId } }) : null;
      conv.lastMessageSenderName = u ? this.display.formatUserDisplayName(u) : null;
    } else {
      conv.lastMessageAt = null;
      conv.lastMessagePreview = null;
      conv.lastMessageSenderName = null;
    }
    await this.conversations.save(conv);
  }

  /** For display layer — ISO timestamp helper exposed to messages. */
  messageSentAtIso(msg: ConnecteamMessage): string {
    return msg.sentAt instanceof Date ? msg.sentAt.toISOString() : unixSecondsToIso(msg.sentAt) ?? '';
  }
}
