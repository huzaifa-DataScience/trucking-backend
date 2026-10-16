import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { ExternalSite } from './external-site.entity';
import { Hauler } from './hauler.entity';
import { Job } from './job.entity';

/** Priced haul service. The company itself stays on Ref_ExternalCompanies. */
@Entity({ name: 'Ops_HaulerRates' })
export class OpsHaulerRate {
  @PrimaryGeneratedColumn({ name: 'HaulerRateId' })
  id!: number;

  @Column({ name: 'CompanyId', type: 'int', nullable: true })
  companyId!: number | null;

  @ManyToOne(() => Hauler, { nullable: true })
  @JoinColumn({ name: 'CompanyId' })
  company!: Hauler | null;

  @Column({ name: 'CompanyName', type: 'nvarchar', length: 300 })
  companyName!: string;

  @Column({ name: 'Category', type: 'nvarchar', length: 300, nullable: true })
  category!: string | null;

  @Column({ name: 'RatePerLoad', type: 'decimal', precision: 18, scale: 4, default: 0 })
  ratePerLoad!: string;

  @Column({ name: 'RatePerHour', type: 'decimal', precision: 18, scale: 4, default: 0 })
  ratePerHour!: string;

  @Column({ name: 'Unit', type: 'nvarchar', length: 50, nullable: true })
  unit!: string | null;

  /** Recorded. Not used in the cost. */
  @Column({ name: 'ShowUpHours', type: 'decimal', precision: 18, scale: 4, nullable: true })
  showUpHours!: string | null;

  @Column({ name: 'Address', type: 'nvarchar', length: 400, nullable: true })
  address!: string | null;

  @Column({ name: 'Phone', type: 'nvarchar', length: 80, nullable: true })
  phone!: string | null;

  @Column({ name: 'Contact', type: 'nvarchar', length: 200, nullable: true })
  contact!: string | null;

  @Column({ name: 'Email', type: 'nvarchar', length: 200, nullable: true })
  email!: string | null;

  @Column({ name: 'Coi', type: 'nvarchar', length: 200, nullable: true })
  coi!: string | null;

  @Column({ name: 'IsActive', type: 'bit', default: true })
  isActive!: boolean;

  /** Excel row, so a re-import updates this card instead of inserting another. */
  @Column({ name: 'SourceRow', type: 'int', nullable: true })
  sourceRow!: number | null;
}

/** Priced dump / recycle / import line. Not a second site master. */
@Entity({ name: 'Ops_DisposalRates' })
export class OpsDisposalRate {
  @PrimaryGeneratedColumn({ name: 'DisposalRateId' })
  id!: number;

  @Column({ name: 'SiteId', type: 'int', nullable: true })
  siteId!: number | null;

  @ManyToOne(() => ExternalSite, { nullable: true })
  @JoinColumn({ name: 'SiteId' })
  site!: ExternalSite | null;

  @Column({ name: 'CompanyName', type: 'nvarchar', length: 300 })
  companyName!: string;

  /** Sheet column I. Part of the dropdown label. */
  @Column({ name: 'UnitLabel', type: 'nvarchar', length: 100, nullable: true })
  unitLabel!: string | null;

  @Column({ name: 'Category', type: 'nvarchar', length: 300, nullable: true })
  category!: string | null;

  @Column({ name: 'CostPerLoad', type: 'decimal', precision: 18, scale: 4, default: 0 })
  costPerLoad!: string;

  @Column({ name: 'CostPerTon', type: 'decimal', precision: 18, scale: 4, default: 0 })
  costPerTon!: string;

  @Column({ name: 'CostPerCy', type: 'decimal', precision: 18, scale: 4, default: 0 })
  costPerCy!: string;

  /** Catalog truck size. CY charge is this times cost per CY, not a measured volume. */
  @Column({ name: 'TruckSizeCy', type: 'decimal', precision: 18, scale: 4, default: 0 })
  truckSizeCy!: string;

  @Column({ name: 'TonsIncluded', type: 'decimal', precision: 18, scale: 4, default: 0 })
  tonsIncluded!: string;

  @Column({ name: 'Address', type: 'nvarchar', length: 400, nullable: true })
  address!: string | null;

  @Column({ name: 'Phone', type: 'nvarchar', length: 80, nullable: true })
  phone!: string | null;

  @Column({ name: 'Contact', type: 'nvarchar', length: 200, nullable: true })
  contact!: string | null;

  @Column({ name: 'Email', type: 'nvarchar', length: 200, nullable: true })
  email!: string | null;

  @Column({ name: 'IsActive', type: 'bit', default: true })
  isActive!: boolean;

  @Column({ name: 'SourceRow', type: 'int', nullable: true })
  sourceRow!: number | null;
}

/** One haul. Costs are not columns — they are calculated from the two rate cards. */
@Entity({ name: 'Ops_HaulTickets' })
export class OpsHaulTicket {
  @PrimaryGeneratedColumn({ name: 'HaulTicketId' })
  id!: number;

  @Index()
  @Column({ name: 'TicketDate', type: 'date' })
  ticketDate!: string;

  @Column({ name: 'JobId', type: 'int', nullable: true })
  jobId!: number | null;

  @ManyToOne(() => Job, { nullable: true })
  @JoinColumn({ name: 'JobId' })
  job!: Job | null;

