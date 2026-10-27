/** Straight-line distance in metres between two points (haversine). */
export function distanceM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Within this many metres an office counts as "here" even when the browser claims better accuracy. */
export const MIN_MATCH_RADIUS_M = 150;

export type NearbyOffice = { id: number; name: string; distanceM: number };

/**
 * Offices nearest first, with the one to pre-select: the nearest, if it is inside
 * the browser's accuracy circle (at least 150 m). Otherwise none, and the person picks.
 */
export function rankOffices(
  offices: Array<{ id: number; name: string; latitude: number; longitude: number }>,
  at: { latitude: number; longitude: number; accuracy: number },
): { offices: NearbyOffice[]; suggestedId: number | null } {
  const ranked = offices
    .map((o) => ({ id: o.id, name: o.name, distanceM: Math.round(distanceM(at.latitude, at.longitude, o.latitude, o.longitude)) }))
    .sort((a, b) => a.distanceM - b.distanceM || a.name.localeCompare(b.name));
  const limit = Math.max(at.accuracy, MIN_MATCH_RADIUS_M);
  const first = ranked[0];
  return { offices: ranked, suggestedId: first && first.distanceM <= limit ? first.id : null };
}
