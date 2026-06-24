import { Column, Entity, JoinColumn, OneToOne, PrimaryColumn } from 'typeorm';
import { Bid } from './bid.entity';

/**
 * Per-bid section inputs as JSON (1:1 with `Bids`).
 * `baseBidJson` = ~22 scalar inputs; `systemsJson` = array of up to 8 system rows.
 * Stored as NVARCHAR(MAX); shape validated in the API layer (DTOs), versioned by InputsSchemaVer.
 * Calculated values are NOT stored here — see `Bid_CalcSnapshots`.
 */
@Entity({ name: 'Bid_Content' })
export class BidContent {
  @PrimaryColumn({ name: 'BidId', type: 'int' })
  bidId!: number;

  @OneToOne(() => Bid, (b) => b.content, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'BidId' })
  bid!: Bid;

  @Column({ name: 'BaseBidJson', type: 'nvarchar', length: 'MAX', nullable: true })
  baseBidJson!: string | null;

  @Column({ name: 'SystemsJson', type: 'nvarchar', length: 'MAX', nullable: true })
  systemsJson!: string | null;

  /** Client / GC / owner the bid is for (not our entity). */
  @Column({ name: 'CompanyInfoJson', type: 'nvarchar', length: 'MAX', nullable: true })
  companyInfoJson!: string | null;

  @Column({ name: 'InputsSchemaVer', type: 'int', default: 1 })
  inputsSchemaVer!: number;

  @Column({ name: 'UpdatedAt', type: 'datetime2', default: () => 'SYSUTCDATETIME()' })
  updatedAt!: Date;
}
