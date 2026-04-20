import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'Clearstory_ChangeNotificationContracts' })
export class ClearstoryChangeNotificationContract {
  @PrimaryColumn({ name: 'ChangeNotificationId', type: 'nvarchar', length: 32 })
  changeNotificationId!: string;

  @PrimaryColumn({ name: 'ContractId', type: 'int' })
  contractId!: number;

  @Column({ name: 'NoCostImpact', type: 'bit', nullable: true })
  noCostImpact!: boolean | null;

  @Column({ name: 'HasResponded', type: 'bit', nullable: true })
  hasResponded!: boolean | null;

  @Column({ name: 'Estimate', type: 'decimal', precision: 18, scale: 2, nullable: true })
  estimate!: string | null;

  @Column({ name: 'FileDownloadCount', type: 'int', nullable: true })
  fileDownloadCount!: number | null;

  @Column({ name: 'ContractName', type: 'nvarchar', length: 500, nullable: true })
  contractName!: string | null;

  @Column({ name: 'ContractValue', type: 'decimal', precision: 18, scale: 2, nullable: true })
  contractValue!: string | null;

  @Column({ name: 'ResponseUpdatedAt', type: 'datetime2', nullable: true })
  responseUpdatedAt!: Date | null;

  @Column({ name: 'ResponseCreatedAt', type: 'datetime2', nullable: true })
  responseCreatedAt!: Date | null;

  @Column({ name: 'LastSyncedAt', type: 'datetime2', default: () => 'SYSUTCDATETIME()' })
  lastSyncedAt!: Date;
}
