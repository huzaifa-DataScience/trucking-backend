import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** Supplier/item catalog for Structshare Item pick + website price edit. */
@Entity({ name: 'Bid_ItemCatalog' })
export class BidItemCatalog {
  @PrimaryGeneratedColumn({ name: 'ItemId', type: 'bigint' })
  id!: number;

  @Column({ name: 'ItemName', type: 'nvarchar', length: 500 })
  itemName!: string;

  @Column({ name: 'Price', type: 'decimal', precision: 18, scale: 6, nullable: true })
  price!: number | null;

  @Index()
  @Column({ name: 'NameLc', type: 'nvarchar', length: 500 })
  nameLc!: string;

  @Column({ name: 'Size1', type: 'decimal', precision: 18, scale: 6, nullable: true })
  size1!: number | null;

  @Column({ name: 'Size2', type: 'decimal', precision: 18, scale: 6, nullable: true })
  size2!: number | null;

  @Column({ name: 'IsActive', type: 'bit', default: true })
  isActive!: boolean;

  @Column({ name: 'UpdatedAt', type: 'datetime2', default: () => 'SYSUTCDATETIME()' })
  updatedAt!: Date;
}
