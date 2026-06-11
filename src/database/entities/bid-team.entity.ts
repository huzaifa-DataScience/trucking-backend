import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** Bidding team roster (Base Bid `Team_list` + role columns). Selecting a team auto-fills crew. */
@Entity({ name: 'Bid_Teams' })
export class BidTeam {
  @PrimaryGeneratedColumn({ name: 'TeamId' })
  id!: number;

  @Column({ name: 'TeamName', type: 'nvarchar', length: 100 })
  teamName!: string;

  @Column({ name: 'Captain', type: 'nvarchar', length: 100, nullable: true })
  captain!: string | null;

  @Column({ name: 'BidClerk', type: 'nvarchar', length: 100, nullable: true })
  bidClerk!: string | null;

  @Column({ name: 'Duct1', type: 'nvarchar', length: 100, nullable: true })
  duct1!: string | null;

  @Column({ name: 'Duct2', type: 'nvarchar', length: 100, nullable: true })
  duct2!: string | null;

  @Column({ name: 'Hydronic1', type: 'nvarchar', length: 100, nullable: true })
  hydronic1!: string | null;

  @Column({ name: 'Hydronic2', type: 'nvarchar', length: 100, nullable: true })
  hydronic2!: string | null;

  @Column({ name: 'Plumbing1', type: 'nvarchar', length: 100, nullable: true })
  plumbing1!: string | null;

  @Column({ name: 'Plumbing2', type: 'nvarchar', length: 100, nullable: true })
  plumbing2!: string | null;

  @Column({ name: 'IsActive', type: 'bit', default: true })
  isActive!: boolean;

  @Column({ name: 'SortOrder', type: 'int', default: 0 })
  sortOrder!: number;
}
