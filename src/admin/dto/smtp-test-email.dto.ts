import { IsEmail, MaxLength } from 'class-validator';

export class SmtpTestEmailDto {
  /** Address to receive the test message. */
  @IsEmail()
  @MaxLength(320)
  to!: string;
}
