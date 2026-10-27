import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { buildTrackingDay } from './tracking-day';

const at = (hhmm: string) => new Date(`2026-10-27T${hhmm}:00Z`);
const ping = (hhmm: string) => ({ latitude: 31.47, longitude: 74.27, accuracyM: 30, at: at(hhmm) });

test('pings 2 minutes apart make one stretch; a long gap stops the clock', () => {
  const d = buildTrackingDay([ping('09:00'), ping('09:02'), ping('09:04'), ping('09:30'), ping('09:32')], at('12:00'));
  assert.deepEqual(
    d.stretches.map((s) => [s.start.slice(11, 16), s.end.slice(11, 16), s.minutes]),
    [
      ['09:00', '09:04', 4],
      ['09:30', '09:32', 2],
    ],
  );
  assert.equal(d.trackedMinutes, 6);
  assert.equal(d.live, false);
  assert.equal(d.lastPingAt?.slice(11, 16), '09:32');
});

test('a gap of exactly 10 minutes still counts as the same stretch', () => {
  const d = buildTrackingDay([ping('09:00'), ping('09:10')], at('09:15'));
  assert.equal(d.stretches.length, 1);
  assert.equal(d.trackedMinutes, 10);
  assert.equal(d.live, true);
});

test('pings arriving out of order are sorted; no pings = nothing tracked', () => {
  const d = buildTrackingDay([ping('09:04'), ping('09:00'), ping('09:02')], at('09:05'));
  assert.equal(d.trail[0].at.slice(11, 16), '09:00');
  assert.equal(d.trackedMinutes, 4);
  const none = buildTrackingDay([], at('09:00'));
  assert.deepEqual([none.trackedMinutes, none.live, none.lastPingAt, none.last], [0, false, null, null]);
});
