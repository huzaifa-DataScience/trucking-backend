import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Ticket } from './ticket.entity';

@Entity('Ref_Jobs', { schema: 'dbo' })
export class Job {
  @PrimaryGeneratedColumn({ name: 'JobID' })
  id: number;

  @Column({ name: 'JobNumber', type: 'nvarchar', nullable: true })
  jobNumber: string | null;

  @Column({ name: 'JobName', type: 'nvarchar' })
  name: string;

  @Column({ name: 'EntityID', type: 'int', nullable: true })
  entityId: number | null;

  @Column({ name: 'JobAddress', type: 'nvarchar', nullable: true })
  jobAddress: string | null;

  @Column({ name: 'City', type: 'nvarchar', nullable: true })
  city: string | null;

  @Column({ name: 'IsActive', type: 'bit', default: true })
  isActive: boolean;

  @OneToMany(() => Ticket, (t: Ticket) => t.job)
  tickets: Ticket[];
}
