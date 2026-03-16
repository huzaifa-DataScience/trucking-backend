export type DirectionFilter = 'Import' | 'Export' | 'Both';

export class DateRangeFilterDto {
  startDate?: string; // ISO date YYYY-MM-DD
  endDate?: string;
}

export class JobDashboardFiltersDto extends DateRangeFilterDto {
  jobId?: number; // undefined = All
  /** Filter by company (OurEntity id from Ref_OurEntities) */
  entityId?: number;
  direction?: DirectionFilter;
}

export class MaterialDashboardFiltersDto extends DateRangeFilterDto {
  materialId?: number;
  jobId?: number;
  /** Filter by company (OurEntity id from Ref_OurEntities) */
  entityId?: number;
  direction?: DirectionFilter;
}

export class HaulerDashboardFiltersDto extends DateRangeFilterDto {
  haulerId?: number;
  jobId?: number;
  materialId?: number;
  truckTypeId?: number;
  /** Filter by company (OurEntity id from Ref_OurEntities) */
  entityId?: number;
  direction?: DirectionFilter;
}
