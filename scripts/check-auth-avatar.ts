/**
 * Self-check: profile avatarUrl path. No DB.
 * Usage: npx ts-node scripts/check-auth-avatar.ts
 */
import { userAvatarUrl } from '../src/database/entities/user.entity';

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

assert(userAvatarUrl({ id: 12, avatarPath: 'avatars/12.jpg' }) === '/auth/avatar/12', 'relative avatar url');
assert(userAvatarUrl({ id: 12, avatarPath: null }) === null, 'no file → null');
assert(userAvatarUrl({ id: 12, avatarPath: '  ' }) === null, 'blank path → null');
assert(userAvatarUrl(null) === null, 'missing user');

console.log('check-auth-avatar: ok');
