import { IsBoolean } from 'class-validator';

export class UpdateOverdueEmailSendingDto {
  @IsBoolean()
  enabled!: boolean;
}
