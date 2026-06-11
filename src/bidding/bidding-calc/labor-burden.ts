import { BurdenRateType } from '../../database/entities';

/** One payroll-burden constant (mirrors Bid_PayrollBurden row, decimals already as numbers). */
export interface BurdenItem {
  code: string;
  label: string;
  rateType: BurdenRateType;
  rate: number;
  annualCap?: number | null;
  hoursBasis?: number | null;
  includeInBaseRate: boolean;
}

export interface BurdenBreakdownLine {
  code: string;
  label: string;
  amountPerHour: number;
}

export interface BurdenedRateResult {
  /** CBA direct wage that went in. */
  wage: number;
  /** Burdened labor rate per hour (Excel "Cost of Labor Calculator" row 35, e.g. 47.69). */
  burdenedRate: number;
  /** Sum of all burden components added on top of the wage. */
  totalBurden: number;
  lines: BurdenBreakdownLine[];
}

/**
 * Convert a CBA wage into a burdened labor rate using the payroll-burden config.
 *   pct_wage:      amount = rate * wage
 *   capped_annual: amount = (annualCap * rate) / hoursBasis
 *   per_hour:      amount = rate
 * Only items flagged includeInBaseRate contribute (lifts/parking handled on Base Bid).
 *
 * Worked example (NON-SCALE, wage 30): 47.69.
 */
export function computeBurdenedRate(wage: number, burdenItems: BurdenItem[]): BurdenedRateResult {
  const w = Number(wage) || 0;
  const lines: BurdenBreakdownLine[] = [];
  // Accumulate at full precision; round only the final totals (matches Excel 47.69).
  let totalBurdenRaw = 0;

  for (const item of burdenItems) {
    if (!item.includeInBaseRate) continue;
    let amount = 0;
    switch (item.rateType) {
      case 'pct_wage':
        amount = item.rate * w;
        break;
      case 'capped_annual': {
        const cap = Number(item.annualCap) || 0;
        const hours = Number(item.hoursBasis) || 0;
        amount = hours > 0 ? (cap * item.rate) / hours : 0;
        break;
      }
      case 'per_hour':
        amount = item.rate;
        break;
    }
    totalBurdenRaw += amount;
    lines.push({ code: item.code, label: item.label, amountPerHour: round2(amount) });
  }

  return {
    wage: round2(w),
    burdenedRate: round2(w + totalBurdenRaw),
    totalBurden: round2(totalBurdenRaw),
    lines,
  };
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
