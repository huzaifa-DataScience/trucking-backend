import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { TicketsService } from './tickets.service';
import { JwtAuthGuard } from '../auth/guards';

/** Shared drill-down: ticket detail + photo gallery for any grid. */
@Controller('tickets')
@UseGuards(JwtAuthGuard)
export class TicketsController {
  constructor(private readonly tickets: TicketsService) {}

  @Get('detail/:ticketNumber')
  async getDetail(@Param('ticketNumber') ticketNumber: string) {
    return this.tickets.getDetail(ticketNumber);
  }
}
