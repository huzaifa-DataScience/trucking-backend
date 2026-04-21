import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'Clearstory_Cors' })
export class ClearstoryCor {
  @PrimaryColumn({ name: 'Id', type: 'nvarchar', length: 64 })
  id!: string;

  @Column({ name: 'NumericId', type: 'int', nullable: true })
  numericId!: number | null;

  @Column({ name: 'Uuid', type: 'uniqueidentifier', nullable: true })
  uuid!: string | null;

  @Column({ name: 'ProjectId', type: 'int', nullable: true })
  projectId!: number | null;

  @Column({ name: 'JobNumber', type: 'nvarchar', length: 100, nullable: true })
  jobNumber!: string | null;

  @Column({ name: 'CorNumber', type: 'nvarchar', length: 100, nullable: true })
  corNumber!: string | null;

  @Column({ name: 'IssueNumber', type: 'nvarchar', length: 100, nullable: true })
  issueNumber!: string | null;

  @Column({ name: 'Title', type: 'nvarchar', length: 'MAX', nullable: true })
  title!: string | null;

  @Column({ name: 'Description', type: 'nvarchar', length: 'MAX', nullable: true })
  description!: string | null;

  @Column({ name: 'EntryMethod', type: 'nvarchar', length: 100, nullable: true })
  entryMethod!: string | null;

  @Column({ name: 'Type', type: 'nvarchar', length: 50, nullable: true })
  type!: string | null;

  @Column({ name: 'Status', type: 'nvarchar', length: 50, nullable: true })
  status!: string | null;

  @Column({ name: 'Stage', type: 'nvarchar', length: 50, nullable: true })
  stage!: string | null;

  @Column({ name: 'BallInCourt', type: 'nvarchar', length: 50, nullable: true })
  ballInCourt!: string | null;

  @Column({ name: 'Version', type: 'int', nullable: true })
  version!: number | null;

  @Column({ name: 'CustomerJobNumber', type: 'nvarchar', length: 100, nullable: true })
  customerJobNumber!: string | null;

  @Column({ name: 'CustomerReferenceNumber', type: 'nvarchar', length: 'MAX', nullable: true })
  customerReferenceNumber!: string | null;

  @Column({ name: 'ChangeNotificationId', type: 'int', nullable: true })
  changeNotificationId!: number | null;

  @Column({ name: 'ProjectName', type: 'nvarchar', length: 'MAX', nullable: true })
  projectName!: string | null;

  @Column({ name: 'ContractId', type: 'int', nullable: true })
  contractId!: number | null;

  @Column({ name: 'CustomerName', type: 'nvarchar', length: 'MAX', nullable: true })
  customerName!: string | null;

  @Column({ name: 'ContractorName', type: 'nvarchar', length: 'MAX', nullable: true })
  contractorName!: string | null;

  @Column({ name: 'CustomerCoNumber', type: 'nvarchar', length: 100, nullable: true })
  customerCoNumber!: string | null;

  @Column({ name: 'DateSubmitted', type: 'datetime2', nullable: true })
  dateSubmitted!: Date | null;

  @Column({ name: 'RequestedAmount', type: 'decimal', precision: 18, scale: 2, nullable: true })
  requestedAmount!: string | null;

  @Column({ name: 'InReviewAmount', type: 'decimal', precision: 18, scale: 2, nullable: true })
  inReviewAmount!: string | null;

  @Column({ name: 'ApprovedCoIssuedAmount', type: 'decimal', precision: 18, scale: 2, nullable: true })
  approvedCoIssuedAmount!: string | null;

  @Column({ name: 'ApprovedToProceedAmount', type: 'decimal', precision: 18, scale: 2, nullable: true })
  approvedToProceedAmount!: string | null;

  @Column({ name: 'TotalAmount', type: 'decimal', precision: 18, scale: 2, nullable: true })
  totalAmount!: string | null;

  @Column({ name: 'VoidAmount', type: 'decimal', precision: 18, scale: 2, nullable: true })
  voidAmount!: string | null;

  @Column({ name: 'VoidDate', type: 'datetime2', nullable: true })
  voidDate!: Date | null;

  @Column({ name: 'CoIssueDate', type: 'datetime2', nullable: true })
  coIssueDate!: Date | null;

  @Column({ name: 'ApprovedToProceedDate', type: 'datetime2', nullable: true })
  approvedToProceedDate!: Date | null;

  @Column({ name: 'ApprovedOrVoidDate', type: 'datetime2', nullable: true })
  approvedOrVoidDate!: Date | null;

  @Column({ name: 'UpdatedAt', type: 'datetime2', nullable: true })
  updatedAt!: Date | null;

  @Column({ name: 'CreatedAt', type: 'datetime2', nullable: true })
  createdAt!: Date | null;

  @Column({ name: 'LastSyncedAt', type: 'datetime2', default: () => 'SYSUTCDATETIME()' })
  lastSyncedAt!: Date;
}
