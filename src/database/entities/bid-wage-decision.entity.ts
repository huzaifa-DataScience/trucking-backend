import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Prevailing-wage *decision* lookup (Davis-Bacon / state / city).
 * Not Bid_WageRates (those are the calculator scale rows: NON-SCALE $30+$7.29).
 */
@Entity({ name: 'Bid_WageDecisions' })
export class BidWageDecision {
  @PrimaryGeneratedColumn({ name: 'WageDecisionId' })
  id!: number;

  @Column({ name: 'DecisionNumber', type: 'nvarchar', length: 80 })
  decisionNumber!: string;

  @Column({ name: 'DecisionDate', type: 'date', nullable: true })
  decisionDate!: Date | null;

  @Column({ name: 'County', type: 'nvarchar', length: 100, nullable: true })
  county!: string | null;

  @Column({ name: 'Jurisdiction', type: 'nvarchar', length: 40, nullable: true })
  jurisdiction!: string | null;

  @Column({ name: 'Category', type: 'nvarchar', length: 100, nullable: true })
  category!: string | null;

  @Column({ name: 'Wage', type: 'decimal', precision: 10, scale: 2, nullable: true })
  wage!: number | null;

  @Column({ name: 'Fringe', type: 'decimal', precision: 10, scale: 2, nullable: true })
  fringe!: number | null;

  @Column({ name: 'IsActive', type: 'bit', default: true })
  isActive!: boolean;

  @Column({ name: 'SortOrder', type: 'int', default: 0 })
  sortOrder!: number;
}
