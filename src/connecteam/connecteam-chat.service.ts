import { Injectable, Logger, NotFoundException, OnModuleInit, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ConnecteamConversation,
  ConnecteamConversationRead,
  ConnecteamMessage,
  ConnecteamUser,
  ConnecteamWebhookEvent,
} from '../database/entities';
import { ConnecteamApiClient } from './connecteam-api.client';
import { ConnecteamChatGateway } from './connecteam-chat.gateway';
import { ConnecteamDisplayService } from './connecteam-display.service';
import type { ConnecteamWebhookPayload } from './connecteam-webhook.service';
import { unixSecondsToIso } from './connecteam-display.util';
import { unixSecondsToDate } from './connecteam.util';
import { dmConversationId } from './connecteam-native-id.util';

/** No cursor yet → treat as never read (all prior non-own messages count). */
const UNREAD_EPOCH = new Date('1970-01-01T00:00:00.000Z');

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
export class ConnecteamChatService implements OnModuleInit {
  private readonly logger = new Logger(ConnecteamChatService.name);
  private readsTableReady = false;
  private replayRunning = false;

  constructor(
    private readonly config: ConfigService,
    private readonly api: ConnecteamApiClient,
    private readonly display: ConnecteamDisplayService,
    @InjectRepository(ConnecteamConversation)
    private readonly conversations: Repository<ConnecteamConversation>,
    @InjectRepository(ConnecteamMessage) private readonly messages: Repository<ConnecteamMessage>,
    @InjectRepository(ConnecteamUser) private readonly users: Repository<ConnecteamUser>,
    @InjectRepository(ConnecteamConversationRead)
    private readonly reads: Repository<ConnecteamConversationRead>,
    @InjectRepository(ConnecteamWebhookEvent)
    private readonly webhookEvents: Repository<ConnecteamWebhookEvent>,
    @Optional() private readonly chatGateway?: ConnecteamChatGateway,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureReadsTable();
    // Heal messages dropped by older servers / TypeORM length bugs.
    void this.replayMissedChatMessages().catch((e) =>
      this.logger.warn(`Startup chat replay failed: ${(e as Error).message}`),
    );
  }

  /**
   * ponytail: if another host stored the webhook but failed to upsert the message
   * (e.g. ExternalMessageId nvarchar(64)), re-apply from Connecteam_WebhookEvents.
   * Ceiling: last 150 message_created events every 2 minutes.
   */
  @Cron('*/2 * * * *', { name: 'connecteam-chat-replay' })
  async replayMissedChatMessages(): Promise<{ scanned: number; replayed: number }> {
    if (this.replayRunning) return { scanned: 0, replayed: 0 };
    this.replayRunning = true;
    let scanned = 0;
    let replayed = 0;
    try {
      const rows = await this.webhookEvents.find({
        where: { eventType: 'message_created' },
        order: { receivedAt: 'DESC' },
        take: 150,
      });
      for (const row of rows) {
        if (!row.payloadJson) continue;
        let payload: ConnecteamWebhookPayload;
        try {
          payload = JSON.parse(row.payloadJson) as ConnecteamWebhookPayload;
        } catch {
          continue;
        }
        const msg = (payload.data as { message?: { id?: string } } | undefined)?.message;
        if (!msg?.id) continue;
        scanned++;
        const externalId = String(msg.id);
        const existing: Array<{ x: number }> = await this.messages.query(
          `SELECT 1 AS x FROM dbo.Connecteam_Messages WHERE ExternalMessageId = @0`,
          [externalId],
        );
        if (existing.length) continue;
        const result = await this.processWebhook(payload);
        if (result.handled) replayed++;
      }
      if (replayed > 0) {
        this.logger.log(`Connecteam chat replay: restored ${replayed}/${scanned} missed messages`);
      }
      return { scanned, replayed };
    } finally {
      this.replayRunning = false;
    }
  }
  skipSystemMessages(): boolean {
    return this.config.get<string>('CONNECTEAM_CHAT_SKIP_SYSTEM', 'true') !== 'false';
  }

  skippedSources(): Set<string> {
    const raw = (this.config.get<string>('CONNECTEAM_CHAT_SKIP_SOURCES') ?? 'helpDesk,connecteamTips').trim();
    return new Set(raw.split(',').map((s) => s.trim()).filter(Boolean));
  }

