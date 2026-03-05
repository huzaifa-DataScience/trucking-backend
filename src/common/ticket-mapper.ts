import { Ticket } from '../database/entities';
import { PhotoType } from '../database/entities/photo.entity';
import { TicketDetailDto, TicketPhotoDetail } from './dto/ticket-detail.dto';
import { TicketGridRowDto } from './dto/ticket-grid.dto';

function getPhotoUrl(photo: { photoType: string; url?: string | null }): string | null {
  return photo.url ?? null;
}

function haulerTicketDisplay(hasPhysical: boolean, number: string | null): string {
  if (!hasPhysical) return 'N/A';
  if (number == null || String(number).trim() === '') return 'MISSING';
  return number;
}

function photoByType(photos: { photoType: string; url?: string | null }[], type: string): string | null {
  const p = photos.find((x) => x.photoType === type);
  return p ? getPhotoUrl(p) : null;
}

export function mapTicketToGridRow(t: Ticket): TicketGridRowDto {
  const photos = t.photos ?? [];
  return {
    ticketNumber: t.ticketNumber,
    ticketDate: t.ticketDate ? new Date(t.ticketDate).toISOString().slice(0, 10) : '',
    createdAt: t.createdAt ? new Date(t.createdAt).toISOString() : '',

    jobName: t.job?.name ?? '',
    direction: t.direction ?? 'Import',
    destinationOrigin: t.externalSite?.name ?? '',

    haulingCompany: t.hauler?.companyName ?? '',
    material: t.material?.name ?? '',
    truckNumber: t.truckNumber ?? '',
    truckType: t.truckType?.name ?? '',
    driverName: t.driver?.driverName ?? t.signedBy ?? '',

    hasPhysicalTicket: t.hasPhysicalTicket ?? false,
    haulerTicketNumber: haulerTicketDisplay(
      t.hasPhysicalTicket ?? false,
      t.physicalTicketNumber,
    ),

    signedBy: t.signedBy ?? '',

    photoTicket: photoByType(photos, PhotoType.PhysicalTicket),
    photoTruck1: photoByType(photos, PhotoType.Truck1),
    photoTruck2: photoByType(photos, PhotoType.Truck2),
    photoAsbestos: photoByType(photos, PhotoType.Asbestos),
    photoScrap: photoByType(photos, PhotoType.Scrap),
  };
}

export function mapTicketToDetail(t: Ticket): TicketDetailDto {
  const grid = mapTicketToGridRow(t);
  const photos: TicketPhotoDetail[] = (t.photos ?? []).map((p) => ({
    id: p.id,
    ticketId: p.ticketId,
    type: p.photoType as TicketPhotoDetail['type'],
    url: p.url ?? '',
    fileName: undefined,
  }));

  const detail: TicketDetailDto = {
    ...grid,
    id: t.id,
    companyId: t.job?.entityId != null ? String(t.job.entityId) : '',
    photos,
  };

  return detail;
}
