import { Controller, Get, Param } from '@nestjs/common';
import { TicketsService } from './tickets.service';

/** Shared drill-down: ticket detail + photo gallery for any grid. */
@Controller('tickets')
export class TicketsController {
  constructor(private readonly tickets: TicketsService) {}

  @Get('detail/:ticketNumber')
  async getDetail(@Param('ticketNumber') ticketNumber: string) {
    return this.tickets.getDetail(ticketNumber);
  }
}
