import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { ForbiddenException, HttpException, NotFoundException } from '@nestjs/common';
import { emptyProcess, type BidProcess } from '../bidding/process/bid-process';
import { CalendarService } from './calendar.service';
import {
  bidCalendarItems,
  bidRolesFor,
  jsonIds,
  parseRange,
  sortItems,
  type BidRowForCalendar,
  type CalendarItem,
  type PersonRef,
} from './calendar.util';

const MIKE: PersonRef = { id: 7, firstName: 'Mike', lastName: 'Roberts', email: 'mike@goel.test', bidTeamId: 3 };
const RANGE = { from: '2026-09-01', to: '2026-09-30' };

function bid(patch: (p: BidProcess) => void, extra: Partial<BidRowForCalendar> = {}): BidRowForCalendar {
  const process = emptyProcess();
  patch(process);
  return {
    id: 42,
    estimateNumber: 'IDC6098',
    bidName: 'Main St Tower',
    processStage: 'takeoff',
    outcomeStatus: 'open',
    bidDate: null,
    submitDate: null,
    createdByUserId: null,
    clientCompanyName: 'Acme GC',
    teamName: 'Team A',
    process,
    ...extra,
  };
}

// ── Who is on the bid ─────────────────────────────────────────────────────────

test('bid roles: matched by user id, name, alias, email and team', () => {
  assert.deepEqual(bidRolesFor(MIKE, bid((p) => (p.assignment.captainUserId = 7))), ['Captain']);
  assert.deepEqual(bidRolesFor(MIKE, bid((p) => (p.assignment.assistantEstimator = '  mike   ROBERTS '))), ['Assistant estimator']);
  // Existing crew alias table: "Mike Robberts" is a known typo.
  assert.deepEqual(bidRolesFor(MIKE, bid((p) => (p.intelligence.followUpOwner = 'Mike Robberts'))), ['Follow-up owner']);
  assert.deepEqual(bidRolesFor(MIKE, bid((p) => (p.additionalDetails.takeOffPerson2 = 'mike@goel.test'))), ['Takeoff']);
  assert.deepEqual(bidRolesFor(MIKE, bid((p) => (p.assignment.teamId = 3))), ['Team']);
  assert.deepEqual(bidRolesFor(MIKE, bid(() => {}, { createdByUserId: 7 })), ['Created bid']);
});

test('bid roles: someone else\'s bid is not on the calendar', () => {
  const other = bid((p) => {
    p.assignment.captain = 'Sarah Jones';
    p.assignment.teamId = 9;
    p.dueDate = '2026-09-24';
  });
  assert.deepEqual(bidRolesFor(MIKE, other), []);
  assert.deepEqual(bidCalendarItems(other, MIKE, RANGE), []);
  // A partial name is not a match.
  assert.deepEqual(bidRolesFor(MIKE, bid((p) => (p.assignment.captain = 'Mike'))), []);
});

// ── Which dates show up ──────────────────────────────────────────────────────

test('bid milestones become items, with the bid info attached', () => {
  const b = bid((p) => {
    p.assignment.captainUserId = 7;
    p.dueDate = '2026-09-24';
    p.dueTime = '14:00';
    p.assignment.internalReviewDue = '2026-09-20';
    p.additionalDetails.preBidDate = '2026-09-05';
    p.intelligence.followUpCalls = [
      { id: 'c1', companyName: 'Acme GC', contactName: 'Jo', phone: '555', callAttempts: [{ ordinal: 1, dateOfCall: '2026-09-26', remarks: 'Left VM' }] },
    ];
    p.schedule.expectedStart = '2027-01-10'; // out of range
  });
  const items = bidCalendarItems(b, MIKE, RANGE);
  const byKind = new Map(items.map((i) => [i.kind, i]));

  assert.deepEqual([...byKind.keys()].sort(), ['bid_due', 'follow_up_call', 'internal_review_due', 'pre_bid']);
  const due = byKind.get('bid_due')!;
  assert.equal(due.start, '2026-09-24T14:00');
  assert.equal(due.allDay, false);
  assert.equal(due.title, 'Bid due — IDC6098 · Main St Tower');
  assert.deepEqual(due.bid?.roles, ['Captain']);
  assert.equal(due.bid?.clientCompanyName, 'Acme GC');
  assert.equal(due.editable, false);

  assert.equal(byKind.get('pre_bid')!.allDay, true);
  assert.equal(byKind.get('pre_bid')!.start, '2026-09-05');
  assert.deepEqual(byKind.get('follow_up_call')!.details.map((d) => d.label), ['Contact', 'Phone', 'Remarks']);
});

test('takeoff due dates are personal: only the assignee sees their own', () => {
  const b = bid((p) => {
    p.takeoffAssignments = [
      { role: 'duct1', assigneeName: 'Mike Roberts', assignedAt: '2026-09-02', dueAt: '2026-09-10T17:00:00', status: 'in_progress', hoursSpent: 4, notes: null, finalQuantity: null, reviewedBy: null, versions: [] },
      { role: 'duct2', assigneeName: 'Sarah Jones', assignedAt: '2026-09-02', dueAt: '2026-09-11', status: null, hoursSpent: null, notes: null, finalQuantity: null, reviewedBy: null, versions: [] },
    ] as BidProcess['takeoffAssignments'];
  });
  const items = bidCalendarItems(b, MIKE, RANGE).filter((i) => i.source === 'takeoff');
  assert.deepEqual(items.map((i) => [i.kind, i.start]), [
    ['takeoff_assigned', '2026-09-02'],
    ['takeoff_due', '2026-09-10T17:00'],
  ]);
  assert.ok(items.every((i) => i.title.includes('duct1')));
});

