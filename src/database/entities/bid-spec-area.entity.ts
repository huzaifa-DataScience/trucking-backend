import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'Bid_SpecAreas' })
export class BidSpecArea {
  @PrimaryGeneratedColumn({ name: 'SpecAreaId' })
  id!: number;

  @Column({ name: 'AreaName', type: 'nvarchar', length: 100 })
  areaName!: string;

  @Column({ name: 'Code', type: 'nvarchar', length: 20 })
  code!: string;

  @Column({ name: 'SortOrder', type: 'int', default: 0 })
  sortOrder!: number;

  @Column({ name: 'IsActive', type: 'bit', default: true })
  isActive!: boolean;
}
