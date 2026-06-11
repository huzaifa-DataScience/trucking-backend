import {
  BaseBidInput,
  BidCalcContext,
  BidCalcError,
  BidSystemInput,
} from './types';

const num = (v: unknown, fallback = 0): number => {
  const n = typeof v === 'string' ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? (n as number) : fallback;
};

/** Excel ROUNDUP(value, digits): round away from zero to `digits` decimals. */
export function roundUp(value: number, digits: number): number {
  if (!Number.isFinite(value)) return 0;
  const factor = Math.pow(10, digits);
  const sign = value < 0 ? -1 : 1;
  return (sign * Math.ceil(Math.abs(value) * factor)) / factor;
}

const addMonths = (date: Date, months: number): Date => {
  const d = new Date(date.getTime());
  d.setMonth(d.getMonth() + months);
  return d;
};

export interface BaseBidComputed {
  mikeEstimate: number;
  pjEstimate: number;
  costPerHourMike: number;
  costPerHourPj: number;
  totalLaborHours: number;
  parkingPerHour: number;
  liftsPerHour: number;
  materialEscalationFactor: number;
  salesTaxPercent: number;
  costPerHourBeforeMargin: number;
  marginPerHour: number;
}

/**
 * Ports the Base Bid tab math. Verified against estimate IDC6098:
 * MIKE = 43,837.68, PJ = 47,600 (using laborRateCompositePerHour = 51.70).
 */
export function calculateBaseBid(ctx: BidCalcContext): {
  computed: BaseBidComputed;
  errors: BidCalcError[];
  warnings: string[];
} {
  const bb: BaseBidInput = ctx.baseBid ?? {};
  const errors: BidCalcError[] = [];
  const warnings: string[] = [];

  const used = (ctx.systems ?? []).filter((s) => s && s.used);

  const margin = num(bb.marginPercent);
  if (margin <= 0 || margin >= 1) {
    errors.push({ field: 'baseBid.marginPercent', message: 'Margin must be between 0 and 1 (e.g. 0.25).' });
  }

  const hoursPerDay = num(bb.hoursPerDay, 8);
  const durationMonths = num(bb.durationMonths);
  const laborComposite = num(bb.laborRateCompositePerHour);
  if (laborComposite <= 0) {
    warnings.push('laborRateCompositePerHour not set — PJ price will be understated until the Labor Costs Worksheet value is provided.');
  }

  const totalLaborHours = used.reduce((sum, s) => sum + num(s.laborHours), 0);

  // Parking per hour (Excel D11)
  const parkingPerHour = bb.parking ? num(bb.parkingCostPerDay) / (hoursPerDay || 1) : 0;

  // Average number of people (Excel H7) — override or derived
  const averageNoPeople =
    bb.averageNoPeople != null && Number.isFinite(num(bb.averageNoPeople))
      ? num(bb.averageNoPeople)
      : durationMonths > 0
        ? Math.round((totalLaborHours / durationMonths / (1950 / 12)) * 100) / 100
        : 0;

  // Total lift (Excel J7) and lifts per hour (D12)
  const totalLift = num(bb.liftPercentage) * num(bb.liftCostPer4Weeks) * durationMonths * (4.4 / 4) * averageNoPeople;
  const liftsPerHour = bb.liftsNeeded && totalLaborHours > 0 ? totalLift / totalLaborHours : 0;

  // Material escalation factor (Excel H11): (year(workEnd) - year(bidDate)) * escalationPerYear
  let materialEscalationFactor = 0;
  if (bb.bidDate) {
    const bidDate = new Date(bb.bidDate);
    if (!isNaN(bidDate.getTime())) {
      const workBegin = addMonths(bidDate, num(bb.startInMonths));
      const workEnd = addMonths(workBegin, Math.max(0, durationMonths - 1));
      const years = workEnd.getFullYear() - bidDate.getFullYear();
      materialEscalationFactor = Math.max(0, years) * num(bb.materialEscalationPerYear);
    }
  }

  const salesTaxPercent = bb.salesTaxApplicable ? num(bb.stateSalesTaxRate) : 0;

  // Per-system subtotal (Excel rows 41-45)
  const subtotalForSystem = (s: BidSystemInput): number => {
    const laborHours = num(s.laborHours);
    const materials = num(s.materials);
    const laborTotal = laborHours * (laborComposite + parkingPerHour + liftsPerHour);
    const escAmt = materials * materialEscalationFactor;
    const tax = (materials + escAmt) * salesTaxPercent;
    return laborTotal + materials + escAmt + tax;
  };

  const subtotalSum = used.reduce((sum, s) => sum + subtotalForSystem(s), 0); // H45

  // PJ calculation chain (Excel I45 -> I46 -> I47 -> H47)
  const costPerHourBeforeMargin = totalLaborHours > 0 ? roundUp(subtotalSum / totalLaborHours, 2) : 0;
  const marginPerHour =
    margin > 0 && margin < 1
      ? roundUp(-costPerHourBeforeMargin + costPerHourBeforeMargin / (1 - margin), 2)
      : 0;
  const pjCostPerHour = costPerHourBeforeMargin + marginPerHour;
  const pjEstimate = roundUp(pjCostPerHour * totalLaborHours, -2);

  // MIKE calculation (Excel J20 / H48)
  const mikeEstimate = used.reduce((sum, s) => sum + num(s.mikeTotalPrice), 0);
  const costPerHourMike = totalLaborHours > 0 ? mikeEstimate / totalLaborHours : 0;

  return {
    computed: {
      mikeEstimate,
      pjEstimate,
      costPerHourMike,
      costPerHourPj: pjCostPerHour,
      totalLaborHours,
      parkingPerHour,
      liftsPerHour,
      materialEscalationFactor,
      salesTaxPercent,
      costPerHourBeforeMargin,
      marginPerHour,
    },
    errors,
    warnings,
  };
}
