import { Global, Module } from '@nestjs/common';
import { ExcelExportService } from './excel-export.service';

@Global()
@Module({
  providers: [ExcelExportService],
  exports: [ExcelExportService],
})
export class CommonModule {}
