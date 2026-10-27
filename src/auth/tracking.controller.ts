import { BadRequestException, Body, Controller, Get, HttpCode, HttpStatus, Post, Query, UseGuards } from '@nestjs/common';
import { IsNumber, Max, Min } from 'class-validator';
import { Role, User } from '../database/entities';
import { CurrentUser, Roles } from './decorators';
import { JwtAuthGuard, RolesGuard } from './guards';
import { TrackingService } from './tracking.service';

class PingDto {
  @IsNumber() @Min(-90) @Max(90) latitude: number;
  @IsNumber() @Min(-180) @Max(180) longitude: number;
  @IsNumber() @Min(0) accuracy: number;
}

@Controller()
export class TrackingController {
  constructor(private readonly tracking: TrackingService) {}

  /** Sent by the app every ~2 minutes while it is open. */
  @UseGuards(JwtAuthGuard)
  @Post('auth/location-ping')
  @HttpCode(HttpStatus.OK)
  ping(@CurrentUser() user: User, @Body() dto: PingDto) {
    return this.tracking.ping(user.id, dto);
  }

  /** Admins: everyone's tracked time and trail for one day. from/to are the viewer's local day as ISO times. */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  @Get('admin/tracking')
  day(@Query('from') from?: string, @Query('to') to?: string) {
    const a = new Date(from ?? '');
    const b = new Date(to ?? '');
    if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) || b <= a || b.getTime() - a.getTime() > 2 * 86_400_000) {
      throw new BadRequestException('Pick a day to show');
    }
    return this.tracking.day(a, b);
  }
}
