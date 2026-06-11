import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** Wage/fringe options (Base Bid wage table). `displayLabel` matches the Excel dropdown string. */
@Entity({ name: 'Bid_WageRates' })
export class BidWageRate {
  @PrimaryGeneratedColumn({ name: 'WageRateId' })
  id!: number;

  @Column({ name: 'RateLabel', type: 'nvarchar', length: 100 })
  rateLabel!: string;

  @Column({ name: 'Wage', type: 'decimal', precision: 10, scale: 2 })
  wage!: number;

  @Column({ name: 'Fringe', type: 'decimal', precision: 10, scale: 2 })
  fringe!: number;

  @Column({ name: 'Total', type: 'decimal', precision: 10, scale: 2 })
  total!: number;

  @Column({ name: 'DisplayLabel', type: 'nvarchar', length: 200 })
  displayLabel!: string;

  @Column({ name: 'WageAsOf', type: 'date', nullable: true })
  wageAsOf!: Date | null;

  @Column({ name: 'IsActive', type: 'bit', default: true })
  isActive!: boolean;

  @Column({ name: 'SortOrder', type: 'int', default: 0 })
  sortOrder!: number;
}
