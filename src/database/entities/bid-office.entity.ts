import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** Office/branch dropdown (FollowupCRM parity — no existing office/branch concept elsewhere). */
@Entity({ name: 'Bid_Offices' })
export class BidOffice {
  @PrimaryGeneratedColumn({ name: 'OfficeId' })
  id!: number;

  @Column({ name: 'Name', type: 'nvarchar', length: 200 })
  name!: string;

  @Column({ name: 'SortOrder', type: 'int', default: 0 })
  sortOrder!: number;
}
