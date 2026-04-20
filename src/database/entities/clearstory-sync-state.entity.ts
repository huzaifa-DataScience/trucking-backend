import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'Clearstory_SyncState' })
export class ClearstorySyncState {
  @PrimaryColumn({ name: 'Key', type: 'nvarchar', length: 100 })
  key!: string;

  @Column({ name: 'Value', type: 'nvarchar', nullable: true })
  value!: string | null;

  @Column({ name: 'UpdatedAt', type: 'datetime2', default: () => 'SYSUTCDATETIME()' })
  updatedAt!: Date;
}

