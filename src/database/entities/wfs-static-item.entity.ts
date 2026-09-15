import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** PJ knobs on the WFS plate (LOC, notes, property). Live AR/AP/Plaid stay in views. */
@Entity({ name: 'Wfs_StaticItems' })
export class WfsStaticItem {
  @PrimaryGeneratedColumn({ name: 'Id' })
  id!: number;

  @Column({ name: 'CompanyKey', type: 'nvarchar', length: 40 })
  companyKey!: string;

  @Column({ name: 'OurEntityId', type: 'int', nullable: true })
  ourEntityId!: number | null;

  @Column({ name: 'Kind', type: 'nvarchar', length: 40 })
  kind!: string;

  @Column({ name: 'Label', type: 'nvarchar', length: 200 })
  label!: string;

  @Column({ name: 'Amount', type: 'decimal', precision: 18, scale: 2 })
  amount!: string;

  @Column({ name: 'AsOfDate', type: 'date', nullable: true })
  asOfDate!: Date | null;

  @Column({ name: 'SortOrder', type: 'int', default: 0 })
  sortOrder!: number;

  @Column({ name: 'UpdatedAt', type: 'datetime2' })
  updatedAt!: Date;
}
