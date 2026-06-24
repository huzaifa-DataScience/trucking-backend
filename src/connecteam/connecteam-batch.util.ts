/** Chunk an array for batched DB writes. */
export function chunkArray<T>(items: T[], size: number): T[][] {
  const n = Math.max(1, size);
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += n) out.push(items.slice(i, i + n));
  return out;
}

/** Dedupe rows by a key (last wins). */
export function dedupeByKey<T>(items: T[], keyFn: (row: T) => string): T[] {
  const map = new Map<string, T>();
  for (const row of items) map.set(keyFn(row), row);
  return [...map.values()];
}
