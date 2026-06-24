import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './user.entity';

export type BidActivityAction =
  | 'created'
  | 'updated'
  | 'submitted'
  | 'reopened'
  | 'archived'
  | 'deleted'
  | 'attachment_added'
  | 'attachment_removed';

export type BidActivityArea =
  | 'bid'
  | 'header'
  | 'companyInfo'
  | 'baseBid'
  | 'systems'
  | 'computed'
  | 'attachments'
  | 'status';

@Entity({ name: 'Bid_ActivityLog' })
export class BidActivityLog {
  @PrimaryGeneratedColumn({ name: 'ActivityId' })
  id!: number;

  @Column({ name: 'BidId', type: 'int' })
  bidId!: number;

  @Column({ name: 'UserId', type: 'int', nullable: true })
  userId!: number | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'UserId' })
  user!: User | null;

  @Column({ name: 'Action', type: 'nvarchar', length: 40 })
  action!: BidActivityAction;

  @Column({ name: 'Area', type: 'nvarchar', length: 40 })
  area!: BidActivityArea;

  @Column({ name: 'Summary', type: 'nvarchar', length: 500 })
  summary!: string;

  @Column({ name: 'ChangedFieldsJson', type: 'nvarchar', length: 'MAX', nullable: true })
  changedFieldsJson!: string | null;

  @Column({ name: 'CreatedAt', type: 'datetime2', default: () => 'SYSUTCDATETIME()' })
  createdAt!: Date;
}
