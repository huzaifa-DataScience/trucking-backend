import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Specs Plumb row inputs. Computed qty/codes are response DTOs only (not persisted).
 */
@Entity({ name: 'Bid_SpecLines' })
export class BidSpecLine {
  @PrimaryGeneratedColumn({ name: 'SpecLineId', type: 'bigint' })
  id!: number;

  @Index()
  @Column({ name: 'BidId', type: 'int' })
  bidId!: number;

  @Column({ name: 'SortOrder', type: 'int', default: 0 })
  sortOrder!: number;

  @Column({ name: 'Type', type: 'nvarchar', length: 40, nullable: true })
  type!: string | null;

  @Column({ name: 'SystemName', type: 'nvarchar', length: 200 })
  systemName!: string;

  @Column({ name: 'AreaName', type: 'nvarchar', length: 100, nullable: true })
  areaName!: string | null;

  @Column({ name: 'Insulation', type: 'nvarchar', length: 200 })
  insulation!: string;

  @Column({ name: 'Size', type: 'decimal', precision: 18, scale: 6 })
  size!: number;

  @Column({ name: 'Thickness', type: 'decimal', precision: 18, scale: 6 })
  thickness!: number;

  @Column({ name: 'Weight', type: 'nvarchar', length: 40, nullable: true })
  weight!: string | null;

  @Column({ name: 'Facing', type: 'nvarchar', length: 40, nullable: true })
  facing!: string | null;

  @Column({ name: 'AddJacket', type: 'nvarchar', length: 40, nullable: true })
  addJacket!: string | null;

  @Column({ name: 'Layers', type: 'nvarchar', length: 40, nullable: true })
  layers!: string | null;

  @Column({ name: 'ExtraNotes', type: 'nvarchar', length: 500, nullable: true })
  extraNotes!: string | null;

  @Column({ name: 'CreatedAt', type: 'datetime2', default: () => 'SYSUTCDATETIME()' })
  createdAt!: Date;

  @Column({ name: 'UpdatedAt', type: 'datetime2', default: () => 'SYSUTCDATETIME()' })
  updatedAt!: Date;
}
