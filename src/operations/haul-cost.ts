/**
 * Cost rules from 2025-2026 Trucking Log.xlsx (Trucking Record row 2).
 * Money is computed when a haul is read. It is not stored.
 * A rate-card edit changes every haul that points at that card — same as Excel VLOOKUP.
 * Upgrade path: copy the four rate numbers onto the haul when the card changes.
 */

export const SENTINEL_HAULER = '-----';
export const SENTINEL_DISPOSAL = '-----';
export const SENTINEL_JOB = '---';

export function num(value: unknown): number {
  if (value == null || value === '') return 0;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Excel: IF(AND(included>0, included-weight>0), 0, weight-included). */
export function billableTons(weight: unknown, tonsIncluded: unknown): number {
  const w = num(weight);
  const included = num(tonsIncluded);
  if (included > 0 && included - w > 0) return 0;
  return w - included;
}

export function truckingCost(
  ratePerLoad: unknown,
  ratePerHour: unknown,
  hours: unknown,
  hauler: unknown,
): number {
  if (hauler == null || hauler === '' || hauler === SENTINEL_HAULER) return 0;
  return num(ratePerLoad) + num(ratePerHour) * num(hours);
}

export function disposalCost(
  costPerLoad: unknown,
  costPerTon: unknown,
  costPerCy: unknown,
  truckCy: unknown,
  tonsIncluded: unknown,
  weight: unknown,
  destination: unknown,
): number {
  if (destination == null || destination === '' || destination === SENTINEL_DISPOSAL) return 0;
  const tons = billableTons(weight, tonsIncluded);
  return num(costPerLoad) + num(costPerTon) * tons + num(costPerCy) * num(truckCy);
}

export function totalCost(trucking: number, disposal: number): number {
  return trucking + disposal;
}

export function haulerLabel(company: unknown, category: unknown): string {
  if (company == null || String(company).trim() === '') return 'Z';
  return `${String(company)} - ${category ?? ''}`;
}

export function disposalLabel(company: unknown, unit: unknown, category: unknown): string {
  if (company == null || String(company).trim() === '') return 'X';
  return `${String(company)} - ${unit ?? ''} - ${category ?? ''}`;
}

export function cents(value: number): number {
  return Math.round(value * 100) / 100;
}
