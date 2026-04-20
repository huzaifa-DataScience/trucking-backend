import { Column, Entity, PrimaryColumn } from 'typeorm';

/** Project-scoped LMEO rate row (same shape as Clearstory_Rates plus ProjectId). */
@Entity({ name: 'Clearstory_ProjectRates' })
export class ClearstoryProjectRate {
  @PrimaryColumn({ name: 'ProjectId', type: 'int' })
  projectId!: number;

  @PrimaryColumn({ name: 'RateType', type: 'nvarchar', length: 20 })
  rateType!: string;

  @PrimaryColumn({ name: 'RecordId', type: 'int' })
  recordId!: number;

  @Column({ name: 'InternalId', type: 'nvarchar', length: 200, nullable: true })
  internalId!: string | null;

  @Column({ name: 'RateGroupId', type: 'int', nullable: true })
  rateGroupId!: number | null;

  @Column({ name: 'RateGroupName', type: 'nvarchar', length: 300, nullable: true })
  rateGroupName!: string | null;

  @Column({ name: 'LaborClass', type: 'nvarchar', length: 500, nullable: true })
  laborClass!: string | null;

  @Column({ name: 'StraightTimeRate', type: 'decimal', precision: 18, scale: 4, nullable: true })
  straightTimeRate!: string | null;

  @Column({ name: 'OverTimeRate', type: 'decimal', precision: 18, scale: 4, nullable: true })
  overTimeRate!: string | null;

  @Column({ name: 'DoubleTimeRate', type: 'decimal', precision: 18, scale: 4, nullable: true })
  doubleTimeRate!: string | null;

  @Column({ name: 'PremiumOverTimeRate', type: 'decimal', precision: 18, scale: 4, nullable: true })
  premiumOverTimeRate!: string | null;

  @Column({ name: 'PremiumDoubleTimeRate', type: 'decimal', precision: 18, scale: 4, nullable: true })
  premiumDoubleTimeRate!: string | null;

  @Column({ name: 'ItemName', type: 'nvarchar', length: 500, nullable: true })
  itemName!: string | null;

  @Column({ name: 'Unit', type: 'nvarchar', length: 100, nullable: true })
  unit!: string | null;

  @Column({ name: 'RateAmount', type: 'decimal', precision: 18, scale: 4, nullable: true })
  rateAmount!: string | null;

  @Column({ name: 'StandardAmount', type: 'decimal', precision: 18, scale: 4, nullable: true })
  standardAmount!: string | null;

  @Column({ name: 'StandardItem', type: 'bit', nullable: true })
  standardItem!: boolean | null;

  @Column({ name: 'AutoCalculateTotal', type: 'bit', nullable: true })
  autoCalculateTotal!: boolean | null;

  @Column({ name: 'UpdatedAt', type: 'datetime2', nullable: true })
  updatedAt!: Date | null;

  @Column({ name: 'CreatedAt', type: 'datetime2', nullable: true })
  createdAt!: Date | null;

  @Column({ name: 'LastSyncedAt', type: 'datetime2', default: () => 'SYSUTCDATETIME()' })
  lastSyncedAt!: Date;
}
