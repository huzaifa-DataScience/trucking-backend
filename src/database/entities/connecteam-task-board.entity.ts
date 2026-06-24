import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'Connecteam_TaskBoards' })
export class ConnecteamTaskBoard {
  @PrimaryColumn({ name: 'TaskBoardId', type: 'int' })
  taskBoardId!: number;

  @Column({ name: 'Name', type: 'nvarchar', length: 200 })
  name!: string;

  @Column({ name: 'IsArchived', type: 'bit', default: false })
  isArchived!: boolean;

  @Column({ name: 'LastSyncedAt', type: 'datetime2', default: () => 'SYSUTCDATETIME()' })
  lastSyncedAt!: Date;
}
