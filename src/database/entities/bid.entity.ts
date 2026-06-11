import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { OurEntity } from './our-entity.entity';
import { Job } from './job.entity';
import { BidContent } from './bid-content.entity';

export type BidStatus = 'draft' | 'submitted' | 'archived';

/**
 * Bid header — one row per estimate (the "cover sheet" of the Base Bid tab).
 * Section inputs live in `Bid_Content` (1:1 JSON); calc outputs live in `Bid_CalcSnapshots`.
 * Company reuses `Ref_OurEntities`; optional link to `Ref_Jobs`.
 */
@Entity({ name: 'Bids' })
export class Bid {
  @PrimaryGeneratedColumn({ name: 'BidId' })
  id!: number;

  @Column({ name: 'OurEntityId', type: 'int' })
  ourEntityId!: number;

  @ManyToOne(() => OurEntity, { nullable: false })
  @JoinColumn({ name: 'OurEntityId' })
  ourEntity!: OurEntity;

  @Column({ name: 'JobId', type: 'int', nullable: true })
  jobId!: number | null;

  @ManyToOne(() => Job, { nullable: true })
  @JoinColumn({ name: 'JobId' })
  job!: Job | null;

  @Column({ name: 'EstimateNumber', type: 'nvarchar', length: 64 })
  estimateNumber!: string;

  @Column({ name: 'BidName', type: 'nvarchar', length: 500, nullable: true })
  bidName!: string | null;

  @Column({ name: 'Status', type: 'nvarchar', length: 20, default: 'draft' })
  status!: BidStatus;

  @Column({ name: 'BidDate', type: 'date', nullable: true })
  bidDate!: Date | null;

  @Column({ name: 'CreatedByUserId', type: 'int', nullable: true })
  createdByUserId!: number | null;

  @Column({ name: 'CreatedAt', type: 'datetime2', default: () => 'SYSUTCDATETIME()' })
  createdAt!: Date;

  @Column({ name: 'UpdatedAt', type: 'datetime2', default: () => 'SYSUTCDATETIME()' })
  updatedAt!: Date;

  @Column({ name: 'IsDeleted', type: 'bit', default: false })
  isDeleted!: boolean;

  @OneToOne(() => BidContent, (c) => c.bid)
  content!: BidContent;
}
