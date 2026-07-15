import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';

/** Room for all authenticated workforce chat subscribers. */
export const WORKFORCE_CHAT_ROOM = 'workforce-chat';

export function connecteamUserRoom(appUserId: number | string): string {
  return `connecteam-user-${appUserId}`;
}

@WebSocketGateway({
  namespace: '/connecteam-chat',
  cors: { origin: true, credentials: true },
})
export class ConnecteamChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(ConnecteamChatGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    const token = this.extractToken(client);
    if (!token) {
      this.logger.debug(`WS reject ${client.id}: missing token`);
      client.disconnect(true);
      return;
    }
    try {
      const secret = this.config.get<string>('JWT_SECRET', 'change-me-in-production');
      const payload = await this.jwt.verifyAsync<JwtPayload>(token, { secret });
      if (!payload?.sub) {
        client.disconnect(true);
        return;
      }
      client.data.userId = payload.sub;
      client.data.email = payload.email;
      await client.join(WORKFORCE_CHAT_ROOM);
      await client.join(connecteamUserRoom(payload.sub));
      this.logger.debug(`WS connected ${client.id} user=${payload.sub}`);
    } catch (e) {
      this.logger.debug(`WS reject ${client.id}: ${e instanceof Error ? e.message : e}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    this.logger.debug(`WS disconnected ${client.id}`);
  }

  emitMessage(payload: { message: unknown; conversation: unknown }): void {
    this.server?.to(WORKFORCE_CHAT_ROOM).emit('chat.message', payload);
  }

  emitMessageDeleted(payload: {
    conversationId: string;
    messageId: number | string;
    externalMessageId: string | null;
  }): void {
    this.server?.to(WORKFORCE_CHAT_ROOM).emit('chat.message_deleted', payload);
  }

  emitConversationUpdated(payload: { conversation: unknown }): void {
    this.server?.to(WORKFORCE_CHAT_ROOM).emit('chat.conversation_updated', payload);
  }

  emitUnreadUpdated(
    appUserId: number,
    payload: { conversationId: string; unreadCount: number; totalUnread: number },
  ): void {
    this.server?.to(connecteamUserRoom(appUserId)).emit('chat.unread_updated', payload);
  }

  /** App user ids currently connected to workforce chat (deduped). */
  async connectedAppUserIds(): Promise<number[]> {
    if (!this.server) return [];
    const sockets = await this.server.in(WORKFORCE_CHAT_ROOM).fetchSockets();
    const ids = new Set<number>();
    for (const s of sockets) {
      const id = Number((s.data as { userId?: number }).userId);
      if (Number.isFinite(id) && id > 0) ids.add(id);
    }
    return [...ids];
  }

  private extractToken(client: Socket): string | null {
    const fromAuth = (client.handshake?.auth as { token?: string } | undefined)?.token;
    if (typeof fromAuth === 'string' && fromAuth.trim()) return fromAuth.trim();
    const q = client.handshake?.query?.token;
    if (typeof q === 'string' && q.trim()) return q.trim();
    if (Array.isArray(q) && typeof q[0] === 'string' && q[0].trim()) return q[0].trim();
    const header = client.handshake?.headers?.authorization;
    if (typeof header === 'string' && header.toLowerCase().startsWith('bearer ')) {
      return header.slice(7).trim();
    }
    return null;
  }
}
