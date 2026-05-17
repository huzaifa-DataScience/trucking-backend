/** Goel PM inbox pattern when Siteline does not return `leadPMs.email`. */
export const GOEL_PM_EMAIL_DOMAIN = 'goelservices.com';

function slugPmNamePart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

/**
 * Builds `firstname.lastname@goelservices.com` (lowercase). Returns null if either name part is empty.
 */
export function deriveGoelPmEmail(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
): string | null {
  const first = slugPmNamePart(String(firstName ?? ''));
  const last = slugPmNamePart(String(lastName ?? ''));
  if (!first || !last) return null;
  return `${first}.${last}@${GOEL_PM_EMAIL_DOMAIN}`;
}

/** Prefer Siteline email when present; otherwise use Goel naming convention. */
export function resolveLeadPmEmail(
  apiEmail: string | null | undefined,
  firstName: string | null | undefined,
  lastName: string | null | undefined,
): string | null {
  const fromApi = apiEmail != null ? String(apiEmail).trim() : '';
  if (fromApi) return fromApi.toLowerCase();
  return deriveGoelPmEmail(firstName, lastName);
}

/** Fallback when only full name is stored (e.g. `Tory Burton` → `tory.burton@…`). */
export function resolveLeadPmEmailFromFullName(
  apiEmail: string | null | undefined,
  fullName: string | null | undefined,
): string | null {
  const fromApi = apiEmail != null ? String(apiEmail).trim() : '';
  if (fromApi) return fromApi.toLowerCase();
  const parts = String(fullName ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length < 2) return null;
  return deriveGoelPmEmail(parts[0], parts[parts.length - 1]);
}
