import { IsEmail, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { STRONG_PASSWORD, STRONG_PASSWORD_MESSAGE } from './password.dto';

export class RegisterDto {
  @IsOptional() @IsString() @MaxLength(200)
  firstName?: string;

  @IsOptional() @IsString() @MaxLength(200)
  lastName?: string;

  @IsEmail()
  email: string;

  @IsString()
  @Matches(STRONG_PASSWORD, { message: STRONG_PASSWORD_MESSAGE })
  password: string;

  @IsOptional()
  @IsString()
  confirmPassword?: string;
}
