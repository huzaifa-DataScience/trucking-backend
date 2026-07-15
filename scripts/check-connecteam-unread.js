// ponytail: unread rules — own messages never count; sentAt must be after lastReadAt.
function countUnread(opts) {
  const epoch = new Date('1970-01-01T00:00:00.000Z');
  const cursor = opts.lastReadAt ?? epoch;
  return opts.messages.filter((m) => {
    if (m.isDeleted) return false;
    if (!(m.sentAt > cursor)) return false;
    if (m.appUserId != null && m.appUserId === opts.readerAppUserId) return false;
    if (
      opts.readerConnecteamUserId != null &&
      m.userId != null &&
      m.userId === opts.readerConnecteamUserId
    ) {
      return false;
    }
    return true;
  }).length;
}

const t0 = new Date('2026-07-15T10:00:00Z');
const t1 = new Date('2026-07-15T11:00:00Z');
const t2 = new Date('2026-07-15T12:00:00Z');
const msgs = [
  { sentAt: t0, appUserId: null, userId: 10, isDeleted: false },
  { sentAt: t1, appUserId: 1, userId: 99, isDeleted: false },
  { sentAt: t2, appUserId: null, userId: 20, isDeleted: false },
  { sentAt: t2, appUserId: null, userId: 20, isDeleted: true },
];

const neverRead = countUnread({
  lastReadAt: null,
  messages: msgs,
  readerAppUserId: 1,
  readerConnecteamUserId: 99,
});
if (neverRead !== 2) throw new Error(`expected 2 unread when never read, got ${neverRead}`);

const afterT0 = countUnread({
  lastReadAt: t0,
  messages: msgs,
  readerAppUserId: 1,
  readerConnecteamUserId: 99,
});
if (afterT0 !== 1) throw new Error(`expected 1 unread after t0, got ${afterT0}`);

const ownViaCt = countUnread({
  lastReadAt: null,
  messages: [{ sentAt: t1, appUserId: null, userId: 99 }],
  readerAppUserId: 1,
  readerConnecteamUserId: 99,
});
if (ownViaCt !== 0) throw new Error('own Connecteam userId must not count');

console.log('ok: unread count rules');
