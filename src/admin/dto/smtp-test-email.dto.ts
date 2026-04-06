import { IsEmail, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class SmtpTestEmailDto {
  /** Address to receive the test message. */
  @IsEmail()
  @MaxLength(320)
  to!: string;

  /**
   * Optional: if provided, the server will render the active email template
   * for this Purpose and send that rendered email as the test.
   * Example purpose: "siteline.overdue_leadpm"
   */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  purpose?: string;

  /** Optional: used only for template placeholder rendering (if purpose is provided). */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  leadPmName?: string;

  /** OTP code for auth.otp template tests (defaults to random 6-digit). */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  otpCode?: string;

  /** OTP expiry minutes for auth.otp template tests (defaults to 10). */
  @IsOptional()
  @IsInt()
  @Min(1)
  expiresMinutes?: number;

  /** App name shown in auth.otp template tests (defaults to "Trucking Dashboard"). */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  appName?: string;
}
