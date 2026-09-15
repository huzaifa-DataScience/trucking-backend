import type { SelectQueryBuilder } from 'typeorm';
import type { Ticket } from '../database/entities';

/**
 * Whitelisted sort keys -> actual SQL column (alias.column) for the Ticket
 * grid query builder used by job/hauler/material dashboards. All three
 * services join the same relations under the same aliases (t, job, hauler,
 * material, site, truckType), so this map is shared.
 */
export const TICKET_SORT_COLUMNS: Record<string, string> = {
  ticketNumber: 't.ticketNumber',
  ticketDate: 't.ticketDate',
  createdAt: 't.createdAt',
  jobName: 'job.name',
  direction: 't.direction',
  destinationOrigin: 'site.name',
  haulingCompany: 'hauler.companyName',
  material: 'material.name',
  truckNumber: 't.truckNumber',
  truckType: 'truckType.name',
};

export type TicketSortDir = 'ASC' | 'DESC';

/** Replaces the query's default ORDER BY when `sortBy` is a whitelisted column. */
export function applyTicketSort(
  qb: SelectQueryBuilder<Ticket>,
  sortBy?: string,
  sortDir?: TicketSortDir,
): void {
  const column = sortBy ? TICKET_SORT_COLUMNS[sortBy] : undefined;
  if (!column) return;
  const dir: TicketSortDir = sortDir === 'ASC' ? 'ASC' : 'DESC';
  qb.orderBy(column, dir);
  if (sortBy !== 'ticketNumber') {
    qb.addOrderBy('t.ticketNumber', 'ASC');
  }
}

/** Free-text search across the columns visible in the ticket grid. */
export function applyTicketSearch(qb: SelectQueryBuilder<Ticket>, search?: string): void {
  const term = search?.trim();
  if (!term) return;
  qb.andWhere(
    '(t.ticketNumber LIKE :search OR job.name LIKE :search OR hauler.companyName LIKE :search OR material.name LIKE :search OR site.name LIKE :search OR t.truckNumber LIKE :search)',
    { search: `%${term}%` },
  );
}
