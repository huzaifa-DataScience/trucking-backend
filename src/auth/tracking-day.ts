/**
 * Turns one person's location pings into stretches of tracked time.
 * The app pings every ~2 minutes while open. A gap longer than STOP_AFTER_MIN means
 * tracking stopped: that stretch ends at its last ping, and the clock stops there.
 */

export const PING_EVERY_MIN = 2;
export const STOP_AFTER_MIN = 10;

export type Ping = { latitude: number; longitude: number; accuracyM: number; at: Date };

export type Stretch = { start: string; end: string; minutes: number };

export type TrackingDay = {
  stretches: Stretch[];
  trackedMinutes: number;
  /** Still sending pings (last one within STOP_AFTER_MIN of now). */
  live: boolean;
  lastPingAt: string | null;
  last: { latitude: number; longitude: number; accuracyM: number } | null;
  trail: Array<{ latitude: number; longitude: number; accuracyM: number; at: string }>;
};

const MIN = 60_000;

export function buildTrackingDay(pings: Ping[], now: Date): TrackingDay {
  const sorted = [...pings].sort((a, b) => a.at.getTime() - b.at.getTime());
  const stretches: Stretch[] = [];
  let start: Date | null = null;
  let prev: Date | null = null;
  const close = () => {
    if (start && prev) {
      stretches.push({ start: start.toISOString(), end: prev.toISOString(), minutes: Math.round((prev.getTime() - start.getTime()) / MIN) });
    }
  };
  for (const p of sorted) {
    if (prev && p.at.getTime() - prev.getTime() > STOP_AFTER_MIN * MIN) {
      close();
      start = null;
    }
    if (!start) start = p.at;
    prev = p.at;
  }
  close();
  const lastPing = sorted[sorted.length - 1] ?? null;
  return {
    stretches,
    trackedMinutes: stretches.reduce((n, s) => n + s.minutes, 0),
    live: lastPing != null && now.getTime() - lastPing.at.getTime() <= STOP_AFTER_MIN * MIN,
    lastPingAt: lastPing ? lastPing.at.toISOString() : null,
    last: lastPing ? { latitude: lastPing.latitude, longitude: lastPing.longitude, accuracyM: lastPing.accuracyM } : null,
    trail: sorted.map((p) => ({ latitude: p.latitude, longitude: p.longitude, accuracyM: p.accuracyM, at: p.at.toISOString() })),
  };
}
