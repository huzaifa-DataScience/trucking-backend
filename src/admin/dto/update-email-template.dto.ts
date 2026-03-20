import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateEmailTemplateDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  purpose?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  subjectTemplate?: string;

  @IsOptional()
  @IsString()
  bodyHtmlTemplate?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

