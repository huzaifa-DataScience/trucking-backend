import { IsArray, IsOptional, IsString, MaxLength } from 'class-validator';

/** Self-service name edit — GET /auth/profile's own PATCH. */
export class UpdateProfileDto {
  @IsOptional() @IsString() @MaxLength(200)
  firstName?: string | null;

  @IsOptional() @IsString() @MaxLength(200)
  lastName?: string | null;

  /** Visible Estimates filters. Allowed keys: process-meta `estimatesListEditor.filterCatalog`. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  estimatesFilterKeys?: string[];
}
