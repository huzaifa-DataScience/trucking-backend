import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Ticket } from './ticket.entity';

@Entity('Ref_ExternalSites', { schema: 'dbo' })
export class ExternalSite {
  @PrimaryGeneratedColumn({ name: 'SiteID' })
  id: number;

  @Column({ name: 'SiteName', type: 'nvarchar' })
  name: string;

  @Column({ name: 'SiteType', type: 'nvarchar', nullable: true })
  siteType: string | null;

  @Column({ name: 'Address', type: 'nvarchar', nullable: true })
  address: string | null;

  @Column({ name: 'City', type: 'nvarchar', nullable: true })
  city: string | null;

  @OneToMany(() => Ticket, (t: Ticket) => t.externalSite)
  tickets: Ticket[];
}
