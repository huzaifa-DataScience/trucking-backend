import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** Project states available for bidding + their sales tax rate (Base Bid `Rate_State` / `Sales_Tax_by_state`). */
@Entity({ name: 'Bid_States' })
export class BidState {
  @PrimaryGeneratedColumn({ name: 'StateId' })
  id!: number;

  @Column({ name: 'StateCode', type: 'nvarchar', length: 10 })
  stateCode!: string;

  @Column({ name: 'SalesTaxRate', type: 'decimal', precision: 6, scale: 4, default: 0 })
  salesTaxRate!: number;

  @Column({ name: 'SortOrder', type: 'int', default: 0 })
  sortOrder!: number;
}
