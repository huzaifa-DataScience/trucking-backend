import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'Connecteam_Conversations' })
export class ConnecteamConversation {
  @PrimaryColumn({ name: 'ConversationId', type: 'nvarchar', length: 64 })
  conversationId!: string;

  @Column({ name: 'Title', type: 'nvarchar', length: 500, nullable: true })
  title!: string | null;

  @Column({ name: 'Type', type: 'nvarchar', length: 40, nullable: true })
  type!: string | null;

  @Column({ name: 'ConversationSource', type: 'nvarchar', length: 40, nullable: true })
  conversationSource!: string | null;

  @Column({ name: 'LastSyncedAt', type: 'datetime2', default: () => 'SYSUTCDATETIME()' })
  lastSyncedAt!: Date;
}
