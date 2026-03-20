import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateEmailTemplateDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  templateKey!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  purpose!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  subjectTemplate!: string;

  @IsString()
  @IsNotEmpty()
  bodyHtmlTemplate!: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

