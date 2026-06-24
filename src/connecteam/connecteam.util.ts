/** Normalize Connecteam job `code` (e.g. "2768") to a 5-digit job number ("02768"). */
export function normalizeConnecteamJobNumber(code: string | null | undefined): string | null {
  const raw = String(code ?? '').trim();
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (!digits) return raw;
  return digits.length >= 5 ? digits : digits.padStart(5, '0');
}

export function unixSecondsToDate(v: unknown): Date | null {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  const d = new Date(n * 1000);
  return Number.isFinite(d.getTime()) ? d : null;
}

export function shiftDurationMinutes(startTs: number | null, endTs: number | null): number | null {
  if (startTs == null || endTs == null || endTs <= startTs) return null;
  return Math.round(((endTs - startTs) / 60) * 100) / 100;
}

type CustomField = {
  name?: string;
  type?: string;
  value?: unknown;
};

/** Pull employee id from Connecteam custom fields without persisting sensitive HR data. */
export function extractEmployeeId(customFields: CustomField[] | null | undefined): string | null {
  if (!Array.isArray(customFields)) return null;
  const pick = (names: string[]) =>
    customFields.find((f) => names.includes(String(f.name ?? '').trim()));
  const field =
    pick(['Full Employee ID', 'Employee ID', 'Goel Employee ID']) ??
    pick(['Goel DC Employee ID', 'DCB Employee ID']);
  const v = field?.value;
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

export function extractCompanyLabel(customFields: CustomField[] | null | undefined): string | null {
  if (!Array.isArray(customFields)) return null;
  const field = customFields.find((f) => String(f.name ?? '').trim() === 'Company');
  const v = field?.value;
  if (Array.isArray(v) && v[0] && typeof v[0] === 'object' && v[0] !== null) {
    const label = (v[0] as { value?: string }).value;
    return label?.trim() || null;
  }
  return null;
}

export function formatYmd(d: Date): string {
  return d.toISOString().slice(0, 10);
}
