import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** Project type dropdown (Base Bid `Project_Type`). */
@Entity({ name: 'Bid_ProjectTypes' })
export class BidProjectType {
  @PrimaryGeneratedColumn({ name: 'ProjectTypeId' })
  id!: number;

  @Column({ name: 'Name', type: 'nvarchar', length: 200 })
  name!: string;

  @Column({ name: 'SortOrder', type: 'int', default: 0 })
  sortOrder!: number;
}
