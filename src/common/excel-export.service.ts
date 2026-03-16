import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { TicketGridRowDto } from './dto/ticket-grid.dto';

const TICKET_GRID_HEADERS = [
  'Ticket Number',
  'Ticket Date',
  'Created At',
  'Job Name',
  'Company',
  'Import/Export',
  'Destination / Origin',
  'Hauling Company',
  'Material',
  'Truck Number',
  'Truck Type',
  'Driver Name',
  'Hauler Ticket Number',
  'Signed By',
  'Physical Ticket Photo',
  'Truck Photo 1',
  'Truck Photo 2',
  'Asbestos Photo',
  'Scrap Photo',
] as const;

@Injectable()
export class ExcelExportService {
  async exportTicketGrid(
    rows: TicketGridRowDto[],
    sheetName = 'Tickets',
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(sheetName, {
      pageSetup: { fitToPage: true },
    });
    sheet.columns = TICKET_GRID_HEADERS.map((h) => ({ header: h, width: 18 }));
    sheet.addRows(
      rows.map((r) => [
        r.ticketNumber,
        r.ticketDate,
        r.createdAt,
        r.jobName,
        r.companyName ?? '',
        r.direction,
        r.destinationOrigin,
        r.haulingCompany,
        r.material,
        r.truckNumber,
        r.truckType,
        r.driverName,
        r.haulerTicketNumber,
        r.signedBy,
        r.photoTicket ?? '',
        r.photoTruck1 ?? '',
        r.photoTruck2 ?? '',
        r.photoAsbestos ?? '',
        r.photoScrap ?? '',
      ]),
    );
    sheet.getRow(1).font = { bold: true };
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}
