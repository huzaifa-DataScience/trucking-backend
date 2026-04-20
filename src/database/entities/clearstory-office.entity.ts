import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'Clearstory_Offices' })
export class ClearstoryOffice {
  @PrimaryColumn({ name: 'Id', type: 'int' })
  id!: number;

  @Column({ name: 'Name', type: 'nvarchar', length: 300, nullable: true })
  name!: string | null;

  @Column({ name: 'BusinessName', type: 'nvarchar', length: 500, nullable: true })
  businessName!: string | null;

  @Column({ name: 'Address', type: 'nvarchar', length: 500, nullable: true })
  address!: string | null;

  @Column({ name: 'City', type: 'nvarchar', length: 200, nullable: true })
  city!: string | null;

  @Column({ name: 'State', type: 'nvarchar', length: 100, nullable: true })
  state!: string | null;

  @Column({ name: 'Country', type: 'nvarchar', length: 200, nullable: true })
  country!: string | null;

  @Column({ name: 'ZipCode', type: 'nvarchar', length: 50, nullable: true })
  zipCode!: string | null;

  @Column({ name: 'Phone', type: 'nvarchar', length: 100, nullable: true })
  phone!: string | null;

  @Column({ name: 'Fax', type: 'nvarchar', length: 100, nullable: true })
  fax!: string | null;

  @Column({ name: 'Lat', type: 'float', nullable: true })
  lat!: number | null;

  @Column({ name: 'Lng', type: 'float', nullable: true })
  lng!: number | null;

  @Column({ name: 'CustomId', type: 'nvarchar', length: 200, nullable: true })
  customId!: string | null;

  @Column({ name: 'TzName', type: 'nvarchar', length: 200, nullable: true })
  tzName!: string | null;

  @Column({ name: 'RegionId', type: 'int', nullable: true })
  regionId!: number | null;

  @Column({ name: 'UpdatedAt', type: 'datetime2', nullable: true })
  updatedAt!: Date | null;

  @Column({ name: 'CreatedAt', type: 'datetime2', nullable: true })
  createdAt!: Date | null;

  @Column({ name: 'LastSyncedAt', type: 'datetime2', default: () => 'SYSUTCDATETIME()' })
  lastSyncedAt!: Date;
}
