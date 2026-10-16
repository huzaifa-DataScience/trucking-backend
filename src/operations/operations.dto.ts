import { IsBoolean, IsInt, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class HaulerRateDto {
  @IsOptional()
  @IsInt()
  companyId?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  companyName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  category?: string | null;

  @IsOptional()
  ratePerLoad?: number | null;

  @IsOptional()
  ratePerHour?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  unit?: string | null;

  @IsOptional()
  showUpHours?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  address?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  phone?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  contact?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  email?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  coi?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class DisposalRateDto {
  @IsOptional()
  @IsInt()
  siteId?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  companyName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  unitLabel?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  category?: string | null;

  @IsOptional()
  costPerLoad?: number | null;

  @IsOptional()
  costPerTon?: number | null;

  @IsOptional()
  costPerCy?: number | null;

  @IsOptional()
  truckSizeCy?: number | null;

  @IsOptional()
  tonsIncluded?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  address?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  phone?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  contact?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  email?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class HaulTicketDto {
  @IsString()
  ticketDate?: string;

  @IsOptional()
  @IsInt()
  jobId?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  jobNumber?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  jobName?: string | null;

  @IsOptional()
  @IsInt()
  haulerRateId?: number | null;

  @IsOptional()
  hours?: number | null;

  @IsOptional()
  @IsInt()
  disposalRateId?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  goelTicketNumber?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  haulingTicketNumber?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  disposalTicketNumber?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  wasteManifestNumber?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  transferJobNumber?: string | null;

  @IsOptional()
  weightTons?: number | null;

  /** Vendor LEED quantities. Recorded, not priced. */
  @IsOptional()
  @IsObject()
  leed?: Record<string, unknown> | null;

  /** Aggregates imported. Recorded, not priced. */
  @IsOptional()
  @IsObject()
  aggregates?: Record<string, unknown> | null;
}
