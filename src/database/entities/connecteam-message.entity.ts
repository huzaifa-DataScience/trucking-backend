import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'Connecteam_Messages' })
export class ConnecteamMessage {
  @PrimaryGeneratedColumn({ name: 'MessageId', type: 'bigint' })
  messageId!: string;

  @Index()
  @Column({ name: 'ConversationId', type: 'nvarchar', length: 64 })
  conversationId!: string;

  @Index()
  @Column({ name: 'UserId', type: 'int', nullable: true })
  userId!: number | null;

  @Column({ name: 'AppUserId', type: 'int', nullable: true })
  appUserId!: number | null;

  @Column({ name: 'Body', type: 'nvarchar', length: 'MAX' })
  body!: string;

  @Column({ name: 'SentAt', type: 'datetime2', default: () => 'SYSUTCDATETIME()' })
  sentAt!: Date;

  @Column({ name: 'RecordSource', type: 'nvarchar', length: 10, default: 'native' })
  recordSource!: 'sync' | 'native';

  @Column({ name: 'ExternalMessageId', type: 'nvarchar', length: 64, nullable: true })
  externalMessageId!: string | null;
}
