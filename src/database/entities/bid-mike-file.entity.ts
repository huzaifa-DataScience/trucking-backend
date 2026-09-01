import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'Bid_MikeFiles' })
export class BidMikeFile {
  @PrimaryGeneratedColumn({ name: 'MikeFileId', type: 'bigint' })
  id!: number;

  @Index()
  @Column({ name: 'BidId', type: 'int' })
  bidId!: number;

  @Column({ name: 'FileName', type: 'nvarchar', length: 260 })
  fileName!: string;

  @Column({ name: 'JobNumberHint', type: 'nvarchar', length: 40, nullable: true })
  jobNumberHint!: string | null;

  @Column({ name: 'ProjectLabel', type: 'nvarchar', length: 300, nullable: true })
  projectLabel!: string | null;

  @Column({ name: 'ImportedRowCount', type: 'int', default: 0 })
  rowCount!: number;

  @Column({ name: 'IsActive', type: 'bit', default: false })
  isActive!: boolean;

  @Column({ name: 'CreatedAt', type: 'datetime2', default: () => 'SYSUTCDATETIME()' })
  createdAt!: Date;
}
