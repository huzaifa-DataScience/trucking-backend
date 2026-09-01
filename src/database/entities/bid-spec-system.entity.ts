import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'Bid_SpecSystems' })
export class BidSpecSystem {
  @PrimaryGeneratedColumn({ name: 'SpecSystemId' })
  id!: number;

  @Column({ name: 'SystemName', type: 'nvarchar', length: 200 })
  systemName!: string;

  @Column({ name: 'Code', type: 'nvarchar', length: 20 })
  code!: string;

  @Column({ name: 'Unit', type: 'nvarchar', length: 20, default: 'LF' })
  unit!: string;

  /** List tab Category → spec sheet kind: hydronic (HVAC Pipe) | plumbing | duct */
  @Column({ name: 'Kind', type: 'nvarchar', length: 20, default: 'hydronic' })
  kind!: 'hydronic' | 'plumbing' | 'duct' | 'equipment';

  @Column({ name: 'SortOrder', type: 'int', default: 0 })
  sortOrder!: number;

  @Column({ name: 'IsActive', type: 'bit', default: true })
  isActive!: boolean;
}
