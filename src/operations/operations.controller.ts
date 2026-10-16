import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards';
import { DisposalRateDto, HaulTicketDto, HaulerRateDto } from './operations.dto';
import { OperationsService } from './operations.service';

function intOrUndefined(raw?: string): number | undefined {
  if (raw == null || raw.trim() === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.trunc(n) : undefined;
}

@Controller('operations')
@UseGuards(JwtAuthGuard)
export class OperationsController {
  constructor(private readonly ops: OperationsService) {}

  @Get('meta')
  meta() {
    return this.ops.meta();
  }

  @Get('hauler-rates')
  haulerRates() {
    return this.ops.listHaulerRates();
  }

  @Post('hauler-rates')
  createHauler(@Body() body: HaulerRateDto) {
    return this.ops.saveHaulerRate(body);
  }

  @Patch('hauler-rates/:id')
  updateHauler(@Param('id', ParseIntPipe) id: number, @Body() body: HaulerRateDto) {
    return this.ops.saveHaulerRate(body, id);
  }

  @Get('disposal-rates')
  disposalRates() {
    return this.ops.listDisposalRates();
  }

  @Post('disposal-rates')
  createDisposal(@Body() body: DisposalRateDto) {
    return this.ops.saveDisposalRate(body);
  }

  @Patch('disposal-rates/:id')
  updateDisposal(@Param('id', ParseIntPipe) id: number, @Body() body: DisposalRateDto) {
    return this.ops.saveDisposalRate(body, id);
  }

  @Get('hauls')
  hauls(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('jobNumber') jobNumber?: string,
    @Query('haulerRateId') haulerRateId?: string,
    @Query('disposalRateId') disposalRateId?: string,
  ) {
    return this.ops.listHauls({
      from,
      to,
      jobNumber,
      haulerRateId: intOrUndefined(haulerRateId),
      disposalRateId: intOrUndefined(disposalRateId),
    });
  }

  @Post('hauls')
  createHaul(@Body() body: HaulTicketDto) {
    return this.ops.saveHaul(body);
  }

  @Patch('hauls/:id')
  updateHaul(@Param('id', ParseIntPipe) id: number, @Body() body: HaulTicketDto) {
    return this.ops.saveHaul(body, id);
  }

  @Delete('hauls/:id')
  deleteHaul(@Param('id', ParseIntPipe) id: number) {
    return this.ops.deleteHaul(id);
  }

  @Get('reports/jobs')
  reportJobs(@Query('from') from?: string, @Query('to') to?: string) {
    return this.ops.reportJobs({ from, to });
  }

  @Get('reports/haulers')
  reportHaulers(@Query('from') from?: string, @Query('to') to?: string) {
    return this.ops.reportHaulers({ from, to });
  }

  @Get('reports/destinations')
  reportDestinations(@Query('from') from?: string, @Query('to') to?: string) {
    return this.ops.reportDestinations({ from, to });
  }

  @Get('reports/leed')
  reportLeed(@Query('from') from?: string, @Query('to') to?: string) {
    return this.ops.reportLeed({ from, to });
  }
}
