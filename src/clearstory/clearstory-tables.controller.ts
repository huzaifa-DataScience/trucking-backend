import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards';
import { ClearstoryTableService } from './clearstory-table.service';

/**
 * Paginated “data grid” reads: each row includes **swagger** (full JSON from sync) plus **typedMirror**
 * (SQL columns) so tables never depend on N+1 `api-payload` calls.
 */
@UseGuards(JwtAuthGuard)
@Controller('clearstory/tables')
export class ClearstoryTablesController {
  constructor(private readonly tables: ClearstoryTableService) {}

  @Get('cors')
  listCors(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('projectId') projectId?: string,
  ) {
    return this.tables.listCors(page, pageSize, projectId);
  }

  @Get('tags')
  listTags(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('projectId') projectId?: string,
  ) {
    return this.tables.listTags(page, pageSize, projectId);
  }

  @Get('customers')
  listCustomers(@Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    return this.tables.listCustomers(page, pageSize);
  }

  @Get('contracts')
  listContracts(@Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    return this.tables.listContracts(page, pageSize);
  }

  @Get('company')
  getCompany() {
    return this.tables.getCompanyRow();
  }
}
