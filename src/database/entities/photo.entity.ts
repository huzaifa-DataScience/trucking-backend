import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Ticket } from './ticket.entity';

/** PhotoType values from GoFormz (e.g. Ticket, Truck1, Truck2, Scrap, Asbestos). */
export enum PhotoType {
  PhysicalTicket = 'Ticket',
  Truck1 = 'Truck1',
  Truck2 = 'Truck2',
  Asbestos = 'Asbestos',
  Scrap = 'Scrap',
}

@Entity('Fact_TicketPhotos', { schema: 'dbo' })
export class Photo {
  @PrimaryGeneratedColumn({ name: 'PhotoID' })
  id: number;

  @Column({ name: 'TicketID', type: 'int' })
  ticketId: number;

  @Column({ name: 'PhotoType', type: 'nvarchar' })
  photoType: string;

  @Column({ name: 'PhotoURL', type: 'nvarchar', nullable: true })
  url: string | null;

  @Column({ name: 'UploadedAt', type: 'datetime', nullable: true })
  uploadedAt: Date | null;

  @ManyToOne(() => Ticket, (t: Ticket) => t.photos, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'TicketID' })
  ticket: Ticket;
}
