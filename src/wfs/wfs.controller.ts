import { Body, Controller, Get, Patch, Query, UseGuards } from '@nestjs/common';
import { Roles } from '../auth/decorators';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { Role } from '../database/entities';
import { WfsService } from './wfs.service';

@Controller('wfs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SuperAdmin)
export class WfsController {
  constructor(private readonly wfs: WfsService) {}

  @Get('status')
  status() {
    return this.wfs.status();
  }

  /** Dashboard Pro Loans v44 — paint this. Do not re-derive. */
  @Get('dashboard')
  dashboard(
    @Query('range') range?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.wfs.dashboard({ range, from, to });
  }

  /** PJ knobs (LOC, notes, property, Fidelity). */
  @Get('static')
  listStatic() {
    return this.wfs.listStatic();
  }

  @Patch('static')
  patchStatic(
    @Body() body: { items?: { id: number; amount?: number; label?: string; asOfDate?: string | null }[] },
  ) {
    return this.wfs.patchStatic(body.items ?? []);
  }

  /** Invoice lines behind a company AR or AP total. */
  @Get('aging')
  aging(@Query('company') company?: string, @Query('side') side?: string) {
    return this.wfs.agingLines(company ?? '', side === 'ap' ? 'ap' : 'ar');
  }

  /** Latest Plaid balances (all account types). */
  @Get('cash')
  cash() {
    return this.wfs.cashAccounts();
  }
}
