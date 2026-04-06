import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** Per-contract row from Siteline `agingDashboard` for a given snapshot. */
@Entity({ name: 'Siteline_AgingContracts' })
export class SitelineAgingContract {
  @PrimaryGeneratedColumn({ name: 'Id' })
  id!: number;

  @Column({ name: 'SnapshotId', type: 'int' })
  snapshotId!: number;

  @Column({ name: 'ContractId', type: 'nvarchar', length: 50 })
  contractId!: string;

  @Column({ name: 'InternalProjectNumber', type: 'nvarchar', length: 100, nullable: true })
  internalProjectNumber!: string | null;

  @Column({ name: 'ProjectName', type: 'nvarchar', length: 255, nullable: true })
  projectName!: string | null;

  @Column({ name: 'ProjectNumber', type: 'nvarchar', length: 100, nullable: true })
  projectNumber!: string | null;

  @Column({ name: 'CompanyId', type: 'nvarchar', length: 50, nullable: true })
  companyId!: string | null;

  @Column({ name: 'LeadPmName', type: 'nvarchar', length: 255, nullable: true })
  leadPmName!: string | null;

  @Column({ name: 'LeadPmEmail', type: 'nvarchar', length: 255, nullable: true })
  leadPmEmail!: string | null;

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

  /** Cents (Siteline API). */
  @Column({ name: 'AmountAgedTotal', type: 'bigint', nullable: true })
  amountAgedTotal!: string | null;

  @Column({ name: 'AmountAgedCurrent', type: 'bigint', nullable: true })
  amountAgedCurrent!: string | null;

  @Column({ name: 'AmountAged30Days', type: 'bigint', nullable: true })
  amountAged30Days!: string | null;

  @Column({ name: 'AmountAged60Days', type: 'bigint', nullable: true })
  amountAged60Days!: string | null;

  @Column({ name: 'AmountAged90Days', type: 'bigint', nullable: true })
  amountAged90Days!: string | null;

  @Column({ name: 'AmountAged120Days', type: 'bigint', nullable: true })
  amountAged120Days!: string | null;

  @Column({ name: 'AmountAgedTotalOverdueOnly', type: 'bigint', nullable: true })
  amountAgedTotalOverdueOnly!: string | null;

  @Column({ name: 'AverageDaysToPaid', type: 'decimal', precision: 18, scale: 4, nullable: true })
  averageDaysToPaid!: string | null;
}
