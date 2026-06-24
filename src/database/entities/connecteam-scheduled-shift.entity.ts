import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity({ name: 'Connecteam_ScheduledShifts' })
export class ConnecteamScheduledShift {
  @PrimaryColumn({ name: 'SchedulerId', type: 'int' })
  schedulerId!: number;

  @PrimaryColumn({ name: 'ShiftId', type: 'nvarchar', length: 64 })
  shiftId!: string;

  @Column({ name: 'Title', type: 'nvarchar', length: 500, nullable: true })
  title!: string | null;

  @Index()
  @Column({ name: 'JobId', type: 'nvarchar', length: 64, nullable: true })
  jobId!: string | null;

  @Index()
  @Column({ name: 'StartTime', type: 'bigint', nullable: true })
  startTime!: string | null;

  @Column({ name: 'EndTime', type: 'bigint', nullable: true })
  endTime!: string | null;

  @Column({ name: 'Timezone', type: 'nvarchar', length: 80, nullable: true })
  timezone!: string | null;

  @Column({ name: 'IsOpenShift', type: 'bit', default: false })
  isOpenShift!: boolean;

  @Column({ name: 'IsPublished', type: 'bit', default: false })
  isPublished!: boolean;

  @Column({ name: 'AssignedUserIdsJson', type: 'nvarchar', length: 'MAX', nullable: true })
  assignedUserIdsJson!: string | null;

  @Column({ name: 'LocationAddress', type: 'nvarchar', length: 500, nullable: true })
  locationAddress!: string | null;

  @Column({ name: 'LastSyncedAt', type: 'datetime2', default: () => 'SYSUTCDATETIME()' })
  lastSyncedAt!: Date;
}
