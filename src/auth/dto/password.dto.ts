import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

/** New passwords: 8+ chars with upper, lower, number and symbol. Keep in sync with the frontend password-policy.ts. */
export const STRONG_PASSWORD = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
export const STRONG_PASSWORD_MESSAGE =
  'Password must be at least 8 characters and include uppercase, lowercase, a number and a symbol';

export class ForgotPasswordDto {
  @IsEmail({}, { message: 'Enter a valid email address' })
  email: string;
}

export class ResetPasswordDto {
  @IsString()
  @MinLength(20, { message: 'This reset link is invalid or has expired. Request a new one.' })
  @MaxLength(200)
  token: string;

  @IsString()
  @Matches(STRONG_PASSWORD, { message: STRONG_PASSWORD_MESSAGE })
  password: string;

  @IsOptional()
  @IsString()
  confirmPassword?: string;
}

export class ChangePasswordDto {
  @IsString()
  currentPassword: string;

  @IsString()
  @Matches(STRONG_PASSWORD, { message: STRONG_PASSWORD_MESSAGE })
  newPassword: string;
}
