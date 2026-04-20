import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'Clearstory_SyncSnapshots' })
export class ClearstorySyncSnapshot {
  @PrimaryGeneratedColumn({ name: 'Id' })
  id!: number;

  @Column({ name: 'ResourceType', type: 'nvarchar', length: 80 })
  resourceType!: string;

  @Column({ name: 'ResourceKey', type: 'nvarchar', length: 400 })
  resourceKey!: string;

  @Column({ name: 'Payload', type: 'nvarchar', nullable: true })
  payload!: string | null;

  @Column({ name: 'FetchedAt', type: 'datetime2', default: () => 'SYSUTCDATETIME()' })
  fetchedAt!: Date;
}
