/** Unix seconds (number or string) → ISO 8601 UTC, or null. */
export function unixSecondsToIso(v: unknown): string | null {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  const d = new Date(n * 1000);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

export function minutesToHours(minutes: number | null | undefined): number | null {
  if (minutes == null || !Number.isFinite(minutes)) return null;
  return Math.round((minutes / 60) * 100) / 100;
}

export function userInitials(firstName: string | null | undefined, lastName: string | null | undefined): string {
  const a = (firstName ?? '').trim().charAt(0);
  const b = (lastName ?? '').trim().charAt(0);
  const s = `${a}${b}`.toUpperCase();
  return s || '?';
}

export function parseJsonObject(raw: string | null | undefined): Record<string, unknown> | null {
  if (!raw?.trim()) return null;
  try {
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function parseUserIdsJson(raw: string | null | undefined): number[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((v) => Number(v)).filter((n) => Number.isFinite(n));
  } catch {
    return [];
  }
}

export function formatDateRangeLabel(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  isAllDay?: boolean,
): string | null {
  if (!startDate?.trim()) return null;
  const end = endDate?.trim() || startDate;
  if (startDate === end) return isAllDay === false ? startDate : startDate;
  return `${startDate} → ${end}`;
}
