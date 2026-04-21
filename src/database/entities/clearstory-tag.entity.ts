import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'Clearstory_Tags' })
export class ClearstoryTag {
  @PrimaryColumn({ name: 'Id', type: 'int' })
  id!: number;

  @Column({ name: 'Uuid', type: 'uniqueidentifier', nullable: true })
  uuid!: string | null;

  @Column({ name: 'ProjectId', type: 'int', nullable: true })
  projectId!: number | null;

  @Column({ name: 'JobNumber', type: 'nvarchar', length: 100, nullable: true })
  jobNumber!: string | null;

  @Column({ name: 'Number', type: 'nvarchar', length: 100, nullable: true })
  number!: string | null;

  @Column({ name: 'PaddedTagNumber', type: 'nvarchar', length: 100, nullable: true })
  paddedTagNumber!: string | null;

  @Column({ name: 'Title', type: 'nvarchar', length: 'MAX', nullable: true })
  title!: string | null;

  @Column({ name: 'Status', type: 'nvarchar', length: 50, nullable: true })
  status!: string | null;

  @Column({ name: 'CustomerReferenceNumber', type: 'nvarchar', length: 'MAX', nullable: true })
  customerReferenceNumber!: string | null;

  @Column({ name: 'DateOfWorkPerformed', type: 'datetime2', nullable: true })
  dateOfWorkPerformed!: Date | null;

  @Column({ name: 'SignedAt', type: 'datetime2', nullable: true })
  signedAt!: Date | null;

  @Column({ name: 'UpdatedAt', type: 'datetime2', nullable: true })
  updatedAt!: Date | null;

  @Column({ name: 'CreatedAt', type: 'datetime2', nullable: true })
  createdAt!: Date | null;

  @Column({ name: 'LastSyncedAt', type: 'datetime2', default: () => 'SYSUTCDATETIME()' })
  lastSyncedAt!: Date;
}
