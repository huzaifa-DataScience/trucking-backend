import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Driver } from './driver.entity';
import { ExternalSite } from './external-site.entity';
import { Hauler } from './hauler.entity';
import { Job } from './job.entity';
import { Material } from './material.entity';
import { Photo } from './photo.entity';
import { TruckType } from './truck-type.entity';

export type Direction = 'Import' | 'Export';

@Entity('Fact_SiteTickets', { schema: 'dbo' })
export class Ticket {
  @PrimaryGeneratedColumn({ name: 'TicketID' })
  id: number;

  @Column({ name: 'GoFormzID', type: 'nvarchar', nullable: true })
  goFormzId: string | null;

  @Column({ name: 'FormTicketNumber', type: 'nvarchar' })
  ticketNumber: string;

  @Column({ name: 'TicketDate', type: 'date' })
  ticketDate: Date;

  @Column({ name: 'CreatedAt', type: 'datetime' })
  createdAt: Date;

  @Column({ name: 'JobID', type: 'int' })
  jobId: number;

  @Column({ name: 'Direction', type: 'nvarchar' })
  direction: Direction;

  @Column({ name: 'ExternalSiteID', type: 'int' })
  externalSiteId: number;

  @Column({ name: 'TruckingCompanyID', type: 'int' })
  haulerId: number;

  @Column({ name: 'MaterialID', type: 'int' })
  materialId: number;

  @Column({ name: 'TruckNumber', type: 'nvarchar', nullable: true })
  truckNumber: string | null;

  @Column({ name: 'TruckTypeID', type: 'int', nullable: true })
  truckTypeId: number | null;

  @Column({ name: 'DriverID', type: 'int', nullable: true })
  driverId: number | null;

  @Column({ name: 'HasPhysicalTicket', type: 'bit', default: false })
  hasPhysicalTicket: boolean;

  @Column({ name: 'PhysicalTicketNumber', type: 'nvarchar', nullable: true })
  physicalTicketNumber: string | null;

  @Column({ name: 'SignedBy', type: 'nvarchar', nullable: true })
  signedBy: string | null;

  @ManyToOne(() => Job, (j: Job) => j.tickets, { eager: true })
  @JoinColumn({ name: 'JobID' })
  job: Job;

  @ManyToOne(() => Material, (m: Material) => m.tickets, { eager: true })
  @JoinColumn({ name: 'MaterialID' })
  material: Material;

  @ManyToOne(() => Hauler, (h: Hauler) => h.tickets, { eager: true })
  @JoinColumn({ name: 'TruckingCompanyID' })
  hauler: Hauler;

  @ManyToOne(() => ExternalSite, (e: ExternalSite) => e.tickets, { eager: true })
  @JoinColumn({ name: 'ExternalSiteID' })
  externalSite: ExternalSite;

  @ManyToOne(() => TruckType, (tt: TruckType) => tt.tickets, { eager: true })
  @JoinColumn({ name: 'TruckTypeID' })
  truckType: TruckType | null;

  @ManyToOne(() => Driver, (d: Driver) => d.tickets, { eager: true })
  @JoinColumn({ name: 'DriverID' })
  driver: Driver | null;

  @OneToMany(() => Photo, (p: Photo) => p.ticket, { cascade: true })
  photos: Photo[];
}
