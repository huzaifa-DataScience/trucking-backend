import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Bid } from './bid.entity';
import { AppFile } from './app-file.entity';

@Entity({ name: 'Bid_Attachments' })
export class BidAttachment {
  @PrimaryGeneratedColumn({ name: 'AttachmentId' })
  id!: number;

  @Column({ name: 'BidId', type: 'int' })
  bidId!: number;

  @ManyToOne(() => Bid, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'BidId' })
  bid!: Bid;

  @Column({ name: 'FileId', type: 'int' })
  fileId!: number;

  @ManyToOne(() => AppFile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'FileId' })
  file!: AppFile;

  @Column({ name: 'Label', type: 'nvarchar', length: 200, nullable: true })
  label!: string | null;

  @Column({ name: 'SortOrder', type: 'int', default: 0 })
  sortOrder!: number;

  @Column({ name: 'CreatedAt', type: 'datetime2', default: () => 'SYSUTCDATETIME()' })
  createdAt!: Date;
}
