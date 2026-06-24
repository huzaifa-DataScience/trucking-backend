import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'Connecteam_WebhookEvents' })
export class ConnecteamWebhookEvent {
  @PrimaryGeneratedColumn({ name: 'Id', type: 'bigint' })
  id!: string;

  @Column({ name: 'RequestId', type: 'nvarchar', length: 64, nullable: true })
  requestId!: string | null;

  @Column({ name: 'FeatureType', type: 'nvarchar', length: 40, nullable: true })
  featureType!: string | null;

  @Column({ name: 'EventType', type: 'nvarchar', length: 80, nullable: true })
  eventType!: string | null;

  @Column({ name: 'ActivityType', type: 'nvarchar', length: 40, nullable: true })
  activityType!: string | null;

  @Column({ name: 'EventTimestamp', type: 'bigint', nullable: true })
  eventTimestamp!: string | null;

  @Column({ name: 'PayloadJson', type: 'nvarchar', length: 'max', nullable: true })
  payloadJson!: string | null;

  @Column({ name: 'ReceivedAt', type: 'datetime2', default: () => 'SYSUTCDATETIME()' })
  receivedAt!: Date;
}
