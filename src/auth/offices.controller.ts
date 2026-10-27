import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsNumber, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { Role } from '../database/entities';
import { Public, Roles } from './decorators';
import { JwtAuthGuard, RolesGuard } from './guards';
import { OfficeService } from './office.service';

class NearbyOfficesDto {
  @IsNumber() @Min(-90) @Max(90) latitude: number;
  @IsNumber() @Min(-180) @Max(180) longitude: number;
  @IsNumber() @Min(0) accuracy: number;
}

class CreateOfficeDto {
  @IsString() @MinLength(1, { message: 'Give the office a name' }) @MaxLength(200) name: string;
  @IsNumber() @Min(-90) @Max(90) latitude: number;
  @IsNumber() @Min(-180) @Max(180) longitude: number;
}

@Controller()
export class OfficesController {
  constructor(private readonly offices: OfficeService) {}

  /** Sign-in page (before login): offices nearest the browser's location, and which one to pre-select. */
  @Public()
  @Post('auth/offices/nearby')
  @HttpCode(HttpStatus.OK)
  nearby(@Body() dto: NearbyOfficesDto) {
    return this.offices.nearby(dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  @Get('admin/offices')
  list() {
    return this.offices.list();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  @Post('admin/offices')
  create(@Body() dto: CreateOfficeDto) {
    return this.offices.create(dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  @Delete('admin/offices/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.offices.remove(id);
  }
}
