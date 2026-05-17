/** Siteline contract status for an in-flight project (excludes COMPLETED, etc.). */
export function isSitelineContractActive(status: string | null | undefined): boolean {
  return String(status ?? '').trim().toUpperCase() === 'ACTIVE';
}

export function isClearstoryProjectActive(archived: boolean | null | undefined): boolean {
  return archived !== true;
}