test('bad or empty dates are skipped, not shown as garbage', () => {
  const b = bid((p) => {
    p.assignment.captainUserId = 7;
    p.dueDate = 'TBD';
    p.assignment.internalEstimateDue = '';
    p.dueTime = '99:99';
    p.award.awardDate = '2026-09-15';
  });
  assert.deepEqual(bidCalendarItems(b, MIKE, RANGE).map((i) => i.kind), ['awarded']);
});

test('parseRange validates and caps the window', () => {
  assert.deepEqual(parseRange('2026-09-01', '2026-09-30'), RANGE);
  assert.equal(parseRange('2026-09-30', '2026-09-01'), null);
  assert.equal(parseRange('2026-9-1', '2026-09-30'), null);
  assert.equal(parseRange('2026-09-01', '2028-01-01'), null);
  assert.equal(parseRange(undefined, undefined), null);
});

test('helpers: jsonIds tolerates bad JSON; sortItems puts all-day first', () => {
  assert.deepEqual(jsonIds('[1,"2",null]'), [1, 2]);
  assert.deepEqual(jsonIds('not json'), []);
  const mk = (id: string, start: string, allDay: boolean) => ({ id, start, allDay, title: id }) as CalendarItem;
  const sorted = sortItems([mk('b', '2026-09-02T09:00:00Z', false), mk('a', '2026-09-02', true), mk('c', '2026-09-01', true)]);
  assert.deepEqual(sorted.map((i) => i.id), ['c', 'a', 'b']);
});

// ── Access control ───────────────────────────────────────────────────────────

function service(opts: { events?: any[] } = {}) {
  const users = [
    { id: 7, email: 'mike@goel.test', firstName: 'Mike', lastName: 'Roberts', role: 'captain', status: 'active' },
    { id: 8, email: 'sarah@goel.test', firstName: 'Sarah', lastName: 'Jones', role: 'assistant_estimator', status: 'active' },
  ];
  const events = opts.events ?? [];
  const usersRepo = {
    findOne: async ({ where }: any) => users.find((u) => u.id === where.id) ?? null,
    find: async () => users,
  };
  const eventsRepo = {
    findOne: async ({ where }: any) => events.find((e) => e.id === where.id && e.ownerUserId === where.ownerUserId) ?? null,
    delete: async () => undefined,
    save: async (r: any) => r,
  };
  const bidsRepo = { exists: async () => false };
  const none = {} as any;
  return new CalendarService(usersRepo as any, bidsRepo as any, none, eventsRepo as any, none, none, none, none, none);
}

const CAPTAIN = { id: 7, role: 'captain' };
const ADMIN = { id: 1, role: 'admin' };

test('people see only their own calendar; admins can open anyone\'s', async () => {
  const svc = service();
  assert.equal((await svc.resolvePerson(CAPTAIN)).id, 7);
  assert.equal((await svc.resolvePerson(CAPTAIN, 7)).id, 7);
  await assert.rejects(svc.resolvePerson(CAPTAIN, 8), ForbiddenException);
  await assert.rejects(svc.getCalendar(CAPTAIN, { from: '2026-09-01', to: '2026-09-30', userId: 8 }), ForbiddenException);
  assert.equal((await svc.resolvePerson(ADMIN, 8)).id, 8);
  await assert.rejects(svc.resolvePerson(ADMIN, 999), NotFoundException);
});

test('only admins get the person picker', async () => {
  const svc = service();
  await assert.rejects(svc.listPeople(CAPTAIN), ForbiddenException);
  assert.deepEqual((await svc.listPeople(ADMIN)).map((p) => p.name), ['Mike Roberts', 'Sarah Jones']);
});

test('invalid range is a 400', async () => {
  await assert.rejects(service().getCalendar(CAPTAIN, { from: 'x', to: 'y' }), (e: unknown) => e instanceof HttpException && e.getStatus() === 400);
});

test('custom events: only the owner can edit or delete (others get 404)', async () => {
  const svc = service({ events: [{ id: 5, ownerUserId: 8, title: 'Sarah only' }] });
  const dto = { title: 'x', start: '2026-09-10', allDay: true };
  await assert.rejects(svc.updateEvent(CAPTAIN, 5, dto), NotFoundException);
  await assert.rejects(svc.deleteEvent(CAPTAIN, 5), NotFoundException);
  // Admins can view others' calendars but not edit their events.
  await assert.rejects(svc.deleteEvent(ADMIN, 5), NotFoundException);
});

test('custom events: input validation', async () => {
  const svc = service({ events: [{ id: 5, ownerUserId: 7, title: 'Mine' }] });
  const bad = (dto: any) => assert.rejects(svc.updateEvent(CAPTAIN, 5, dto), (e: unknown) => e instanceof HttpException && e.getStatus() === 400);
  await bad({ title: 'x', allDay: true, start: '2026-09-10T09:00:00Z' });
  await bad({ title: 'x', allDay: true, start: '2026-02-30' });
  await bad({ title: 'x', allDay: false, start: '2026-09-10' });
  await bad({ title: 'x', allDay: false, start: '2026-09-10T10:00:00Z', end: '2026-09-10T09:00:00Z' });
  await bad({ title: 'x', allDay: true, start: '2026-09-10', bidId: 12345 });
});
