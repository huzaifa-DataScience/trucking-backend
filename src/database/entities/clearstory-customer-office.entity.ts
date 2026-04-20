import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'Clearstory_CustomerOffices' })
export class ClearstoryCustomerOffice {
  @PrimaryColumn({ name: 'CustomerId', type: 'int' })
  customerId!: number;

  @PrimaryColumn({ name: 'OfficeId', type: 'int' })
  officeId!: number;

  @Column({ name: 'LastSyncedAt', type: 'datetime2', default: () => 'SYSUTCDATETIME()' })
  lastSyncedAt!: Date;
}
