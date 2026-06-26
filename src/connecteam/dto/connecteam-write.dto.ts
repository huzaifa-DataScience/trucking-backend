import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class ClockInDto {
  @IsInt() userId!: number;
  @IsOptional() @IsString() jobId?: string;
  @IsOptional() @IsString() @MaxLength(80) timezone?: string;
  @IsOptional() @IsInt() timestamp?: number;
  @IsOptional() @IsString() schedulerShiftId?: string;
  @IsOptional() @IsObject() locationData?: Record<string, unknown>;
}

export class ClockOutDto {
  @IsInt() userId!: number;
  @IsOptional() @IsString() @MaxLength(80) timezone?: string;
  @IsOptional() @IsInt() timestamp?: number;
  @IsOptional() @IsObject() locationData?: Record<string, unknown>;
}

export class CreateTimeActivityDto {
  @IsInt() userId!: number;
  @IsInt() startTimestamp!: number;
  @IsOptional() @IsInt() endTimestamp?: number;
  @IsOptional() @IsString() @MaxLength(80) startTimezone?: string;
  @IsOptional() @IsString() @MaxLength(80) endTimezone?: string;
  @IsOptional() @IsString() jobId?: string;
  @IsOptional() @IsString() @MaxLength(1000) employeeNote?: string;
  @IsOptional() @IsString() @MaxLength(1000) managerNote?: string;
}

export class PatchTimeActivityDto {
  @IsOptional() @IsInt() startTimestamp?: number;
  @IsOptional() @IsInt() endTimestamp?: number;
  @IsOptional() @IsString() @MaxLength(80) startTimezone?: string;
  @IsOptional() @IsString() @MaxLength(80) endTimezone?: string;
  @IsOptional() @IsString() jobId?: string | null;
  @IsOptional() @IsString() @MaxLength(1000) employeeNote?: string | null;
  @IsOptional() @IsString() @MaxLength(1000) managerNote?: string | null;
}

export class CreateScheduledShiftDto {
  @IsInt() startTime!: number;
  @IsInt() endTime!: number;
  @IsOptional() @IsString() @MaxLength(500) title?: string;
  @IsOptional() @IsString() jobId?: string;
  @IsOptional() @IsString() @MaxLength(80) timezone?: string;
  @IsOptional() @IsBoolean() isPublished?: boolean;
  @IsOptional() @IsBoolean() isOpenShift?: boolean;
  @IsOptional() @IsArray() @IsInt({ each: true }) assignedUserIds?: number[];
  @IsOptional() @IsString() @MaxLength(500) locationAddress?: string;
}

export class PatchScheduledShiftDto {
  @IsOptional() @IsInt() startTime?: number;
  @IsOptional() @IsInt() endTime?: number;
  @IsOptional() @IsString() @MaxLength(500) title?: string | null;
  @IsOptional() @IsString() jobId?: string | null;
  @IsOptional() @IsString() @MaxLength(80) timezone?: string | null;
  @IsOptional() @IsBoolean() isPublished?: boolean;
  @IsOptional() @IsBoolean() isOpenShift?: boolean;
  @IsOptional() @IsArray() @IsInt({ each: true }) assignedUserIds?: number[];
  @IsOptional() @IsString() @MaxLength(500) locationAddress?: string | null;
}

export class CreateTimeOffDto {
  @IsInt() userId!: number;
  @IsString() startDate!: string;
  @IsString() endDate!: string;
  @IsOptional() @IsString() policyTypeId?: string;
  @IsOptional() @IsBoolean() isAllDay?: boolean;
  @IsOptional() @IsString() startTime?: string;
  @IsOptional() @IsString() endTime?: string;
  @IsOptional() @IsString() @MaxLength(80) timezone?: string;
  @IsOptional() @IsString() @MaxLength(1000) employeeNote?: string;
  @IsOptional() @IsInt() timeClockId?: number;
}

export class PatchTimeOffStatusDto {
  @IsIn(['pending', 'approved', 'denied']) status!: 'pending' | 'approved' | 'denied';
  @IsOptional() @IsString() @MaxLength(1000) managerNote?: string;
}

export class SubmitFormDto {
  @IsInt() userId!: number;
  @IsOptional() @IsObject() answers?: Record<string, unknown>;
  @IsOptional() @IsString() status?: string;
}

export class CreateTaskDto {
  @IsString() @MaxLength(500) title!: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsInt() startTime?: number;
  @IsOptional() @IsInt() dueDate?: number;
  @IsOptional() @IsArray() @IsInt({ each: true }) userIds?: number[];
  @IsOptional() @IsString() @MaxLength(1000) descriptionSummary?: string;
}

export class PatchTaskDto {
  @IsOptional() @IsString() @MaxLength(500) title?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsInt() startTime?: number | null;
  @IsOptional() @IsInt() dueDate?: number | null;
  @IsOptional() @IsArray() @IsInt({ each: true }) userIds?: number[];
  @IsOptional() @IsString() @MaxLength(1000) descriptionSummary?: string | null;
  @IsOptional() @IsBoolean() isArchived?: boolean;
}

export class CreateConversationDto {
  @IsString() @MaxLength(500) title!: string;
  @IsOptional() @IsString() @MaxLength(40) type?: string;
}

export class SendMessageDto {
  @IsString() @MaxLength(10000) body!: string;
  @IsOptional() @IsInt() userId?: number;
}

export class LinkConnecteamUserDto {
  @IsInt() @Min(1) appUserId!: number;
}
