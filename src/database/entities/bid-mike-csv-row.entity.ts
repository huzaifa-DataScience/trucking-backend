import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'Bid_MikeCsvRows' })
export class BidMikeCsvRow {
  @PrimaryGeneratedColumn({ name: 'MikeRowId', type: 'bigint' })
  id!: number;

  @Index()
  @Column({ name: 'BidId', type: 'int' })
  bidId!: number;

  @Column({ name: 'ExcelRowNumber', type: 'int', nullable: true })
  excelRowNumber!: number | null;

  @Column({ name: 'SystemAndType', type: 'nvarchar', length: 300, nullable: true })
  systemAndType!: string | null;

  @Column({ name: 'Discipline', type: 'nvarchar', length: 4, nullable: true })
  discipline!: string | null;

  @Column({ name: 'SystemCode', type: 'nvarchar', length: 20, nullable: true })
  systemCode!: string | null;

  @Column({ name: 'AreaLetter', type: 'nvarchar', length: 10, nullable: true })
  areaLetter!: string | null;

  @Column({ name: 'SystemName', type: 'nvarchar', length: 200, nullable: true })
  systemName!: string | null;

  @Column({ name: 'Thickness', type: 'decimal', precision: 18, scale: 6, nullable: true })
  thickness!: number | null;

  @Column({ name: 'Size', type: 'decimal', precision: 18, scale: 6, nullable: true })
  size!: number | null;

  @Column({ name: 'Quantity', type: 'decimal', precision: 18, scale: 6, default: 0 })
  quantity!: number;

  @Column({ name: 'MaterialCost', type: 'decimal', precision: 18, scale: 6, nullable: true })
  materialCost!: number | null;

  @Column({ name: 'Hours', type: 'decimal', precision: 18, scale: 6, nullable: true })
  hours!: number | null;

  @Column({ name: 'MaterialPhrase', type: 'nvarchar', length: 200, nullable: true })
  materialPhrase!: string | null;

  @Column({ name: 'MaterialBase', type: 'nvarchar', length: 100, nullable: true })
  materialBase!: string | null;

  @Column({ name: 'CreatedAt', type: 'datetime2', default: () => 'SYSUTCDATETIME()' })
  createdAt!: Date;
}
