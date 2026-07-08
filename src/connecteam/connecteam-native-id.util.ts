import { randomUUID } from 'crypto';

/** IDs created by our workforce API — never collide with Connecteam sync IDs. */
export function nativeConnecteamId(): string {
  return `app-${randomUUID()}`;
}

export function isNativeConnecteamId(id: string): boolean {
  return id.startsWith('app-');
}

/**
 * Direct-message threads are keyed by the other participant's Connecteam userId
 * (`dm-<userId>`), because Connecteam's privateMessage API never returns a
 * conversation id — we always address DMs by user, both inbound and outbound.
 */
export function dmConversationId(userId: number): string {
  return `dm-${userId}`;
}

export function dmTargetUserId(conversationId: string): number | null {
  const m = /^dm-(\d+)$/.exec(conversationId);
  return m ? Number(m[1]) : null;
}

export type ConnecteamRecordSource = 'sync' | 'native';
