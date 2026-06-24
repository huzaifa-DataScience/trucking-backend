import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'Connecteam_Account' })
export class ConnecteamAccount {
  @PrimaryColumn({ name: 'CompanyId', type: 'nvarchar', length: 64 })
  companyId!: string;

  @Column({ name: 'CompanyName', type: 'nvarchar', length: 500, nullable: true })
  companyName!: string | null;

  @Column({ name: 'LastSyncedAt', type: 'datetime2', default: () => 'SYSUTCDATETIME()' })
  lastSyncedAt!: Date;
}