  @Column({ name: 'JobNumber', type: 'nvarchar', length: 50, nullable: true })
  jobNumber!: string | null;

  /** Name on the log. Ref_Jobs is used when this is empty. */
  @Column({ name: 'JobName', type: 'nvarchar', length: 300, nullable: true })
  jobName!: string | null;

  @Column({ name: 'HaulerRateId', type: 'int', nullable: true })
  haulerRateId!: number | null;

  @ManyToOne(() => OpsHaulerRate, { nullable: true })
  @JoinColumn({ name: 'HaulerRateId' })
  haulerRate!: OpsHaulerRate | null;

  @Column({ name: 'Hours', type: 'decimal', precision: 18, scale: 4, nullable: true })
  hours!: string | null;

  @Column({ name: 'DisposalRateId', type: 'int', nullable: true })
  disposalRateId!: number | null;

  @ManyToOne(() => OpsDisposalRate, { nullable: true })
  @JoinColumn({ name: 'DisposalRateId' })
  disposalRate!: OpsDisposalRate | null;

  @Column({ name: 'GoelTicketNumber', type: 'nvarchar', length: 50, nullable: true })
  goelTicketNumber!: string | null;

  @Column({ name: 'HaulingTicketNumber', type: 'nvarchar', length: 50, nullable: true })
  haulingTicketNumber!: string | null;

  @Column({ name: 'DisposalTicketNumber', type: 'nvarchar', length: 50, nullable: true })
  disposalTicketNumber!: string | null;

  @Column({ name: 'WasteManifestNumber', type: 'nvarchar', length: 50, nullable: true })
  wasteManifestNumber!: string | null;

  @Column({ name: 'TransferJobNumber', type: 'nvarchar', length: 50, nullable: true })
  transferJobNumber!: string | null;

  @Column({ name: 'WeightTons', type: 'decimal', precision: 18, scale: 4, nullable: true })
  weightTons!: string | null;

  @Column({ name: 'LightTubes', type: 'decimal', precision: 18, scale: 4, nullable: true })
  lightTubes!: string | null;

  @Column({ name: 'MetalsDirect', type: 'decimal', precision: 18, scale: 4, nullable: true })
  metalsDirect!: string | null;

  @Column({ name: 'MetalsReclaimed', type: 'decimal', precision: 18, scale: 4, nullable: true })
  metalsReclaimed!: string | null;

  @Column({ name: 'Insulation', type: 'decimal', precision: 18, scale: 4, nullable: true })
  insulation!: string | null;

  @Column({ name: 'Wood', type: 'decimal', precision: 18, scale: 4, nullable: true })
  wood!: string | null;

  @Column({ name: 'Paper', type: 'decimal', precision: 18, scale: 4, nullable: true })
  paper!: string | null;

  @Column({ name: 'Aggregates', type: 'decimal', precision: 18, scale: 4, nullable: true })
  aggregates!: string | null;

  @Column({ name: 'Plastics', type: 'decimal', precision: 18, scale: 4, nullable: true })
  plastics!: string | null;

  @Column({ name: 'Drywall', type: 'decimal', precision: 18, scale: 4, nullable: true })
  drywall!: string | null;

  @Column({ name: 'BoardFeetWood', type: 'decimal', precision: 18, scale: 4, nullable: true })
  boardFeetWood!: string | null;

  @Column({ name: 'Dirt', type: 'decimal', precision: 18, scale: 4, nullable: true })
  dirt!: string | null;

  @Column({ name: 'Lumber', type: 'decimal', precision: 18, scale: 4, nullable: true })
  lumber!: string | null;

  @Column({ name: 'BrickDeconstructed', type: 'decimal', precision: 18, scale: 4, nullable: true })
  brickDeconstructed!: string | null;

  @Column({ name: 'BrickPallets', type: 'decimal', precision: 18, scale: 4, nullable: true })
  brickPallets!: string | null;

  @Column({ name: 'Roofing', type: 'decimal', precision: 18, scale: 4, nullable: true })
  roofing!: string | null;

  @Column({ name: 'Landfill', type: 'decimal', precision: 18, scale: 4, nullable: true })
  landfill!: string | null;

  @Column({ name: 'Rc57', type: 'decimal', precision: 18, scale: 4, nullable: true })
  rc57!: string | null;

  @Column({ name: 'Rc6', type: 'decimal', precision: 18, scale: 4, nullable: true })
  rc6!: string | null;

  @Column({ name: 'Rc2', type: 'decimal', precision: 18, scale: 4, nullable: true })
  rc2!: string | null;

  @Column({ name: 'Cr57', type: 'decimal', precision: 18, scale: 4, nullable: true })
  cr57!: string | null;

  @Column({ name: 'DirtTons', type: 'decimal', precision: 18, scale: 4, nullable: true })
  dirtTons!: string | null;

  @Column({ name: 'SourceRow', type: 'int', nullable: true })
  sourceRow!: number | null;

  @Column({ name: 'CreatedAt', type: 'datetime2', default: () => 'SYSUTCDATETIME()' })
  createdAt!: Date;

  @Column({ name: 'UpdatedAt', type: 'datetime2', default: () => 'SYSUTCDATETIME()' })
  updatedAt!: Date;
}
