import { randomUUID } from 'crypto';

/** IDs created by our workforce API — never collide with Connecteam sync IDs. */
export function nativeConnecteamId(): string {
  return `app-${randomUUID()}`;
}

export function isNativeConnecteamId(id: string): boolean {
  return id.startsWith('app-');
}

export type ConnecteamRecordSource = 'sync' | 'native';
