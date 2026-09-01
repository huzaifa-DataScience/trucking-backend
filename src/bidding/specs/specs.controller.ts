import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  IsArray,
  IsBoolean,
  IsInt,
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

class UploadMikeFileDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MikeRowDto)
  rows!: MikeRowDto[];

  /** User-chosen takeoff display name (required on FE; defaults to mike.csv if omitted) */
  @IsOptional() @IsString() @MaxLength(260) fileName?: string | null;

  /** Job # from Mike header and/or user — auto-link when jobId not sent */
  @IsOptional() @IsString() @MaxLength(40) jobNumberHint?: string | null;

  /** Mike metadata row col C (project title) */
  @IsOptional() @IsString() @MaxLength(300) projectLabel?: string | null;

  /** Explicit Job picker (`Ref_Jobs.id`) — preferred over jobNumberHint */
  @IsOptional() @IsInt() jobId?: number | null;

  /** Default true — become the active file for Specs / Recv rollup */
  @IsOptional() @IsBoolean() activate?: boolean;
}

/** Rename takeoff / set job without re-uploading rows. */
class PatchMikeFileDto {
  @IsOptional() @IsString() @MaxLength(260) fileName?: string | null;
  @IsOptional() @IsString() @MaxLength(40) jobNumberHint?: string | null;
  @IsOptional() @IsString() @MaxLength(300) projectLabel?: string | null;
  @IsOptional() @IsInt() jobId?: number | null;
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

  /**
   * Production list — **one row per bid** (all Mike files already combined for that bid).
   * Use THIS for `/production`. Do NOT build Production from `/estimation-files`.
   */
  @Get('production-reports')
  listProductionReports(@Query('q') q?: string, @Query('limit') limitRaw?: string) {
    const limit =
      limitRaw != null && String(limitRaw).trim() !== '' ? Number(limitRaw) : undefined;
    return this.specs.listProductionReports({
      q,
      limit: limit != null && Number.isFinite(limit) ? limit : undefined,
    });
  }

  /**
   * Global library — each CSV as its own row (upload / delete / view raw rows ONLY).
   * NOT the Production list. NOT Specs calc input.
   */
  @Get('estimation-files')
  listAllEstimationFiles(
    @Query('bidId') bidIdRaw?: string,
    @Query('q') q?: string,
    @Query('limit') limitRaw?: string,
  ) {
    const bidId =
      bidIdRaw != null && String(bidIdRaw).trim() !== '' ? Number(bidIdRaw) : undefined;
    const limit =
      limitRaw != null && String(limitRaw).trim() !== '' ? Number(limitRaw) : undefined;
    return this.specs.listAllEstimationFiles({
      bidId: bidId != null && Number.isFinite(bidId) ? bidId : undefined,
      q,
      limit: limit != null && Number.isFinite(limit) ? limit : undefined,
    });
  }

  /** Open one estimation file (meta + bid + rows). */
  @Get('estimation-files/:fileId')
  getEstimationFile(@Param('fileId', ParseIntPipe) fileId: number) {
    return this.specs.getEstimationFile(fileId);
  }

  @Delete('estimation-files/:fileId')
  deleteEstimationFile(@Param('fileId', ParseIntPipe) fileId: number) {
    return this.specs.deleteEstimationFileById(fileId);
  }

  @Patch('estimation-files/:fileId')
  patchEstimationFile(
    @Param('fileId', ParseIntPipe) fileId: number,
    @Body() dto: PatchMikeFileDto,
  ) {
    return this.specs.patchEstimationFileById(fileId, {
      fileName: dto.fileName,
      jobNumberHint: dto.jobNumberHint,
      projectLabel: dto.projectLabel,
      jobId: dto.jobId,
    });
  }

  @Post('estimation-files/:fileId/activate')
  activateEstimationFile(@Param('fileId', ParseIntPipe) fileId: number) {
    return this.specs.activateEstimationFileById(fileId);
  }

  /** Always ≤1 takeoff file per bid (extra CSVs are consolidated / appended). */
  @Get('bids/:id/mike-files')
  listMikeFiles(@Param('id', ParseIntPipe) id: number) {
    return this.specs.listMikeFiles(id);
  }

  /** Append CSV rows into the bid’s single Mike takeoff (not a second file). */
  @Post('bids/:id/mike-files')
  addMikeFile(@Param('id', ParseIntPipe) id: number, @Body() dto: UploadMikeFileDto) {
    return this.specs.addMikeFile(id, dto.rows ?? [], {
      fileName: dto.fileName,
      jobNumberHint: dto.jobNumberHint,
      projectLabel: dto.projectLabel,
      jobId: dto.jobId,
      activate: dto.activate,
    });
  }

  /** Rename takeoff / update job selection (no row re-upload). */
  @Patch('bids/:id/mike-files/:fileId')
  patchMikeFile(
    @Param('id', ParseIntPipe) id: number,
    @Param('fileId', ParseIntPipe) fileId: number,
    @Body() dto: PatchMikeFileDto,
  ) {
    return this.specs.patchMikeFile(id, fileId, {
      fileName: dto.fileName,
      jobNumberHint: dto.jobNumberHint,
      projectLabel: dto.projectLabel,
      jobId: dto.jobId,
    });
  }

  @Delete('bids/:id/mike-files/:fileId')
  deleteMikeFile(
    @Param('id', ParseIntPipe) id: number,
    @Param('fileId', ParseIntPipe) fileId: number,
  ) {
    return this.specs.deleteMikeFile(id, fileId);
  }

  @Post('bids/:id/mike-files/:fileId/activate')
  activateMikeFile(
    @Param('id', ParseIntPipe) id: number,
    @Param('fileId', ParseIntPipe) fileId: number,
  ) {
    return this.specs.activateMikeFile(id, fileId);
  }

  /** All rows in the bid’s single Mike takeoff. */
  @Get('bids/:id/mike-rows')
  listMike(
    @Param('id', ParseIntPipe) id: number,
    @Query('fileId') fileIdRaw?: string,
  ) {
    const fileId =
      fileIdRaw != null && String(fileIdRaw).trim() !== ''
        ? Number(fileIdRaw)
        : undefined;
    return this.specs.listMikeRows(
      id,
      fileId != null && Number.isFinite(fileId) ? fileId : undefined,
    );
  }

  /** @deprecated Prefer POST /bids/:id/mike-files — appends into the one takeoff. */
  @Post('bids/:id/mike-rows')
  replaceMike(@Param('id', ParseIntPipe) id: number, @Body() dto: UploadMikeFileDto) {
    return this.specs.replaceMikeRows(id, dto.rows ?? [], {
      fileName: dto.fileName,
      jobNumberHint: dto.jobNumberHint,
      projectLabel: dto.projectLabel,
      jobId: dto.jobId,
      activate: dto.activate,
    });
  }

  @Get('bids/:id/spec-lines')
  listSpecLines(@Param('id', ParseIntPipe) id: number) {
    return this.specs.listSpecLines(id);
  }

  /**
   * Commodity BOM production report: earned hours (Mike/Trimble) vs Connecteam actual → green/red.
   */
  @Get('bids/:id/production-report')
  productionReport(@Param('id', ParseIntPipe) id: number) {
    return this.specs.getProductionReport(id);
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
