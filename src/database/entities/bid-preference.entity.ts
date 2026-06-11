import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** MBE / set-aside preference dropdown (Base Bid `Preference`). */
@Entity({ name: 'Bid_Preferences' })
export class BidPreference {
  @PrimaryGeneratedColumn({ name: 'PreferenceId' })
  id!: number;

  @Column({ name: 'Name', type: 'nvarchar', length: 200 })
  name!: string;

  @Column({ name: 'SortOrder', type: 'int', default: 0 })
  sortOrder!: number;
}
