import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * Mirror of a StructShare / Trimble Materials project, sourced from
 * GET /api/next/project?page=N&limit=25&isActive=true.
 *
 * `id` matches the upstream StructShare project id so per-project XLSX
 * exports (line-items, etc.) can be tied back to this row by projectId.
 */
@Entity({ name: 'Trimble_Projects' })
export class TrimbleProject {
  @PrimaryColumn({ name: 'Id', type: 'bigint' })
  id!: number;

  @Index()
  @Column({ name: 'Name', type: 'nvarchar', nullable: true })
  name!: string | null;

  @Column({ name: 'CompanyId', type: 'bigint', nullable: true })
  companyId!: number | null;

  @Column({ name: 'SubCompanyId', type: 'bigint', nullable: true })
  subCompanyId!: number | null;

  @Column({ name: 'SubCompanyName', type: 'nvarchar', nullable: true })
  subCompanyName!: string | null;

  @Column({ name: 'JobNumber', type: 'nvarchar', length: 200, nullable: true })
  jobNumber!: string | null;

  @Column({ name: 'Address', type: 'nvarchar', nullable: true })
  address!: string | null;

  @Column({ name: 'IsActive', type: 'bit', nullable: true })
  isActive!: boolean | null;

  @Column({ name: 'IsWarehouse', type: 'bit', nullable: true })
  isWarehouse!: boolean | null;

  @Column({ name: 'WarehouseId', type: 'bigint', nullable: true })
  warehouseId!: number | null;

  @Column({ name: 'DeliveryContactName', type: 'nvarchar', nullable: true })
  deliveryContactName!: string | null;

  @Column({ name: 'DeliveryContactPhoneNumber', type: 'nvarchar', length: 100, nullable: true })
  deliveryContactPhoneNumber!: string | null;

  /** Full JSON row from /api/next/project for this project (lets us recover any field we didn't map). */
  @Column({ name: 'PayloadJson', type: 'nvarchar', nullable: true })
  payloadJson!: string | null;

  @Column({ name: 'LastSeenAt', type: 'datetime2', default: () => 'SYSUTCDATETIME()' })
  lastSeenAt!: Date;
}
