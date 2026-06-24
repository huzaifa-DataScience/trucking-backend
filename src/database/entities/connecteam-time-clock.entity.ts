import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'Connecteam_TimeClocks' })
export class ConnecteamTimeClock {
  @PrimaryColumn({ name: 'TimeClockId', type: 'int' })
  timeClockId!: number;

  @Column({ name: 'Name', type: 'nvarchar', length: 200 })
  name!: string;

  @Column({ name: 'IsArchived', type: 'bit', default: false })
  isArchived!: boolean;

  @Column({ name: 'LastSyncedAt', type: 'datetime2', default: () => 'SYSUTCDATETIME()' })
  lastSyncedAt!: Date;
}
