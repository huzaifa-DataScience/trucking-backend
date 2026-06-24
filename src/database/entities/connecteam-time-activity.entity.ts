import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity({ name: 'Connecteam_TimeActivities' })
export class ConnecteamTimeActivity {
  @PrimaryColumn({ name: 'TimeClockId', type: 'int' })
  timeClockId!: number;

  @PrimaryColumn({ name: 'ShiftId', type: 'nvarchar', length: 64 })
  shiftId!: string;

  @Index()
  @Column({ name: 'UserId', type: 'int' })
  userId!: number;

  @Index()
  @Column({ name: 'JobId', type: 'nvarchar', length: 64, nullable: true })
  jobId!: string | null;

  @Column({ name: 'SubJobId', type: 'nvarchar', length: 64, nullable: true })
  subJobId!: string | null;

  @Index()
  @Column({ name: 'StartTimestamp', type: 'bigint', nullable: true })
  startTimestamp!: string | null;

  @Column({ name: 'EndTimestamp', type: 'bigint', nullable: true })
  endTimestamp!: string | null;

  @Column({ name: 'StartTimezone', type: 'nvarchar', length: 80, nullable: true })
  startTimezone!: string | null;

  @Column({ name: 'EndTimezone', type: 'nvarchar', length: 80, nullable: true })
  endTimezone!: string | null;

  @Column({ name: 'DurationMinutes', type: 'decimal', precision: 12, scale: 2, nullable: true })
  durationMinutes!: number | null;

  @Column({ name: 'EmployeeNote', type: 'nvarchar', length: 1000, nullable: true })
  employeeNote!: string | null;

  @Column({ name: 'ManagerNote', type: 'nvarchar', length: 1000, nullable: true })
  managerNote!: string | null;

  @Column({ name: 'IsAutoClockOut', type: 'bit', default: false })
  isAutoClockOut!: boolean;

  @Column({ name: 'CreatedAt', type: 'datetime2', nullable: true })
  createdAt!: Date | null;

  @Column({ name: 'ModifiedAt', type: 'datetime2', nullable: true })
  modifiedAt!: Date | null;

  @Column({ name: 'LastSyncedAt', type: 'datetime2', default: () => 'SYSUTCDATETIME()' })
  lastSyncedAt!: Date;
}
