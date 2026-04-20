import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'Clearstory_Customers' })
export class ClearstoryCustomer {
  @PrimaryColumn({ name: 'Id', type: 'int' })
  id!: number;

  @Column({ name: 'Name', type: 'nvarchar', length: 500, nullable: true })
  name!: string | null;

  @Column({ name: 'InternalId', type: 'nvarchar', length: 200, nullable: true })
  internalId!: string | null;

  @Column({ name: 'CreatorId', type: 'int', nullable: true })
  creatorId!: number | null;

  @Column({ name: 'Address', type: 'nvarchar', length: 500, nullable: true })
  address!: string | null;

  @Column({ name: 'City', type: 'nvarchar', length: 200, nullable: true })
  city!: string | null;

  @Column({ name: 'State', type: 'nvarchar', length: 100, nullable: true })
  state!: string | null;

  @Column({ name: 'ZipCode', type: 'nvarchar', length: 50, nullable: true })
  zipCode!: string | null;

  @Column({ name: 'Country', type: 'nvarchar', length: 200, nullable: true })
  country!: string | null;

  @Column({ name: 'Phone', type: 'nvarchar', length: 100, nullable: true })
  phone!: string | null;

  @Column({ name: 'Fax', type: 'nvarchar', length: 100, nullable: true })
  fax!: string | null;

  @Column({ name: 'LastSyncedAt', type: 'datetime2', default: () => 'SYSUTCDATETIME()' })
  lastSyncedAt!: Date;
}
