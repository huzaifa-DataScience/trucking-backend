import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Ticket } from './ticket.entity';

@Entity('Ref_TruckTypes', { schema: 'dbo' })
export class TruckType {
  @PrimaryGeneratedColumn({ name: 'TruckTypeID' })
  id: number;

  @Column({ name: 'TypeName', type: 'nvarchar' })
  name: string;

  @OneToMany(() => Ticket, (t: Ticket) => t.truckType)
  tickets: Ticket[];
}
