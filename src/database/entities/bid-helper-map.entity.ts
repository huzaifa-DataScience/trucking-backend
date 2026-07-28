import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'Bid_HelperMap' })
export class BidHelperMap {
  @PrimaryGeneratedColumn({ name: 'HelperMapId' })
  id!: number;

  @Column({ name: 'SpecPhrase', type: 'nvarchar', length: 200 })
  specPhrase!: string;

  @Column({ name: 'Keyword', type: 'nvarchar', length: 100 })
  keyword!: string;

  @Column({ name: 'Keyword2', type: 'nvarchar', length: 100, nullable: true })
  keyword2!: string | null;

  @Column({ name: 'RawPrefix', type: 'nvarchar', length: 200, nullable: true })
  rawPrefix!: string | null;

  @Column({ name: 'BaseName', type: 'nvarchar', length: 100, nullable: true })
  baseName!: string | null;

  @Column({ name: 'SortOrder', type: 'int', default: 0 })
  sortOrder!: number;

  @Column({ name: 'IsActive', type: 'bit', default: true })
  isActive!: boolean;
}
