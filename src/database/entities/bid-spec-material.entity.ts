import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'Bid_SpecMaterials' })
export class BidSpecMaterial {
  @PrimaryGeneratedColumn({ name: 'SpecMaterialId' })
  id!: number;

  @Column({ name: 'Description', type: 'nvarchar', length: 200 })
  description!: string;

  @Column({ name: 'Code', type: 'nvarchar', length: 20 })
  code!: string;

  /** List tab: hydronic = HVAC AZ, plumbing = BO, duct = BR. */
  @Column({ name: 'Kind', type: 'nvarchar', length: 20, default: 'hydronic' })
  kind!: 'hydronic' | 'plumbing' | 'duct';

  /** Factory finish from name / helpermap (ASJ, FSK, …). Null = none. */
  @Column({ name: 'Facing', type: 'nvarchar', length: 40, nullable: true })
  facing!: string | null;

  /** Field-applied jacket (List AV). Null = none. */
  @Column({ name: 'Jacket', type: 'nvarchar', length: 40, nullable: true })
  jacket!: string | null;

  /** Duct List BR encodes thickness in the name (`1.5" 3/4lb …`). */
  @Column({ name: 'ThicknessIn', type: 'decimal', precision: 18, scale: 6, nullable: true })
  thicknessIn!: number | null;

  /** Duct density (`3/4lb` → 0.75). Pipe usually null. */
  @Column({ name: 'Weight', type: 'decimal', precision: 18, scale: 6, nullable: true })
  weight!: number | null;

  @Column({ name: 'SortOrder', type: 'int', default: 0 })
  sortOrder!: number;

  @Column({ name: 'IsActive', type: 'bit', default: true })
  isActive!: boolean;
}
