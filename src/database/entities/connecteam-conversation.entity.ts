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

  @Column({ name: 'RecordSource', type: 'nvarchar', length: 10, default: 'sync' })
  recordSource!: 'sync' | 'native';

  @Column({ name: 'IsDeleted', type: 'bit', default: false })
  isDeleted!: boolean;

  @Column({ name: 'LastMessageAt', type: 'datetime2', nullable: true })
  lastMessageAt!: Date | null;

  @Column({ name: 'LastMessagePreview', type: 'nvarchar', length: 500, nullable: true })
  lastMessagePreview!: string | null;

  @Column({ name: 'LastMessageSenderName', type: 'nvarchar', length: 200, nullable: true })
  lastMessageSenderName!: string | null;

  @Column({ name: 'MessageCount', type: 'int', default: 0 })
  messageCount!: number;
}
