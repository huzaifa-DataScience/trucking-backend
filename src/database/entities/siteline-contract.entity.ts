import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'Siteline_Contracts' })
export class SitelineContract {
  @PrimaryColumn({ type: 'nvarchar', length: 50 })
  id!: string;

  @Column({ type: 'nvarchar', length: 100, nullable: true })
  projectNumber!: string | null;

  @Column({ type: 'nvarchar', length: 255, nullable: true })
  projectName!: string | null;

  @Column({ type: 'nvarchar', length: 100, nullable: true })
  internalProjectNumber!: string | null;

  @Column({ type: 'nvarchar', length: 50, nullable: true })
  billingType!: string | null;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  percentComplete!: number | null;

  @Column({ type: 'nvarchar', length: 50, nullable: true })
  status!: string | null;

  @Column({ type: 'nvarchar', length: 100, nullable: true })
  timeZone!: string | null;

  @Column({ type: 'nvarchar', length: 255, nullable: true })
  leadPmName!: string | null;

  @Column({ type: 'nvarchar', length: 255, nullable: true })
  leadPmEmail!: string | null;

  @Column({ type: 'datetime2', default: () => 'SYSUTCDATETIME()' })
  lastSyncedAt!: Date;

  /** Raw Siteline `agingBreakdown` JSON from last `agingDashboard` sync (cents fields unchanged). */
  @Column({ type: 'nvarchar', length: 'max', nullable: true })
  agingBreakdownJson!: string | null;

  /** `DashboardInput.startDate` (YYYY-MM-DD) for the cached breakdown. */
  @Column({ type: 'nvarchar', length: 10, nullable: true })
  agingDashboardStartDate!: string | null;

  /** `DashboardInput.endDate` (YYYY-MM-DD) for the cached breakdown. */
  @Column({ type: 'nvarchar', length: 10, nullable: true })
  agingDashboardEndDate!: string | null;

  @Column({ type: 'datetime2', nullable: true })
  agingBreakdownSyncedAt!: Date | null;
}

