import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type BidCalcSnapshotSource = 'client' | 'server';

/**
 * Append-only audit of computed snapshots. `computedJson` holds the client's
 * Excel-engine result (`source = 'client'`, the source of truth) or a server
 * verify run (`source = 'server'`); never mixed with input tables. The latest
 * row is what `GET /bids/:id` returns.
 */
@Entity({ name: 'Bid_CalcSnapshots' })
export class BidCalcSnapshot {
  @PrimaryGeneratedColumn({ name: 'SnapshotId' })
  id!: number;

  @Column({ name: 'BidId', type: 'int' })
  bidId!: number;

  @Column({ name: 'CalcVersion', type: 'nvarchar', length: 20 })
  calcVersion!: string;

  @Column({ name: 'Source', type: 'nvarchar', length: 20, default: 'client' })
  source!: BidCalcSnapshotSource;

  @Column({ name: 'InputsHash', type: 'nvarchar', length: 64, nullable: true })
  inputsHash!: string | null;

  @Column({ name: 'ComputedJson', type: 'nvarchar', length: 'MAX', nullable: true })
  computedJson!: string | null;

  @Column({ name: 'CreatedAt', type: 'datetime2', default: () => 'SYSUTCDATETIME()' })
  createdAt!: Date;
}
