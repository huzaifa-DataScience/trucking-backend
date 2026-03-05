import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Ticket } from './ticket.entity';

@Entity('Ref_Drivers', { schema: 'dbo' })
export class Driver {
  @PrimaryGeneratedColumn({ name: 'DriverID' })
  id: number;

  @Column({ name: 'DriverName', type: 'nvarchar', nullable: true })
  driverName: string | null;

  @Column({ name: 'Phone', type: 'nvarchar', nullable: true })
  phone: string | null;

  @Column({ name: 'Email', type: 'nvarchar', nullable: true })
  email: string | null;

  @OneToMany(() => Ticket, (t: Ticket) => t.driver)
  tickets: Ticket[];
}
