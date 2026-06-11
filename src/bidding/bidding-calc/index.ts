import { calculateBaseBid } from './base-bid';
import { BID_CALC_VERSION, BidCalcContext, BidCalcResult } from './types';

/** Completion heuristic for the insight strip progress bar. */
function completionPercent(ctx: BidCalcContext): number {
  const bb = ctx.baseBid ?? {};
  const checks = [
    bb.marginPercent != null,
    bb.projectState != null,
    bb.wageRateLabel != null,
    bb.hoursPerDay != null,
    bb.daysPerWeek != null,
    (ctx.systems ?? []).some((s) => s.used),
    bb.laborRateCompositePerHour != null,
  ];
  const done = checks.filter(Boolean).length;
  return Math.round((done / checks.length) * 100);
}

/** Run all calc sections and return dot-keyed `computed` for the frontend. */
export function runBidCalc(ctx: BidCalcContext): BidCalcResult {
  const base = calculateBaseBid(ctx);
  const c = base.computed;

  const computed: BidCalcResult['computed'] = {
    'baseBid.mikeEstimate': c.mikeEstimate,
    'baseBid.pjEstimate': c.pjEstimate,
    'baseBid.costPerHourMike': c.costPerHourMike,
    'baseBid.costPerHourPj': c.costPerHourPj,
    'baseBid.marginPercent': ctx.baseBid?.marginPercent ?? null,
    'baseBid.costPerHourBeforeMargin': c.costPerHourBeforeMargin,
    'baseBid.marginPerHour': c.marginPerHour,
    'labor.totalHours': c.totalLaborHours,
    'labor.parkingPerHour': c.parkingPerHour,
    'labor.liftsPerHour': c.liftsPerHour,
    'labor.materialEscalationFactor': c.materialEscalationFactor,
    'labor.salesTaxPercent': c.salesTaxPercent,
    'insights.completionPercent': completionPercent(ctx),
  };

  return {
    version: BID_CALC_VERSION,
    computed,
    errors: base.errors,
    warnings: base.warnings,
  };
}

export { BID_CALC_VERSION } from './types';
export * from './types';
