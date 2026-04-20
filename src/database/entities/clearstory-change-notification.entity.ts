import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'Clearstory_ChangeNotifications' })
export class ClearstoryChangeNotification {
  @PrimaryColumn({ name: 'Id', type: 'nvarchar', length: 32 })
  id!: string;

  @Column({ name: 'LastInbox', type: 'nvarchar', length: 20, nullable: true })
  lastInbox!: string | null;

  @Column({ name: 'Type', type: 'nvarchar', length: 200, nullable: true })
  type!: string | null;

  @Column({ name: 'TypeId', type: 'int', nullable: true })
  typeId!: number | null;

  @Column({ name: 'Status', type: 'nvarchar', length: 100, nullable: true })
  status!: string | null;

  @Column({ name: 'StatusChangedAt', type: 'datetime2', nullable: true })
  statusChangedAt!: Date | null;

  @Column({ name: 'Title', type: 'nvarchar', length: 500, nullable: true })
  title!: string | null;

  @Column({ name: 'Description', type: 'nvarchar', length: 4000, nullable: true })
  description!: string | null;

  @Column({ name: 'CustomerReferenceNumber', type: 'nvarchar', length: 200, nullable: true })
  customerReferenceNumber!: string | null;

  @Column({ name: 'DateSubmitted', type: 'datetime2', nullable: true })
  dateSubmitted!: Date | null;

  @Column({ name: 'DateReceived', type: 'datetime2', nullable: true })
  dateReceived!: Date | null;

  @Column({ name: 'DueDate', type: 'datetime2', nullable: true })
  dueDate!: Date | null;

  @Column({ name: 'Estimate', type: 'decimal', precision: 18, scale: 2, nullable: true })
  estimate!: string | null;

  @Column({ name: 'CostImpact', type: 'decimal', precision: 18, scale: 2, nullable: true })
  costImpact!: string | null;

  @Column({ name: 'ProjectedCost', type: 'decimal', precision: 18, scale: 2, nullable: true })
  projectedCost!: string | null;

  @Column({ name: 'TotalSubmitted', type: 'int', nullable: true })
  totalSubmitted!: number | null;

  @Column({ name: 'TotalResponded', type: 'int', nullable: true })
  totalResponded!: number | null;

  @Column({ name: 'CustomerName', type: 'nvarchar', length: 500, nullable: true })
  customerName!: string | null;

  @Column({ name: 'CustomerId', type: 'int', nullable: true })
  customerId!: number | null;

  @Column({ name: 'ProjectId', type: 'int', nullable: true })
  projectId!: number | null;

  @Column({ name: 'ProjectJobNumber', type: 'nvarchar', length: 100, nullable: true })
  projectJobNumber!: string | null;

  @Column({ name: 'ProjectTitle', type: 'nvarchar', length: 255, nullable: true })
  projectTitle!: string | null;

  @Column({ name: 'UpdatedAt', type: 'datetime2', nullable: true })
  updatedAt!: Date | null;

  @Column({ name: 'CreatedAt', type: 'datetime2', nullable: true })
  createdAt!: Date | null;

  @Column({ name: 'LastSyncedAt', type: 'datetime2', default: () => 'SYSUTCDATETIME()' })
  lastSyncedAt!: Date;
}
