import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** Intake party directory (owner / architect / ME / invite contact). Not Ref_OurEntities. */
@Entity({ name: 'Bid_Parties' })
export class BidParty {
  @PrimaryGeneratedColumn({ name: 'PartyId' })
  id!: number;

  @Column({ name: 'Role', type: 'nvarchar', length: 40 })
  role!: string;

  @Column({ name: 'Name', type: 'nvarchar', length: 500, nullable: true })
  name!: string | null;

  @Column({ name: 'Company', type: 'nvarchar', length: 500, nullable: true })
  company!: string | null;

  @Column({ name: 'ContactName', type: 'nvarchar', length: 500, nullable: true })
  contactName!: string | null;

  @Column({ name: 'Email', type: 'nvarchar', length: 500, nullable: true })
  email!: string | null;

  @Column({ name: 'Phone', type: 'nvarchar', length: 100, nullable: true })
  phone!: string | null;

  @Column({ name: 'DedupeKey', type: 'nvarchar', length: 400 })
  dedupeKey!: string;

  @Column({ name: 'UpdatedAt', type: 'datetime2', default: () => 'SYSUTCDATETIME()' })
  updatedAt!: Date;
}
