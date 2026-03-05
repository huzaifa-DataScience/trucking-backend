import { Direction, TicketGridRowDto } from './ticket-grid.dto';

/**
 * TicketDetail extends TicketRow as per BACKEND_API_SPEC.md.
 */
export interface TicketPhotoDetail {
  id: number;
  ticketId: number;
  type: 'Ticket' | 'Truck' | 'Truck2' | 'Asbestos' | 'Scrap';
  url: string;
  fileName?: string;
}

export class TicketDetailDto implements TicketGridRowDto {
  // core TicketRow fields
  ticketNumber: string;
  ticketDate: string;
  createdAt: string;

  jobName: string;
  direction: Direction;
  destinationOrigin: string;

  haulingCompany: string;
  material: string;
  truckNumber: string;
  truckType: string;
  driverName: string;

  hasPhysicalTicket: boolean;
  haulerTicketNumber: string;

  signedBy: string;

  photoTicket: string | null;
  photoTruck1: string | null;
  photoTruck2: string | null;
  photoAsbestos: string | null;
  photoScrap: string | null;

  // detail-only fields
  id: number;
  companyId: string;
  photos: TicketPhotoDetail[];
}