  /** Inbox noise: Connecteam auto clock-out DMs titled "Time & Attendance", etc. */
  skippedTitles(): Set<string> {
    const raw = (this.config.get<string>('CONNECTEAM_CHAT_SKIP_TITLES') ?? 'Time & Attendance').trim();
    return new Set(raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));
  }

  isSkippedConversationTitle(title: string | null | undefined): boolean {
    const t = (title ?? '').trim().toLowerCase();
    return Boolean(t) && this.skippedTitles().has(t);
  }

  /**
   * Attach unreadCount to enriched conversation rows for the dashboard user.
   * Own messages (appUserId / linked Connecteam userId) never count.
   */
  async withUnreadCounts<T extends { conversationId: string }>(
    appUserId: number,
    conversations: T[],
  ): Promise<Array<T & { unreadCount: number }>> {
    if (!conversations.length) return [];
    const counts = await this.unreadCountsByConversation(
      appUserId,
      conversations.map((c) => c.conversationId),
    );
    return conversations.map((c) => ({
      ...c,
      unreadCount: counts.get(c.conversationId) ?? 0,
    }));
  }

  async totalUnreadForUser(appUserId: number): Promise<number> {
    await this.ensureReadsTable();
    const connecteamUserId = await this.linkedConnecteamUserId(appUserId);
    const skipTitles = [...this.skippedTitles()];
    const qb = this.messages
      .createQueryBuilder('m')
      .innerJoin(ConnecteamConversation, 'c', 'c.conversationId = m.conversationId')
      .leftJoin(
        ConnecteamConversationRead,
        'r',
        'r.conversationId = m.conversationId AND r.appUserId = :appUserId',
        { appUserId },
      )
      .where('c.isDeleted = 0')
      .andWhere('m.isDeleted = 0')
      .andWhere('m.sentAt > COALESCE(r.lastReadAt, :epoch)', { epoch: UNREAD_EPOCH })
      .andWhere('(m.appUserId IS NULL OR m.appUserId <> :appUserId)', { appUserId });
    if (connecteamUserId != null) {
      qb.andWhere('(m.userId IS NULL OR m.userId <> :ctUserId)', { ctUserId: connecteamUserId });
    }
    if (skipTitles.length) {
      qb.andWhere(
        `(c.title IS NULL OR LOWER(LTRIM(RTRIM(c.title))) NOT IN (${skipTitles
          .map((_, i) => `:st${i}`)
          .join(',')}))`,
        Object.fromEntries(skipTitles.map((t, i) => [`st${i}`, t])),
      );
    }
    return qb.getCount();
  }

  /** Last conversations + unread total for a role dashboard. Empty if chat tables are missing. */
  async inboxPreview(
    appUserId: number,
    limit = 8,
  ): Promise<{
    totalUnread: number;
    items: Array<{
      conversationId: string;
      title: string | null;
      type: string | null;
      lastMessageAt: string | null;
      lastMessagePreview: string | null;
      lastMessageSenderName: string | null;
      unreadCount: number;
    }>;
  }> {
    try {
      const totalUnread = await this.totalUnreadForUser(appUserId);
      const skipTitles = [...this.skippedTitles()];
      const qb = this.conversations.createQueryBuilder('c').where('c.isDeleted = 0');
      if (skipTitles.length) {
        qb.andWhere(
          `(c.title IS NULL OR LOWER(LTRIM(RTRIM(c.title))) NOT IN (${skipTitles
            .map((_, i) => `:st${i}`)
            .join(',')}))`,
          Object.fromEntries(skipTitles.map((t, i) => [`st${i}`, t])),
        );
      }
      qb.orderBy('c.lastMessageAt', 'DESC').take(Math.max(1, Math.min(20, limit)));
      const rows = await qb.getMany();
      const withUnread = await this.withUnreadCounts(
        appUserId,
        rows.map((c) => ({
          conversationId: c.conversationId,
          title: c.title,
          type: c.type,
          lastMessageAt: c.lastMessageAt,
          lastMessagePreview: c.lastMessagePreview,
          lastMessageSenderName: c.lastMessageSenderName,
        })),
      );
      withUnread.sort((a, b) => {
        const ur = (b.unreadCount > 0 ? 1 : 0) - (a.unreadCount > 0 ? 1 : 0);
        if (ur) return ur;
        const at = a.lastMessageAt instanceof Date ? a.lastMessageAt.getTime() : 0;
        const bt = b.lastMessageAt instanceof Date ? b.lastMessageAt.getTime() : 0;
        return bt - at;
      });
      return {
        totalUnread,
        items: withUnread.map((c) => ({
          conversationId: c.conversationId,
          title: c.title,
          type: c.type,
          lastMessageAt:
            c.lastMessageAt instanceof Date ? c.lastMessageAt.toISOString() : (c.lastMessageAt as string | null),
          lastMessagePreview: c.lastMessagePreview,
          lastMessageSenderName: c.lastMessageSenderName,
          unreadCount: c.unreadCount,
        })),
      };
    } catch (e) {
      this.logger.warn(`inboxPreview failed: ${(e as Error).message}`);
      return { totalUnread: 0, items: [] };
    }
  }

  async markConversationRead(
    appUserId: number,
    conversationId: string,
    messageId?: string | null,
  ): Promise<{
    conversationId: string;
    lastReadMessageId: string | null;
    lastReadAt: string;
    unreadCount: number;
    totalUnread: number;
  }> {
    await this.ensureReadsTable();
    const conv = await this.conversations.findOne({ where: { conversationId } });
    if (!conv || conv.isDeleted) throw new NotFoundException('Conversation not found');

    let target: ConnecteamMessage | null = null;
    if (messageId?.trim()) {
      target = await this.messages.findOne({
        where: { conversationId, messageId: messageId.trim() },
      });
      if (!target) throw new NotFoundException('Message not found in this conversation');
    } else {
      target = await this.messages.findOne({
        where: { conversationId, isDeleted: false },
        order: { sentAt: 'DESC', messageId: 'DESC' },
      });
    }

    const lastReadAt = target?.sentAt ?? new Date();
    const lastReadMessageId = target ? String(target.messageId) : null;

    let row = await this.reads.findOne({ where: { appUserId, conversationId } });
    if (!row) {
      row = this.reads.create({
        appUserId,
        conversationId,
        lastReadAt,
        lastReadMessageId,
        updatedAt: new Date(),
      });
      await this.reads.save(row);
    } else if (row.lastReadAt.getTime() <= lastReadAt.getTime()) {
      // Only move cursor forward (multi-device: later read wins).
      row.lastReadAt = lastReadAt;
      row.lastReadMessageId = lastReadMessageId;
      row.updatedAt = new Date();
      await this.reads.save(row);
    }

    const unreadCount = (await this.unreadCountsByConversation(appUserId, [conversationId])).get(
      conversationId,
    ) ?? 0;
    const totalUnread = await this.totalUnreadForUser(appUserId);
    this.chatGateway?.emitUnreadUpdated(appUserId, { conversationId, unreadCount, totalUnread });
    return {
      conversationId,
      lastReadMessageId: row.lastReadMessageId,
      lastReadAt: row.lastReadAt.toISOString(),
      unreadCount,
      totalUnread,
    };
  }

  /** After a live message, push per-user unread badges to connected sockets (skip sender). */
  async notifyUnreadAfterMessage(conversationId: string, message: ConnecteamMessage): Promise<void> {
    if (!this.chatGateway) return;
    const conv = await this.conversations.findOne({ where: { conversationId } });
    if (conv && this.isSkippedConversationTitle(conv.title)) return;

    const connected = await this.chatGateway.connectedAppUserIds();
    if (!connected.length) return;

    const senderAppUserId = message.appUserId != null && message.appUserId > 0 ? message.appUserId : null;
    let senderCtUserId = message.userId != null && message.userId > 0 ? message.userId : null;
    // Resolve Connecteam→app link so webhook senders don't get their own badge.
    const linkedAppByCt =
      senderCtUserId != null
        ? await this.users.findOne({ where: { userId: senderCtUserId } })
        : null;
    const linkedSenderAppId = linkedAppByCt?.appUserId ?? null;

    for (const appUserId of connected) {
      if (senderAppUserId != null && appUserId === senderAppUserId) continue;
      if (linkedSenderAppId != null && appUserId === linkedSenderAppId) continue;
      const unreadCount =
        (await this.unreadCountsByConversation(appUserId, [conversationId])).get(conversationId) ??
        0;
      const totalUnread = await this.totalUnreadForUser(appUserId);
      this.chatGateway.emitUnreadUpdated(appUserId, { conversationId, unreadCount, totalUnread });
    }
  }

  private async unreadCountsByConversation(
    appUserId: number,
    conversationIds: string[],
  ): Promise<Map<string, number>> {
    await this.ensureReadsTable();
    const out = new Map<string, number>();
    const unique = [...new Set(conversationIds.filter(Boolean))];
    for (const id of unique) out.set(id, 0);
    if (!unique.length) return out;

    const connecteamUserId = await this.linkedConnecteamUserId(appUserId);
    const qb = this.messages
      .createQueryBuilder('m')
      .select('m.conversationId', 'conversationId')
      .addSelect('COUNT(*)', 'cnt')
      .leftJoin(
        ConnecteamConversationRead,
        'r',
        'r.conversationId = m.conversationId AND r.appUserId = :appUserId',
        { appUserId },
      )
      .where('m.conversationId IN (:...ids)', { ids: unique })
      .andWhere('m.isDeleted = 0')
      .andWhere('m.sentAt > COALESCE(r.lastReadAt, :epoch)', { epoch: UNREAD_EPOCH })
      .andWhere('(m.appUserId IS NULL OR m.appUserId <> :appUserId)', { appUserId });
    if (connecteamUserId != null) {
      qb.andWhere('(m.userId IS NULL OR m.userId <> :ctUserId)', { ctUserId: connecteamUserId });
    }
    qb.groupBy('m.conversationId');

    const rows = await qb.getRawMany<{ conversationId: string; cnt: string | number }>();
    for (const row of rows) {
      out.set(String(row.conversationId), Number(row.cnt) || 0);
    }
    return out;
  }

  private async linkedConnecteamUserId(appUserId: number): Promise<number | null> {
    const u = await this.users.findOne({ where: { appUserId } });
    return u?.userId ?? null;
  }

  private async ensureReadsTable(): Promise<void> {
    if (this.readsTableReady) return;
    try {
      await this.reads.query(`
        IF OBJECT_ID('dbo.Connecteam_ConversationReads', 'U') IS NULL
        BEGIN
          CREATE TABLE dbo.Connecteam_ConversationReads (
            AppUserId int NOT NULL,
            ConversationId nvarchar(64) NOT NULL,
            LastReadMessageId bigint NULL,
            LastReadAt datetime2 NOT NULL,
            UpdatedAt datetime2 NOT NULL CONSTRAINT DF_Connecteam_ConversationReads_UpdatedAt DEFAULT SYSUTCDATETIME(),
            CONSTRAINT PK_Connecteam_ConversationReads PRIMARY KEY (AppUserId, ConversationId)
          );
          CREATE INDEX IX_Connecteam_ConversationReads_Conv
            ON dbo.Connecteam_ConversationReads(ConversationId);
        END
      `);
      this.readsTableReady = true;
    } catch (e) {
      this.logger.warn(`Connecteam_ConversationReads ensure failed: ${(e as Error).message}`);
    }
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
      if (this.isSkippedConversationTitle(conv.title ?? null)) {
        await this.markConversationDeleted(String(conv.id));
        return { handled: true, detail: 'skipped_title' };
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
    // Fire-and-forget unread badges for other connected users.
    void this.notifyUnreadAfterMessage(conversationId, message).catch((e) =>
      this.logger.warn(`Unread notify failed: ${(e as Error).message}`),
    );
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

  private async shouldSkipMessage(msg: ConnecteamWebhookMessage): Promise<boolean> {
    if (msg.isSystem && this.skipSystemMessages()) return true;
    const src = (msg.conversationSource ?? '').trim();
    if (src && this.skippedSources().has(src)) return true;

    // Connecteam clock-out bots set isSystem=false + source=app — filter by content / title.
    const body = (msg.content ?? '').toLowerCase();
    if (
      body.includes('shift ended automatically') ||
      body.includes('turno terminó automáticamente') ||
      body.includes('turno programado finalizó') ||
      body.includes('scheduled shift ended automatically')
    ) {
      return true;
    }

    const conversationId = msg.conversationId ? this.conversationKeyFor(msg) : null;
    if (conversationId) {
      const conv = await this.conversations.findOne({ where: { conversationId } });
      if (conv && this.isSkippedConversationTitle(conv.title)) return true;
    }
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
    if (await this.shouldSkipMessage(msg)) return;

    const conversationId = this.conversationKeyFor(msg);
    const externalId = String(msg.id);
    const body = this.formatMessageBody(msg) || '(empty)';
    const sentAt = unixSecondsToDate(msg.createdAt) ?? new Date();
    const modifiedAt = unixSecondsToDate(msg.modifiedAt);
    const userId = msg.senderId != null && msg.senderId > 0 ? msg.senderId : null;
    const messageType = msg.type ?? null;
    const attachmentsJson = msg.attachments?.length ? JSON.stringify(msg.attachments) : null;

    const dmTitle = await this.privateThreadTitle(msg, conversationId);
    await this.ensureConversationStub(
      conversationId,
      msg.conversationType ?? null,
      msg.conversationSource ?? null,
      dmTitle,
    );

    // Raw SQL: TypeORM nvarchar(length) binding previously dropped Connecteam composite ids (~73).
    const existing: Array<{ MessageId: string }> = await this.messages.query(
      `SELECT MessageId FROM dbo.Connecteam_Messages WHERE ConversationId = @0 AND ExternalMessageId = @1`,
      [conversationId, externalId],
    );

    if (existing.length) {
      await this.updateMessageRow(existing[0].MessageId, body, userId, messageType, attachmentsJson, modifiedAt, sentAt);
    } else {
      try {
        await this.messages.query(
          `INSERT INTO dbo.Connecteam_Messages
             (ConversationId, UserId, AppUserId, Body, SentAt, RecordSource, ExternalMessageId, IsDeleted, MessageType, AttachmentsJson, ModifiedAt)
           VALUES (@0, @1, NULL, @2, @3, 'sync', @4, 0, @5, @6, @7)`,
          [conversationId, userId, body, sentAt, externalId, messageType, attachmentsJson, modifiedAt],
        );
      } catch (e) {
        // Lost a race with another concurrent upsert (webhook vs. replay cron) for the same
        // ExternalMessageId — the other caller already inserted it; update instead.
        if (!this.isDuplicateKeyError(e)) throw e;
        const winner: Array<{ MessageId: string }> = await this.messages.query(
          `SELECT MessageId FROM dbo.Connecteam_Messages WHERE ConversationId = @0 AND ExternalMessageId = @1`,
          [conversationId, externalId],
        );
        if (winner.length) {
          await this.updateMessageRow(winner[0].MessageId, body, userId, messageType, attachmentsJson, modifiedAt, sentAt);
        }
      }
    }

    const row = await this.messages.findOne({
      where: { conversationId, externalMessageId: externalId },
    });
    if (!row) {
      this.logger.warn(`Webhook message upsert missing after write: ${externalId.slice(0, 48)}`);
      return;
    }
    await this.refreshConversationPreview(conversationId, row);
    await this.emitMessageLive(conversationId, row);
  }

  private async updateMessageRow(
    messageId: string,
    body: string,
    userId: number | null,
    messageType: string | null,
    attachmentsJson: string | null,
    modifiedAt: Date | null,
    sentAt: Date,
  ): Promise<void> {
    await this.messages.query(
      `UPDATE dbo.Connecteam_Messages
       SET Body = @0,
           UserId = COALESCE(@1, UserId),
           MessageType = COALESCE(@2, MessageType),
           AttachmentsJson = COALESCE(@3, AttachmentsJson),
           ModifiedAt = @4,
           IsDeleted = 0,
           SentAt = @5
       WHERE MessageId = @6`,
      [body, userId, messageType, attachmentsJson, modifiedAt, sentAt, messageId],
    );
  }

  private isDuplicateKeyError(e: unknown): boolean {
    const err = e as { number?: number; code?: string; message?: string } | undefined;
    if (err?.number === 2627 || err?.number === 2601) return true;
    return typeof err?.message === 'string' && err.message.includes('Cannot insert duplicate key row');
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
