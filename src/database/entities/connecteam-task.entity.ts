import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'Connecteam_Tasks' })
export class ConnecteamTask {
  @PrimaryColumn({ name: 'TaskBoardId', type: 'int' })
  taskBoardId!: number;

  @PrimaryColumn({ name: 'TaskId', type: 'nvarchar', length: 64 })
  taskId!: string;

  @Column({ name: 'Title', type: 'nvarchar', length: 500, nullable: true })
  title!: string | null;

  @Column({ name: 'Status', type: 'nvarchar', length: 40, nullable: true })
  status!: string | null;

  @Column({ name: 'Type', type: 'nvarchar', length: 40, nullable: true })
  type!: string | null;

  @Column({ name: 'StartTime', type: 'bigint', nullable: true })
  startTime!: string | null;

  @Column({ name: 'DueDate', type: 'bigint', nullable: true })
  dueDate!: string | null;

  @Column({ name: 'UserIdsJson', type: 'nvarchar', length: 'max', nullable: true })
  userIdsJson!: string | null;

  @Column({ name: 'LabelIdsJson', type: 'nvarchar', length: 'max', nullable: true })
  labelIdsJson!: string | null;

  @Column({ name: 'IsArchived', type: 'bit', default: false })
  isArchived!: boolean;

  @Column({ name: 'DescriptionSummary', type: 'nvarchar', length: 1000, nullable: true })
  descriptionSummary!: string | null;

  @Column({ name: 'LastSyncedAt', type: 'datetime2', default: () => 'SYSUTCDATETIME()' })
  lastSyncedAt!: Date;
}
