/**
 * TicketRow as defined in BACKEND_API_SPEC.md.
 * Shared by Job, Material, and Hauler dashboards.
 */
export type Direction = 'Import' | 'Export';

export class TicketGridRowDto {
  ticketNumber: string;
  ticketDate: string; // YYYY-MM-DD
  createdAt: string; // ISO datetime

  jobName: string;
  /** Company name from OurEntity (job's entity) */
  companyName: string;
  direction: Direction;
  destinationOrigin: string; // external site name

  haulingCompany: string; // vendor/hauler name
  material: string; // material name
  truckNumber: string;
  truckType: string;
  driverName: string;

  hasPhysicalTicket: boolean;
  /** "N/A" | "MISSING" | actual number */
  haulerTicketNumber: string;

  signedBy: string;

  // Pivoted photo URLs (null when absent)
  photoTicket: string | null;
  photoTruck1: string | null;
  photoTruck2: string | null;
  photoAsbestos: string | null;
  photoScrap: string | null;
}
