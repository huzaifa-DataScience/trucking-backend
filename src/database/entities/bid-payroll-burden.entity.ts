import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type BurdenRateType = 'pct_wage' | 'capped_annual' | 'per_hour';

/**
 * Payroll burden constants from the Labor Costs Worksheet "Cost of Labor Calculator".
 * Turns a CBA wage into a burdened labor rate. Office-editable (CRUD).
 *  - pct_wage:      amount = rate * wage                         (Medicare, SocSec, WC, PFL)
 *  - capped_annual: amount = (annualCap * rate) / hoursBasis     (SUTA, FUTA)
 *  - per_hour:      amount = rate                                (IRA, PPO, fringe, benefits)
 * The CBA fringe and lifts/parking are intentionally NOT here (added elsewhere on Base Bid).
 */
@Entity({ name: 'Bid_PayrollBurden' })
export class BidPayrollBurden {
  @PrimaryGeneratedColumn({ name: 'BurdenId' })
  id!: number;

  @Column({ name: 'Code', type: 'nvarchar', length: 40 })
  code!: string;

  @Column({ name: 'Label', type: 'nvarchar', length: 200 })
  label!: string;

  @Column({ name: 'RateType', type: 'nvarchar', length: 20 })
  rateType!: BurdenRateType;

  @Column({ name: 'Rate', type: 'decimal', precision: 12, scale: 6 })
  rate!: number;

  @Column({ name: 'AnnualCap', type: 'decimal', precision: 12, scale: 2, nullable: true })
  annualCap!: number | null;

  @Column({ name: 'HoursBasis', type: 'int', nullable: true })
  hoursBasis!: number | null;

  @Column({ name: 'IncludeInBaseRate', type: 'bit', default: true })
  includeInBaseRate!: boolean;

  @Column({ name: 'IsActive', type: 'bit', default: true })
  isActive!: boolean;

  @Column({ name: 'SortOrder', type: 'int', default: 0 })
  sortOrder!: number;
}
