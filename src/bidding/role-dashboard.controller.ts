import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards';
import { CurrentUser } from '../auth/decorators';
import { User } from '../database/entities';
import { BiddingService } from './bidding.service';

/** Role home — not the Estimates list (`GET /bids`). */
@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class RoleDashboardController {
  constructor(private readonly bidding: BiddingService) {}

  @Get()
  home(@CurrentUser() user: User) {
    return this.bidding.myPlate(user);
  }
}
