import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/** Custom event body. All-day: `start`/`end` are `YYYY-MM-DD` (end inclusive). Timed: ISO instants. */
export class CalendarEventDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  location?: string | null;

  @IsOptional()
  @IsBoolean()
  allDay?: boolean;

  @IsString()
  @IsNotEmpty()
  start!: string;

  @IsOptional()
  @IsString()
  end?: string | null;

  @IsOptional()
  @IsInt()
  bidId?: number | null;
}
