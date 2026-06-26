import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity({ name: 'Connecteam_TimeOffRequests' })
export class ConnecteamTimeOffRequest {
  @PrimaryColumn({ name: 'RequestId', type: 'nvarchar', length: 64 })
  requestId!: string;

  @Index()
  @Column({ name: 'UserId', type: 'int' })
  userId!: number;

  @Column({ name: 'PolicyTypeId', type: 'nvarchar', length: 64, nullable: true })
  policyTypeId!: string | null;

  @Column({ name: 'Status', type: 'nvarchar', length: 20 })
  status!: string;

  @Column({ name: 'IsAllDay', type: 'bit', default: true })
  isAllDay!: boolean;

  @Index()
  @Column({ name: 'StartDate', type: 'date', nullable: true })
  startDate!: string | null;

  @Column({ name: 'EndDate', type: 'date', nullable: true })
  endDate!: string | null;

  @Column({ name: 'StartTime', type: 'nvarchar', length: 20, nullable: true })
  startTime!: string | null;

  @Column({ name: 'EndTime', type: 'nvarchar', length: 20, nullable: true })
  endTime!: string | null;

  @Column({ name: 'Timezone', type: 'nvarchar', length: 80, nullable: true })
  timezone!: string | null;

  @Column({ name: 'DurationAmount', type: 'decimal', precision: 12, scale: 2, nullable: true })
  durationAmount!: number | null;

  @Column({ name: 'DurationUnits', type: 'nvarchar', length: 20, nullable: true })
  durationUnits!: string | null;

  @Column({ name: 'EmployeeNote', type: 'nvarchar', length: 1000, nullable: true })
  employeeNote!: string | null;

  @Column({ name: 'ManagerNote', type: 'nvarchar', length: 1000, nullable: true })
  managerNote!: string | null;

  @Column({ name: 'TimeClockId', type: 'int', nullable: true })
  timeClockId!: number | null;

  @Column({ name: 'LastSyncedAt', type: 'datetime2', default: () => 'SYSUTCDATETIME()' })
  lastSyncedAt!: Date;

  @Column({ name: 'RecordSource', type: 'nvarchar', length: 10, default: 'sync' })
  recordSource!: 'sync' | 'native';
}
