import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'Clearstory_Contracts' })
export class ClearstoryContract {
  @PrimaryColumn({ name: 'Id', type: 'int' })
  id!: number;

  @Column({ name: 'Name', type: 'nvarchar', length: 500, nullable: true })
  name!: string | null;

  @Column({ name: 'ContractValue', type: 'decimal', precision: 18, scale: 2, nullable: true })
  contractValue!: string | null;

  @Column({ name: 'CustomerProjectId', type: 'int', nullable: true })
  customerProjectId!: number | null;

  @Column({ name: 'ContractorProjectId', type: 'int', nullable: true })
  contractorProjectId!: number | null;

  @Column({ name: 'LastSyncedAt', type: 'datetime2', default: () => 'SYSUTCDATETIME()' })
  lastSyncedAt!: Date;
}
