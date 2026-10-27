import { Type } from 'class-transformer';
import {
  IsDefined,
  IsEmail,
  IsInt,
  IsOptional,
  IsNumber,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

/** Browser location at sign-in plus the floor the person picked. */
export class SignInLocationDto {
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude: number;

  /** Accuracy radius in metres, as the browser reports it. */
  @IsNumber()
  @Min(0)
  accuracy: number;

  /** The office the person confirmed; null or missing = not at an office. */
  @IsOptional()
  @IsInt()
  officeId?: number | null;

  @IsString()
  @MinLength(1, { message: 'Pick the floor you are on' })
  @MaxLength(40)
  floor: string;
}

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6, { message: 'Password must be at least 6 characters' })
  password: string;

  @IsDefined({ message: 'Your location is required to sign in' })
  @ValidateNested()
  @Type(() => SignInLocationDto)
  location: SignInLocationDto;
}
