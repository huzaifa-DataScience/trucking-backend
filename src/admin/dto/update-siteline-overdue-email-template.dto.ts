import { IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateSitelineOverdueEmailTemplateDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  subjectTemplate!: string;

  @IsString()
  @MinLength(1)
  bodyHtmlTemplate!: string;
}
