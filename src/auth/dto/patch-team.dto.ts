import { IsInt, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

export class TeamSlotPickDto {
  @IsOptional() @Type(() => Number) @IsInt()
  connecteamUserId?: number | null;

  @IsOptional() @Type(() => Number) @IsInt()
  appUserId?: number | null;

  @IsOptional() @IsString() @MaxLength(200)
  name?: string | null;
}

/** Captain Settings — pick people into slots. Not a pre-made Bid_Teams id. */
export class PatchTeamDto {
  @IsObject()
  slots!: Record<string, TeamSlotPickDto | null>;
}
