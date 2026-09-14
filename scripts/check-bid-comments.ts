/**
 * Self-check: bid comment author + mime guards. No DB.
 * Usage: npx ts-node scripts/check-bid-comments.ts
 */
import {
  COMMENT_IMAGE_MIMES,
  MAX_COMMENT_IMAGES,
  commentAuthor,
  commentBody,
  isCommentImageMime,
  mentionHandles,
  mentionQueryMatch,
  mentionTokens,
  parseMentionIds,
  resolveMentionIds,
} from '../src/bidding/bidding-comments';

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

assert(MAX_COMMENT_IMAGES === 5, 'max 5 images');
assert(COMMENT_IMAGE_MIMES.includes('image/png') && !isCommentImageMime('application/pdf'), 'images only');
assert(commentBody('  hi  ') === 'hi' && commentBody('   ') === null && commentBody(undefined) === null, 'body trim');
const a = commentAuthor({ id: 7, email: 'hassan@goel.com' });
assert(a.authorUserId === 7 && a.authorName === 'hassan@goel.com' && a.authorEmail === 'hassan@goel.com', 'author email fallback');
assert(a.authorFirstName === null && a.authorLastName === null, 'empty names');
const named = commentAuthor({ id: 7, email: 'hassan@goel.com', firstName: 'Hassan', lastName: 'Riaz' });
assert(named.authorName === 'Hassan Riaz' && named.authorFirstName === 'Hassan', 'author First Last');
assert(commentAuthor(null).authorName === 'Unknown', 'missing user');
assert(mentionTokens('hey @hassan see @Ali drawings')[0] === 'hassan', 'mention tokens');
const users = [
  { id: 1, email: 'ali@goel.com' },
  { id: 2, email: 'ahmad@goel.com' },
  { id: 7, email: 'hassan@goel.com' },
];
assert(mentionHandles(users).get(7) === 'hassan', 'unique handle');
assert(mentionQueryMatch({ email: 'ali@goel.com' }, 'ali', 'a'), '@a email');
assert(!mentionQueryMatch({ email: 'hassan@goel.com', firstName: 'Hassan' }, 'hassan', 'a'), '@a not Hassan');
assert(mentionQueryMatch({ email: 'x@y.com', firstName: 'Ahmad', lastName: 'Huzaifa' }, 'x', 'ah'), '@ah firstName');
assert(mentionQueryMatch({ email: 'x@y.com', lastName: 'Riaz' }, 'x', 'ri'), '@ri lastName');
assert(resolveMentionIds(users, ['hassan'], [], 1).includes(7), 'resolve @hassan');
assert(!resolveMentionIds(users, ['hassan'], [], 7).includes(7), 'no self mention');
assert(parseMentionIds('7,2')[0] === 7 && parseMentionIds(['2']).includes(2), 'explicit ids');

console.log('check-bid-comments: ok');
