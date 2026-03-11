import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Ticket } from './ticket.entity';

@Entity('Ref_ExternalCompanies', { schema: 'dbo' })
export class Hauler {
  @PrimaryGeneratedColumn({ name: 'CompanyID' })
  id: number;

  @Column({ name: 'CompanyName', type: 'nvarchar' })
  companyName: string;

  @Column({ name: 'Address', type: 'nvarchar', nullable: true })
  address: string | null;

  @Column({ name: 'City', type: 'nvarchar', nullable: true })
  city: string | null;

  @Column({ name: 'IsActive', type: 'bit', default: true })
  isActive: boolean;

  @OneToMany(() => Ticket, (t: Ticket) => t.hauler)
  tickets: Ticket[];
}
