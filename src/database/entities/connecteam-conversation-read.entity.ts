import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/** Per dashboard user last-read cursor for Connecteam chat unread badges. */
@Entity({ name: 'Connecteam_ConversationReads' })
export class ConnecteamConversationRead {
  @PrimaryColumn({ name: 'AppUserId', type: 'int' })
  appUserId!: number;

  @PrimaryColumn({ name: 'ConversationId', type: 'nvarchar', length: 64 })
  conversationId!: string;

  @Column({ name: 'LastReadMessageId', type: 'bigint', nullable: true })
  lastReadMessageId!: string | null;

  @Index()
  @Column({ name: 'LastReadAt', type: 'datetime2' })
  lastReadAt!: Date;

  @Column({ name: 'UpdatedAt', type: 'datetime2', default: () => 'SYSUTCDATETIME()' })
  updatedAt!: Date;
}
