import { Column, Entity, ManyToOne, PrimaryColumn, JoinColumn } from 'typeorm';
import { SitelineContract } from './siteline-contract.entity';

@Entity({ name: 'Siteline_PayApps' })
export class SitelinePayApp {
  @PrimaryColumn({ type: 'nvarchar', length: 50 })
  id!: string;

  // Backing column is ContractId in the table
  @Column({ name: 'ContractId', type: 'nvarchar', length: 50 })
  contractId!: string;

  @ManyToOne(() => SitelineContract)
  @JoinColumn({ name: 'ContractId', referencedColumnName: 'id' })
  contract!: SitelineContract;

  @Column({ type: 'int', nullable: true })
  number!: number | null;

  @Column({ type: 'nvarchar', length: 50, nullable: true })
  status!: string | null;

  @Column({ type: 'bigint', nullable: true })
  billed!: number | null;

  @Column({ type: 'bigint', nullable: true })
  retention!: number | null;

  @Column({ type: 'bigint', nullable: true })
  totalValue!: number | null;

  @Column({ name: 'StartDate', type: 'datetime2', nullable: true })
  startDate!: Date | null;

  @Column({ type: 'datetime2', nullable: true })
  endDate!: Date | null;

  @Column({ type: 'datetime2', nullable: true })
  dueDate!: Date | null;

  @Column({ type: 'datetime2', nullable: true })
  updatedAt!: Date | null;

  @Column({ type: 'datetime2', nullable: true })
  createdAt!: Date | null;

  @Column({ type: 'datetime2', default: () => 'SYSUTCDATETIME()' })
  lastSyncedAt!: Date;
}

