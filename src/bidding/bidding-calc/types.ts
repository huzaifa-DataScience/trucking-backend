/** Calc engine version — bump when formula logic changes (snapshots store this). */
export const BID_CALC_VERSION = '1.0.0';

/** Up to 8 system slots on the Base Bid grid. */
export type BidSystemKey =
  | 'duct1'
  | 'duct2'
  | 'hydronic1'
  | 'hydronic2'
  | 'plumbing1'
  | 'plumbing2'
  | 'vrf'
  | 'equipment';

/** One row of the Base Bid "systems" grid (MIKE estimate input). */
export interface BidSystemInput {
  key: BidSystemKey;
  /** "Who was used" — include this slot in totals. */
  used?: boolean;
  /** MIKE Estimate # (row 17, reference only). */
  mikeEstimateNumber?: number | null;
  /** Materials without escalation (row 18). */
  materials?: number | null;
  /** Labor Hours (row 19). */
  laborHours?: number | null;
  /** TOTAL PRICE per MIKE (row 20). */
  mikeTotalPrice?: number | null;
  /** Quantity LF/SF (row 21). */
  quantity?: number | null;
}

/** Scalar inputs from the Base Bid form. */
export interface BaseBidInput {
  marginPercent?: number | null;
  projectState?: string | null;
  salesTaxApplicable?: boolean | null;
  /** Sales tax rate for the project state (from Bid_States); engine uses this directly. */
  stateSalesTaxRate?: number | null;

  hoursPerDay?: number | null;
  daysPerWeek?: number | null;
  durationMonths?: number | null;
  startInMonths?: number | null;
  bidDate?: string | null;

  parking?: boolean | null;
  parkingCostPerDay?: number | null;

  liftsNeeded?: boolean | null;
  liftPercentage?: number | null;
  liftCostPer4Weeks?: number | null;
  /** Optional override; otherwise derived from labor hours / duration. */
  averageNoPeople?: number | null;

  materialEscalationPerYear?: number | null;

  /**
   * Burdened composite labor rate per hour (Excel `Wage_Rate_Composite`, e.g. 51.70).
   * Phase 1: provided by the form / Labor Costs Worksheet. Phase 2: auto-derived.
   */
  laborRateCompositePerHour?: number | null;

  /** Selected wage rate label (display only). */
  wageRateLabel?: string | null;
}

export interface BidCalcContext {
  baseBid: BaseBidInput;
  systems: BidSystemInput[];
}

export interface BidCalcError {
  field: string;
  message: string;
}

export interface BidCalcResult {
  version: string;
  computed: Record<string, number | string | null>;
  errors: BidCalcError[];
  warnings: string[];
}
