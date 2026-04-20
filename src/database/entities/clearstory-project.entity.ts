import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'Clearstory_Projects' })
export class ClearstoryProject {
  @PrimaryColumn({ name: 'Id', type: 'int' })
  id!: number;

  @Column({ name: 'JobNumber', type: 'nvarchar', length: 100, nullable: true })
  jobNumber!: string | null;

  @Column({ name: 'CustomerJobNumber', type: 'nvarchar', length: 100, nullable: true })
  customerJobNumber!: string | null;

  @Column({ name: 'Name', type: 'nvarchar', length: 255, nullable: true })
  name!: string | null;

  @Column({ name: 'OfficeId', type: 'int', nullable: true })
  officeId!: number | null;

  @Column({ name: 'OfficeName', type: 'nvarchar', length: 255, nullable: true })
  officeName!: string | null;

  @Column({ name: 'Region', type: 'nvarchar', length: 100, nullable: true })
  region!: string | null;

  @Column({ name: 'Division', type: 'nvarchar', length: 100, nullable: true })
  division!: string | null;

  @Column({ name: 'CustomerName', type: 'nvarchar', length: 255, nullable: true })
  customerName!: string | null;

  @Column({ name: 'CustomerId', type: 'int', nullable: true })
  customerId!: number | null;

  @Column({ name: 'CompanyId', type: 'int', nullable: true })
  companyId!: number | null;

  @Column({ name: 'Archived', type: 'bit', nullable: true })
  archived!: boolean | null;

  @Column({ name: 'OriginType', type: 'nvarchar', length: 100, nullable: true })
  originType!: string | null;

  @Column({ name: 'SiteProjectAddress', type: 'nvarchar', length: 500, nullable: true })
  siteProjectAddress!: string | null;

  @Column({ name: 'SiteStreetAddress', type: 'nvarchar', length: 500, nullable: true })
  siteStreetAddress!: string | null;

  @Column({ name: 'SiteCity', type: 'nvarchar', length: 200, nullable: true })
  siteCity!: string | null;

  @Column({ name: 'SiteState', type: 'nvarchar', length: 100, nullable: true })
  siteState!: string | null;

  @Column({ name: 'SiteZipCode', type: 'nvarchar', length: 50, nullable: true })
  siteZipCode!: string | null;

  @Column({ name: 'SiteCountry', type: 'nvarchar', length: 200, nullable: true })
  siteCountry!: string | null;

  @Column({ name: 'StartDate', type: 'date', nullable: true })
  startDate!: string | null;

  @Column({ name: 'EndDate', type: 'date', nullable: true })
  endDate!: string | null;

  @Column({ name: 'BaseContractValue', type: 'decimal', precision: 18, scale: 2, nullable: true })
  baseContractValue!: string | null;

  @Column({ name: 'UpdatedAt', type: 'datetime2', nullable: true })
  updatedAt!: Date | null;

  @Column({ name: 'CreatedAt', type: 'datetime2', nullable: true })
  createdAt!: Date | null;

  @Column({ name: 'LastSyncedAt', type: 'datetime2', default: () => 'SYSUTCDATETIME()' })
  lastSyncedAt!: Date;
}
