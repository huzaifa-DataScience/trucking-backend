import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'Bid_SpecMaterials' })
export class BidSpecMaterial {
  @PrimaryGeneratedColumn({ name: 'SpecMaterialId' })
  id!: number;

  @Column({ name: 'Description', type: 'nvarchar', length: 200 })
  description!: string;

  @Column({ name: 'Code', type: 'nvarchar', length: 20 })
  code!: string;

  @Column({ name: 'SortOrder', type: 'int', default: 0 })
  sortOrder!: number;

  @Column({ name: 'IsActive', type: 'bit', default: true })
  isActive!: boolean;
}
