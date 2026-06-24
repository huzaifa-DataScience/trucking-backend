import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity({ name: 'Connecteam_Jobs' })
export class ConnecteamJob {
  @PrimaryColumn({ name: 'JobId', type: 'nvarchar', length: 64 })
  jobId!: string;

  @Column({ name: 'Title', type: 'nvarchar', length: 500, nullable: true })
  title!: string | null;

  @Index()
  @Column({ name: 'Code', type: 'nvarchar', length: 64, nullable: true })
  code!: string | null;

  @Index()
  @Column({ name: 'NormalizedJobNumber', type: 'nvarchar', length: 20, nullable: true })
  normalizedJobNumber!: string | null;

  @Column({ name: 'Description', type: 'nvarchar', length: 'MAX', nullable: true })
  description!: string | null;

  @Column({ name: 'Color', type: 'nvarchar', length: 20, nullable: true })
  color!: string | null;

  @Column({ name: 'CompanyLabel', type: 'nvarchar', length: 200, nullable: true })
  companyLabel!: string | null;

  @Column({ name: 'GpsAddress', type: 'nvarchar', length: 500, nullable: true })
  gpsAddress!: string | null;

  @Column({ name: 'GpsLatitude', type: 'decimal', precision: 12, scale: 8, nullable: true })
  gpsLatitude!: number | null;

  @Column({ name: 'GpsLongitude', type: 'decimal', precision: 12, scale: 8, nullable: true })
  gpsLongitude!: number | null;

  @Column({ name: 'IsDeleted', type: 'bit', default: false })
  isDeleted!: boolean;

  @Index()
  @Column({ name: 'RefJobId', type: 'int', nullable: true })
  refJobId!: number | null;

  @Column({ name: 'LastSyncedAt', type: 'datetime2', default: () => 'SYSUTCDATETIME()' })
  lastSyncedAt!: Date;
}
