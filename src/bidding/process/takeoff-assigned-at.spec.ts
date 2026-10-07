import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { emptyProcess, stampTakeoffAssignedAt, type BidProcess, type TakeoffAssignment } from './bid-process';

function withRows(rows: Partial<TakeoffAssignment>[]): BidProcess {
  const p = emptyProcess();
  p.takeoffAssignments = rows.map((r) => ({
    role: 'duct1',
    assigneeName: null,
    assignedAt: null,
    dueAt: null,
    status: null,
    hoursSpent: null,
    notes: null,
    finalQuantity: null,
    reviewedBy: null,
    versions: [],
    ...r,
  }));
  return p;
}

test('new assignee gets today as assignedAt', () => {
  const after = withRows([{ role: 'duct1', assigneeName: 'Test Captain' }]);
  stampTakeoffAssignedAt(emptyProcess(), after, '2026-09-24');
  assert.equal(after.takeoffAssignments[0].assignedAt, '2026-09-24');
});

test('same assignee keeps the original assignedAt, even if the client drops it', () => {
  const before = withRows([{ role: 'duct1', assigneeName: 'Test Captain', assignedAt: '2026-09-01' }]);
  const after = withRows([{ role: 'duct1', assigneeName: 'test captain ', dueAt: '2026-09-30' }]);
  stampTakeoffAssignedAt(before, after, '2026-09-24');
  assert.equal(after.takeoffAssignments[0].assignedAt, '2026-09-01');
});

test('reassigning restamps; clearing the assignee clears assignedAt', () => {
  const before = withRows([
    { role: 'duct1', assigneeName: 'Test Captain', assignedAt: '2026-09-01' },
    { role: 'plumbing1', assigneeName: 'Sarah Jones', assignedAt: '2026-09-01' },
  ]);
  const after = withRows([
    { role: 'duct1', assigneeName: 'John Smith', assignedAt: '2026-09-01' },
    { role: 'plumbing1', assigneeName: '', assignedAt: '2026-09-01' },
  ]);
  stampTakeoffAssignedAt(before, after, '2026-09-24');
  assert.equal(after.takeoffAssignments[0].assignedAt, '2026-09-24');
  assert.equal(after.takeoffAssignments[1].assignedAt, null);
});
