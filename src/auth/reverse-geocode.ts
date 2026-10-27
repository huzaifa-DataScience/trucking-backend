/**
 * Coordinates → short readable address, via OpenStreetMap Nominatim (free, no key).
 * Their rules: identify the app in User-Agent, at most one request a second; sign-ins are well under that.
 */

type NominatimAddress = Record<string, string | undefined>;

/** "Shine SEO, 12 Araien Rd, Block G4, Johar Town, Lahore" from Nominatim's parts. */
export function shortAddress(body: { name?: string; display_name?: string; address?: NominatimAddress }): string | null {
  const a = body.address ?? {};
  const road = a.road ? [a.house_number, a.road].filter(Boolean).join(' ') : null;
  const parts = [
    body.name || a.amenity || a.building || a.office || a.shop,
    road,
    a.neighbourhood || a.quarter,
    a.suburb,
    a.city || a.town || a.village || a.county,
  ];
  const out: string[] = [];
  for (const p of parts) {
    const s = (p ?? '').trim();
    if (s && !out.includes(s)) out.push(s);
  }
  if (out.length) return out.join(', ').slice(0, 400);
  const fallback = (body.display_name ?? '').split(',').slice(0, 4).map((s) => s.trim()).filter(Boolean).join(', ');
  return fallback ? fallback.slice(0, 400) : null;
}

export async function reverseGeocode(latitude: number, longitude: number): Promise<string | null> {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&addressdetails=1&lat=${latitude}&lon=${longitude}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'GoelOne/1.0 (sign-in locations)', 'Accept-Language': 'en' },
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) return null;
  return shortAddress((await res.json()) as Parameters<typeof shortAddress>[0]);
}

/** Same spot (to ~10 m) within 30 minutes reuses the answer, so the sign-in page and the saved sign-in ask once. */
const cache = new Map<string, { address: string | null; at: number }>();
const CACHE_MS = 30 * 60_000;
let lastCall = 0;

export async function cachedReverseGeocode(latitude: number, longitude: number): Promise<string | null> {
  const key = `${latitude.toFixed(4)},${longitude.toFixed(4)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.address;
  // Nominatim allows one request a second; wait our turn rather than be blocked.
  const wait = lastCall + 1100 - Date.now();
  lastCall = Math.max(Date.now(), lastCall + 1100);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  const address = await reverseGeocode(latitude, longitude).catch(() => null);
  if (cache.size > 2000) cache.clear();
  cache.set(key, { address, at: Date.now() });
  return address;
}
