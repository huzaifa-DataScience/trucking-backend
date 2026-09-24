import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** A person's own calendar event. Other calendar items are derived, not stored. */
@Entity({ name: 'Calendar_Events' })
export class CalendarEvent {
  @PrimaryGeneratedColumn({ name: 'EventId' })
  id!: number;

  @Index()
  @Column({ name: 'OwnerUserId', type: 'int' })
  ownerUserId!: number;

  @Column({ name: 'Title', type: 'nvarchar', length: 200 })
  title!: string;

  @Column({ name: 'Description', type: 'nvarchar', length: 2000, nullable: true })
  description!: string | null;

  @Column({ name: 'Location', type: 'nvarchar', length: 300, nullable: true })
  location!: string | null;

  @Column({ name: 'AllDay', type: 'bit', default: false })
  allDay!: boolean;

  /** All-day events: UTC midnight of the date. */
  @Column({ name: 'StartAt', type: 'datetime2' })
  startAt!: Date;

  /** All-day events: inclusive last day. Null = same as start. */
  @Column({ name: 'EndAt', type: 'datetime2', nullable: true })
  endAt!: Date | null;

  @Column({ name: 'BidId', type: 'int', nullable: true })
  bidId!: number | null;

  @Column({ name: 'CreatedAt', type: 'datetime2', default: () => 'SYSUTCDATETIME()' })
  createdAt!: Date;

  @Column({ name: 'UpdatedAt', type: 'datetime2', default: () => 'SYSUTCDATETIME()' })
  updatedAt!: Date;
}
