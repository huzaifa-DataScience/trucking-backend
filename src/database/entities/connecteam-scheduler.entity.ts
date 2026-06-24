import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'Connecteam_Schedulers' })
export class ConnecteamScheduler {
  @PrimaryColumn({ name: 'SchedulerId', type: 'int' })
  schedulerId!: number;

  @Column({ name: 'Name', type: 'nvarchar', length: 200 })
  name!: string;

  @Column({ name: 'Timezone', type: 'nvarchar', length: 80, nullable: true })
  timezone!: string | null;

  @Column({ name: 'IsArchived', type: 'bit', default: false })
  isArchived!: boolean;

  @Column({ name: 'LastSyncedAt', type: 'datetime2', default: () => 'SYSUTCDATETIME()' })
  lastSyncedAt!: Date;
}
