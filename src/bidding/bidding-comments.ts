/** Bid Notes thread. authorName = First Last, else email. */

import { cleanPersonName, userDisplayName, userFullName, type UserNameBits } from '../database/entities/user.entity';

export const MAX_COMMENT_IMAGES = 5;
export const COMMENT_IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export function isCommentImageMime(mime: string): boolean {
  return (COMMENT_IMAGE_MIMES as readonly string[]).includes(mime);
}

export function commentAuthor(user: (UserNameBits & { id: number; email: string }) | null | undefined): {
  authorUserId: number;
  authorName: string;
  authorEmail: string | null;
  authorFirstName: string | null;
  authorLastName: string | null;
} {
  if (!user) {
    return {
      authorUserId: 0,
      authorName: 'Unknown',
      authorEmail: null,
      authorFirstName: null,
      authorLastName: null,
    };
  }
  const email = cleanPersonName(user.email);
  return {
    authorUserId: user.id,
    authorName: userDisplayName(user),
    authorEmail: email,
    authorFirstName: cleanPersonName(user.firstName),
    authorLastName: cleanPersonName(user.lastName),
  };
}

export function mentionPerson(user: UserNameBits & { id: number; email: string }): {
  userId: number;
  firstName: string | null;
  lastName: string | null;
  name: string;
  email: string;
} {
  return {
    userId: user.id,
    firstName: cleanPersonName(user.firstName),
    lastName: cleanPersonName(user.lastName),
    name: userDisplayName(user),
    email: String(user.email ?? '').trim(),
  };
}

export function commentBody(raw: unknown): string | null {
  if (raw == null) return null;
  const t = String(raw).trim();
  return t || null;
}

export function emailLocalPart(email: string): string {
  return email.split('@')[0]?.trim().toLowerCase() || '';
}

export function mentionHandles(users: { id: number; email: string }[]): Map<number, string> {
  const counts = new Map<string, number>();
  for (const u of users) {
    const local = emailLocalPart(u.email);
    if (local) counts.set(local, (counts.get(local) ?? 0) + 1);
  }
  const out = new Map<number, string>();
  for (const u of users) {
    const email = u.email.trim().toLowerCase();
    const local = emailLocalPart(email);
    out.set(u.id, local && counts.get(local) === 1 ? local : email);
  }
  return out;
}

/** Tokens after `@` in the comment body (`@hassan` or `@hassan@goel.com`). */
export function mentionTokens(body: string | null): string[] {
  if (!body) return [];
  const found = body.match(/@([^\s]+)/g) ?? [];
  return [...new Set(found.map((t) => t.slice(1).replace(/[.,;:!?)]+$/g, '').toLowerCase()).filter(Boolean))];
}

export function resolveMentionIds(
  users: { id: number; email: string }[],
  tokens: string[],
  explicitIds: number[],
  authorId: number,
): number[] {
  const handles = mentionHandles(users);
  const byHandle = new Map<string, number>();
  for (const u of users) {
    byHandle.set(u.email.trim().toLowerCase(), u.id);
    const h = handles.get(u.id);
    if (h) byHandle.set(h, u.id);
  }
  const ids = new Set<number>();
  for (const id of explicitIds) {
    if (Number.isFinite(id) && id !== authorId) ids.add(id);
  }
  for (const t of tokens) {
    const id = byHandle.get(t);
    if (id && id !== authorId) ids.add(id);
  }
  return [...ids];
}

export function parseMentionIds(raw: unknown): number[] {
  if (raw == null || raw === '') return [];
  const arr = Array.isArray(raw) ? raw : String(raw).split(/[\s,]+/);
  return [...new Set(arr.map((x) => Math.trunc(Number(x))).filter((n) => n > 0))];
}

export function mentionQueryMatch(
  user: UserNameBits & { email: string },
  handle: string,
  q: string,
): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const hay = [
    user.email,
    emailLocalPart(user.email),
    handle,
    user.firstName,
    user.lastName,
    userFullName(user),
  ];
  return hay.some((h) => String(h ?? '').trim().toLowerCase().startsWith(needle));
}
