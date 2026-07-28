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
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../../auth/guards';
import { MikeRowInput, SpecLineWriteDto, SpecsService } from './specs.service';

class MikeRowDto implements MikeRowInput {
  @IsOptional() @IsNumber() excelRowNumber?: number;
  @IsOptional() @IsString() @MaxLength(300) systemAndType?: string;
  @IsOptional() @IsNumber() thickness?: number | null;
  @IsOptional() @IsNumber() size?: number | null;
  @IsOptional() @IsNumber() quantity?: number;
  @IsOptional() @IsNumber() materialCost?: number | null;
  @IsOptional() @IsNumber() hours?: number | null;
  @IsOptional() @IsString() @MaxLength(200) materialPhrase?: string | null;
  @IsOptional() @IsString() @MaxLength(100) materialBase?: string | null;
}

class ReplaceMikeRowsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MikeRowDto)
  rows!: MikeRowDto[];

  /** Mike metadata row col B (e.g. "21190") — auto Job link */
  @IsOptional() @IsString() @MaxLength(40) jobNumberHint?: string | null;

  /** Mike metadata row col C (project title) */
  @IsOptional() @IsString() @MaxLength(300) projectLabel?: string | null;
}

class CreateSpecLineDto implements SpecLineWriteDto {
  @IsOptional() @IsString() @MaxLength(40) type?: string | null;
  @IsString() @MinLength(1) @MaxLength(200) systemName!: string;
  @IsOptional() @IsString() @MaxLength(100) areaName?: string | null;
  @IsString() @MinLength(1) @MaxLength(200) insulation!: string;
  @IsNumber() size!: number;
  @IsNumber() thickness!: number;
  @IsOptional() @IsString() @MaxLength(40) weight?: string | null;
  @IsOptional() @IsString() @MaxLength(40) facing?: string | null;
  @IsOptional() @IsString() @MaxLength(40) addJacket?: string | null;
  @IsOptional() @IsString() @MaxLength(40) layers?: string | null;
  @IsOptional() @IsString() @MaxLength(500) extraNotes?: string | null;
  @IsOptional() @IsNumber() sortOrder?: number;
}

class PatchSpecLineDto {
  @IsOptional() @IsString() @MaxLength(40) type?: string | null;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) systemName?: string;
  @IsOptional() @IsString() @MaxLength(100) areaName?: string | null;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) insulation?: string;
  @IsOptional() @IsNumber() size?: number;
  @IsOptional() @IsNumber() thickness?: number;
  @IsOptional() @IsString() @MaxLength(40) weight?: string | null;
  @IsOptional() @IsString() @MaxLength(40) facing?: string | null;
  @IsOptional() @IsString() @MaxLength(40) addJacket?: string | null;
  @IsOptional() @IsString() @MaxLength(40) layers?: string | null;
  @IsOptional() @IsString() @MaxLength(500) extraNotes?: string | null;
  @IsOptional() @IsNumber() sortOrder?: number;
}

class AutoFromMikeDto {
  @IsOptional() @IsBoolean() replace?: boolean;
}

@Controller()
@UseGuards(JwtAuthGuard)
export class SpecsController {
  constructor(private readonly specs: SpecsService) {}

  @Get('bids/:id/mike-rows')
  listMike(@Param('id', ParseIntPipe) id: number) {
    return this.specs.listMikeRows(id);
  }

  @Post('bids/:id/mike-rows')
  replaceMike(@Param('id', ParseIntPipe) id: number, @Body() dto: ReplaceMikeRowsDto) {
    return this.specs.replaceMikeRows(id, dto.rows ?? [], {
      jobNumberHint: dto.jobNumberHint,
      projectLabel: dto.projectLabel,
    });
  }

  @Get('bids/:id/spec-lines')
  listSpecLines(@Param('id', ParseIntPipe) id: number) {
    return this.specs.listSpecLines(id);
  }

  @Post('bids/:id/spec-lines')
  createSpecLine(@Param('id', ParseIntPipe) id: number, @Body() dto: CreateSpecLineDto) {
    return this.specs.createSpecLine(id, dto);
  }

  @Post('bids/:id/spec-lines/auto-from-mike')
  autoFromMike(@Param('id', ParseIntPipe) id: number, @Body() dto: AutoFromMikeDto) {
    return this.specs.autoGenerateFromMike(id, dto.replace !== false);
  }

  @Patch('bids/:id/spec-lines/:lineId')
  patchSpecLine(
    @Param('id', ParseIntPipe) id: number,
    @Param('lineId', ParseIntPipe) lineId: number,
    @Body() dto: PatchSpecLineDto,
  ) {
    return this.specs.patchSpecLine(id, lineId, dto);
  }

  @Delete('bids/:id/spec-lines/:lineId')
  deleteSpecLine(
    @Param('id', ParseIntPipe) id: number,
    @Param('lineId', ParseIntPipe) lineId: number,
  ) {
    return this.specs.deleteSpecLine(id, lineId);
  }
}
