import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * One company-level row per Siteline `agingDashboard` sync (matches `payAppAgingSummary` + breakdown).
 * Child detail rows: Siteline_AgingContracts.
 */
@Entity({ name: 'Siteline_AgingSummary' })
export class SitelineAgingSummary {
  @PrimaryGeneratedColumn({ name: 'Id' })
  id!: number;

  @Column({ name: 'CompanyId', type: 'nvarchar', length: 50, nullable: true })
  companyId!: string | null;

  @Column({ name: 'StartDate', type: 'nvarchar', length: 10, nullable: true })
  startDate!: string | null;

  @Column({ name: 'EndDate', type: 'nvarchar', length: 10, nullable: true })
  endDate!: string | null;

  /** Cents — Siteline `amountOutstandingThisMonth`. */
  @Column({ name: 'AmountOutstandingThisMonth', type: 'bigint', nullable: true })
  amountOutstandingThisMonth!: string | null;

  @Column({ name: 'AmountAged30Days', type: 'bigint', nullable: true })
  amountAged30Days!: string | null;

  @Column({ name: 'AmountAged60Days', type: 'bigint', nullable: true })
  amountAged60Days!: string | null;

  @Column({ name: 'AmountAged90Days', type: 'bigint', nullable: true })
  amountAged90Days!: string | null;

  @Column({ name: 'AmountAged120Days', type: 'bigint', nullable: true })
  amountAged120Days!: string | null;

  @Column({ name: 'AverageDaysToPaid', type: 'decimal', precision: 18, scale: 4, nullable: true })
  averageDaysToPaid!: string | null;

  @Column({ name: 'NumCurrent', type: 'int', nullable: true })
  numCurrent!: number | null;

  @Column({ name: 'NumAged30Days', type: 'int', nullable: true })
  numAged30Days!: number | null;

  @Column({ name: 'NumAged60Days', type: 'int', nullable: true })
  numAged60Days!: number | null;

  @Column({ name: 'NumAged90Days', type: 'int', nullable: true })
  numAged90Days!: number | null;

  @Column({ name: 'NumAged120Days', type: 'int', nullable: true })
  numAged120Days!: number | null;

  @Column({ name: 'AmountAgedTotal', type: 'bigint', nullable: true })
  amountAgedTotal!: string | null;

  @Column({ name: 'AmountAgedCurrent', type: 'bigint', nullable: true })
  amountAgedCurrent!: string | null;

  /** Maps from `payAppAgingBreakdown.amountAged30Days`, etc. */
  @Column({ name: 'AmountAgedBreakdown30Days', type: 'bigint', nullable: true })
  amountAgedBreakdown30Days!: string | null;

  @Column({ name: 'AmountAgedBreakdown60Days', type: 'bigint', nullable: true })
  amountAgedBreakdown60Days!: string | null;

  @Column({ name: 'AmountAgedBreakdown90Days', type: 'bigint', nullable: true })
  amountAgedBreakdown90Days!: string | null;

  @Column({ name: 'AmountAgedBreakdown120Days', type: 'bigint', nullable: true })
  amountAgedBreakdown120Days!: string | null;

  @Column({ name: 'AmountAgedTotalOverdueOnly', type: 'bigint', nullable: true })
  amountAgedTotalOverdueOnly!: string | null;

  @Column({ name: 'CreatedAt', type: 'datetime2' })
  createdAt!: Date;
}
