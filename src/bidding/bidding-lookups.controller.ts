import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  IsBoolean,
  IsIn,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { JwtAuthGuard } from '../auth/guards';
import { BiddingLookupsService } from './bidding-lookups.service';

class CreateTeamDto {
  @IsString() @MinLength(1) @MaxLength(100) teamName!: string;
}

class CreateWageRateDto {
  @IsString() @MinLength(1) @MaxLength(100) rateLabel!: string;
  @IsNumber() @Min(0) wage!: number;
  @IsNumber() @Min(0) fringe!: number;
  @IsOptional() @IsString() @MaxLength(200) displayLabel?: string;
  @IsOptional() @IsISO8601() wageAsOf?: string;
}

class UpdateWageRateDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) rateLabel?: string;
  @IsOptional() @IsNumber() @Min(0) wage?: number;
  @IsOptional() @IsNumber() @Min(0) fringe?: number;
  @IsOptional() @IsString() @MaxLength(200) displayLabel?: string;
  @IsOptional() @IsISO8601() wageAsOf?: string;
}

const BURDEN_TYPES = ['pct_wage', 'capped_annual', 'per_hour'] as const;

class CreatePayrollBurdenDto {
  @IsString() @MinLength(1) @MaxLength(40) code!: string;
  @IsString() @MinLength(1) @MaxLength(200) label!: string;
  @IsIn(BURDEN_TYPES) rateType!: (typeof BURDEN_TYPES)[number];
  @IsNumber() @Min(0) rate!: number;
  @IsOptional() @IsNumber() @Min(0) annualCap?: number;
  @IsOptional() @IsNumber() @Min(0) hoursBasis?: number;
  @IsOptional() @IsBoolean() includeInBaseRate?: boolean;
}

class UpdatePayrollBurdenDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(40) code?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) label?: string;
  @IsOptional() @IsIn(BURDEN_TYPES) rateType?: (typeof BURDEN_TYPES)[number];
  @IsOptional() @IsNumber() @Min(0) rate?: number;
  @IsOptional() @IsNumber() @Min(0) annualCap?: number;
  @IsOptional() @IsNumber() @Min(0) hoursBasis?: number;
  @IsOptional() @IsBoolean() includeInBaseRate?: boolean;
}

/** Bidding dropdown data. Company list reuses `GET /lookups/our-entities`. */
@Controller('lookups/bidding')
@UseGuards(JwtAuthGuard)
export class BiddingLookupsController {
  constructor(private readonly lookups: BiddingLookupsService) {}

  @Get('teams')
  getTeams() {
    return this.lookups.getTeams();
  }

  @Post('teams')
  createTeam(@Body() dto: CreateTeamDto) {
    return this.lookups.createTeam(dto.teamName);
  }

  @Delete('teams/:id')
  deleteTeam(@Param('id', ParseIntPipe) id: number) {
    return this.lookups.deleteTeam(id);
  }

  @Get('wage-rates')
  getWageRates() {
    return this.lookups.getWageRates();
  }

  @Post('wage-rates')
  createWageRate(@Body() dto: CreateWageRateDto) {
    return this.lookups.createWageRate(dto);
  }

  @Patch('wage-rates/:id')
  updateWageRate(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateWageRateDto) {
    return this.lookups.updateWageRate(id, dto);
  }

  @Delete('wage-rates/:id')
  deleteWageRate(@Param('id', ParseIntPipe) id: number) {
    return this.lookups.deleteWageRate(id);
  }

  /** Auto-derived burdened labor rate for a wage (replaces hand-typed composite). */
  @Get('wage-rates/:id/burdened-rate')
  burdenedRate(@Param('id', ParseIntPipe) id: number) {
    return this.lookups.computeBurdenedRateForWage(id);
  }

  @Get('payroll-burden')
  getPayrollBurden() {
    return this.lookups.getPayrollBurden();
  }

  @Post('payroll-burden')
  createPayrollBurden(@Body() dto: CreatePayrollBurdenDto) {
    return this.lookups.createPayrollBurden(dto);
  }

  @Patch('payroll-burden/:id')
  updatePayrollBurden(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePayrollBurdenDto) {
    return this.lookups.updatePayrollBurden(id, dto);
  }

  @Delete('payroll-burden/:id')
  deletePayrollBurden(@Param('id', ParseIntPipe) id: number) {
    return this.lookups.deletePayrollBurden(id);
  }

  @Get('states')
  getStates() {
    return this.lookups.getStates();
  }

  @Get('project-types')
  getProjectTypes() {
    return this.lookups.getProjectTypes();
  }

  @Get('building-types')
  getBuildingTypes() {
    return this.lookups.getBuildingTypes();
  }

  @Get('preferences')
  getPreferences() {
    return this.lookups.getPreferences();
  }
}
