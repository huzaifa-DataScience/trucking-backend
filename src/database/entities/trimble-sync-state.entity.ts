import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * Key/value store for Trimble Materials sync state (last run, last error, phase timestamps, etc).
 * Same shape as ClearstorySyncState so dashboards can read it consistently.
 */
@Entity({ name: 'Trimble_SyncState' })
export class TrimbleSyncState {
  @PrimaryColumn({ name: 'Key', type: 'nvarchar', length: 100 })
  key!: string;

  @Column({ name: 'Value', type: 'nvarchar', nullable: true })
  value!: string | null;

  @Column({ name: 'UpdatedAt', type: 'datetime2', default: () => 'SYSUTCDATETIME()' })
  updatedAt!: Date;
}
