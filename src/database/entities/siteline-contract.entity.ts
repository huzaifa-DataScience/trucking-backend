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
}

