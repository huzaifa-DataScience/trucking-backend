import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateActiveEmailTemplateDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  subjectTemplate?: string;

  @IsOptional()
  @IsString()
  bodyHtmlTemplate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;
}

