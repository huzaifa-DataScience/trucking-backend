import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'Connecteam_SyncState' })
export class ConnecteamSyncState {
  @PrimaryColumn({ name: 'Key', type: 'nvarchar', length: 100 })
  key!: string;

  @Column({ name: 'Value', type: 'nvarchar', length: 'MAX', nullable: true })
  value!: string | null;

  @Column({ name: 'UpdatedAt', type: 'datetime2', default: () => 'SYSUTCDATETIME()' })
  updatedAt!: Date;
}
