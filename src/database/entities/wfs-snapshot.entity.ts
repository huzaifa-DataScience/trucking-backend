import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** History Log / SnapshotLog — v44 equity + cash charts + KPI Δ. */
@Entity({ name: 'Wfs_Snapshots' })
export class WfsSnapshot {
  @PrimaryGeneratedColumn({ name: 'Id' })
  id!: number;

  @Column({ name: 'SnapshotDate', type: 'date' })
  snapshotDate!: Date;

  @Column({ name: 'TotalEquity', type: 'decimal', precision: 18, scale: 2 })
  totalEquity!: string;

  @Column({ name: 'AvailableCash', type: 'decimal', precision: 18, scale: 2 })
  availableCash!: string;

  @Column({ name: 'GoelEquity', type: 'decimal', precision: 18, scale: 2, default: 0 })
  goelEquity!: string;

  @Column({ name: 'GoelCash', type: 'decimal', precision: 18, scale: 2, default: 0 })
  goelCash!: string;

  @Column({ name: 'GoelAr', type: 'decimal', precision: 18, scale: 2, default: 0 })
  goelAr!: string;

  @Column({ name: 'GoelAp', type: 'decimal', precision: 18, scale: 2, default: 0 })
  goelAp!: string;

  @Column({ name: 'GoelDcEquity', type: 'decimal', precision: 18, scale: 2, default: 0 })
  goelDcEquity!: string;

  @Column({ name: 'GoelDcCash', type: 'decimal', precision: 18, scale: 2, default: 0 })
  goelDcCash!: string;

  @Column({ name: 'GoelDcAr', type: 'decimal', precision: 18, scale: 2, default: 0 })
  goelDcAr!: string;

  @Column({ name: 'GoelDcAp', type: 'decimal', precision: 18, scale: 2, default: 0 })
  goelDcAp!: string;

  @Column({ name: 'DcbEquity', type: 'decimal', precision: 18, scale: 2, default: 0 })
  dcbEquity!: string;

  @Column({ name: 'DcbCash', type: 'decimal', precision: 18, scale: 2, default: 0 })
  dcbCash!: string;

  @Column({ name: 'DcbAr', type: 'decimal', precision: 18, scale: 2, default: 0 })
  dcbAr!: string;

  @Column({ name: 'DcbAp', type: 'decimal', precision: 18, scale: 2, default: 0 })
  dcbAp!: string;

  @Column({ name: 'CreatedAt', type: 'datetime2' })
  createdAt!: Date;
}
