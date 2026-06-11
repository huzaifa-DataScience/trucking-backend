import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** Building type dropdown (Base Bid `Type_Of_Building`). */
@Entity({ name: 'Bid_BuildingTypes' })
export class BidBuildingType {
  @PrimaryGeneratedColumn({ name: 'BuildingTypeId' })
  id!: number;

  @Column({ name: 'Name', type: 'nvarchar', length: 200 })
  name!: string;

  @Column({ name: 'SortOrder', type: 'int', default: 0 })
  sortOrder!: number;
}
