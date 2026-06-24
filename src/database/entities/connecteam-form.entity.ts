import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'Connecteam_Forms' })
export class ConnecteamForm {
  @PrimaryColumn({ name: 'FormId', type: 'nvarchar', length: 64 })
  formId!: string;

  @Column({ name: 'Name', type: 'nvarchar', length: 500, nullable: true })
  name!: string | null;

  @Column({ name: 'IsArchived', type: 'bit', default: false })
  isArchived!: boolean;

  @Column({ name: 'LastSyncedAt', type: 'datetime2', default: () => 'SYSUTCDATETIME()' })
  lastSyncedAt!: Date;
}
