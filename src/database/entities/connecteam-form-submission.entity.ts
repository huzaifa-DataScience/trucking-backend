import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity({ name: 'Connecteam_FormSubmissions' })
export class ConnecteamFormSubmission {
  @PrimaryColumn({ name: 'FormId', type: 'nvarchar', length: 64 })
  formId!: string;

  @PrimaryColumn({ name: 'SubmissionId', type: 'nvarchar', length: 64 })
  submissionId!: string;

  @Index()
  @Column({ name: 'UserId', type: 'int', nullable: true })
  userId!: number | null;

  @Index()
  @Column({ name: 'SubmittedAt', type: 'bigint', nullable: true })
  submittedAt!: string | null;

  @Column({ name: 'Status', type: 'nvarchar', length: 40, nullable: true })
  status!: string | null;

  @Column({ name: 'SummaryJson', type: 'nvarchar', length: 'MAX', nullable: true })
  summaryJson!: string | null;

  @Column({ name: 'LastSyncedAt', type: 'datetime2', default: () => 'SYSUTCDATETIME()' })
  lastSyncedAt!: Date;
}
