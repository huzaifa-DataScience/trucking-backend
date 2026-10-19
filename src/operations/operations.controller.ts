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
  haulerRates(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('search') search?: string,
    @Query('company') company?: string,
    @Query('status') status?: string,
  ) {
    // Without `page` the full list is returned as before (haul form / haul log dropdowns use it).
    if (page == null) return this.ops.listHaulerRates();
    return this.ops.listHaulerRatesPage({
      page: intOrUndefined(page),
      pageSize: intOrUndefined(pageSize),
      search,
      company,
      status: status === 'inactive' || status === 'all' ? status : 'active',
    });
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
  disposalRates(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('search') search?: string,
    @Query('company') company?: string,
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: string,
  ) {
    // Without `page` the full list is returned as before (haul form / haul log dropdowns use it).
    if (page == null) return this.ops.listDisposalRates();
    return this.ops.listDisposalRatesPage({
      page: intOrUndefined(page),
      pageSize: intOrUndefined(pageSize),
      search,
      company,
      type,
      status: status === 'inactive' || status === 'all' ? status : 'active',
      sortBy,
      sortDir: sortDir === 'desc' ? 'desc' : 'asc',
    });
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
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('search') search?: string,
  ) {
    const filters = {
      from,
      to,
      jobNumber,
      haulerRateId: intOrUndefined(haulerRateId),
      disposalRateId: intOrUndefined(disposalRateId),
    };
    // Without `page` the full list is returned as before; with it, one page + totals.
    if (page == null) return this.ops.listHauls(filters);
    return this.ops.listHaulsPage(filters, {
      page: intOrUndefined(page),
      pageSize: intOrUndefined(pageSize),
      search,
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
  reportJobs(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: string,
  ) {
    // Without `page` every job is returned as before.
    if (page == null) return this.ops.reportJobs({ from, to });
    return this.ops.reportJobsPage(
      { from, to },
      {
        page: intOrUndefined(page),
        pageSize: intOrUndefined(pageSize),
        sortBy,
        sortDir: sortDir === 'asc' ? 'asc' : 'desc',
      },
    );
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
