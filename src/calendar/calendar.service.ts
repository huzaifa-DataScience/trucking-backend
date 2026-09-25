import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  Bid,
  BidTeam,
  CalendarEvent,
  ConnecteamScheduledShift,
  ConnecteamTask,
  ConnecteamTimeActivity,
  ConnecteamTimeOffRequest,
  ConnecteamUser,
  User,
  UserStatus,
} from '../database/entities';
import { isAdminPanelRole, userDisplayName } from '../database/entities/user.entity';
import { apiBadRequest } from '../common/errors/api-error';
import { parseProcess } from '../bidding/process/bid-process';
import {
  bidCalendarItems,
  bidInfo,
  bidRolesFor,
  jsonIds,
  parseRange,
  personNameMatcher,
  shiftYmd,
  sortItems,
  unixToIso,
  type BidRowForCalendar,
  type CalendarItem,
} from './calendar.util';
import type { CalendarEventDto } from './calendar.dto';

type Viewer = { id: number; role: string };

export type CalendarResponse = {
  person: { id: number; name: string; email: string };
  from: string;
  to: string;
  items: CalendarItem[];
  /** Sources that failed to load; the rest of the calendar still renders. */
  warnings: string[];
};

/** Instants are fetched with a day of padding each side so any browser time zone is covered. */
const PAD_DAYS = 1;

/**
 * One person's calendar: bid milestones for bids they're on, their takeoff
 * assignments, Connecteam shifts / clocked time / tasks / time off,
 * and their own custom events. People see only their own; admins can see anyone's.
 */
@Injectable()
export class CalendarService {
  private readonly logger = new Logger(CalendarService.name);

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Bid) private readonly bids: Repository<Bid>,
    @InjectRepository(BidTeam) private readonly teams: Repository<BidTeam>,
    @InjectRepository(CalendarEvent) private readonly events: Repository<CalendarEvent>,
    @InjectRepository(ConnecteamUser) private readonly ctUsers: Repository<ConnecteamUser>,
    @InjectRepository(ConnecteamScheduledShift) private readonly ctShifts: Repository<ConnecteamScheduledShift>,
    @InjectRepository(ConnecteamTimeActivity) private readonly ctClocked: Repository<ConnecteamTimeActivity>,
    @InjectRepository(ConnecteamTask) private readonly ctTasks: Repository<ConnecteamTask>,
    @InjectRepository(ConnecteamTimeOffRequest) private readonly ctTimeOff: Repository<ConnecteamTimeOffRequest>,
  ) {}

  /** Own calendar always; someone else's only for admins. */
  async resolvePerson(viewer: Viewer, userId?: number): Promise<User> {
    const targetId = userId ?? viewer.id;
    if (targetId !== viewer.id && !isAdminPanelRole(viewer.role)) {
      throw new ForbiddenException('You can only view your own calendar');
    }
    const person = await this.users.findOne({ where: { id: targetId } });
    if (!person) throw new NotFoundException(`User ${targetId} not found`);
    return person;
  }

  async getCalendar(viewer: Viewer, q: { from?: string; to?: string; userId?: number }): Promise<CalendarResponse> {
    const range = parseRange(q.from, q.to);
    if (!range) throw apiBadRequest('CALENDAR_RANGE_INVALID', 'from/to must be YYYY-MM-DD, to ≥ from, at most 400 days apart');
    const person = await this.resolvePerson(viewer, q.userId);

    const warnings: string[] = [];
    const guard = async (label: string, fn: () => Promise<CalendarItem[]>) => {
      try {
        return await fn();
      } catch (err) {
        // A missing mirror table (integration never set up) must not blank the whole calendar.
        this.logger.warn(`Calendar ${label} for user ${person.id} failed: ${(err as Error)?.message ?? err}`);
        warnings.push(label);
        return [];
      }
    };

    const ctUserIds = await this.connecteamIds(person.id).catch((err) => {
      this.logger.warn(`Calendar Connecteam link for user ${person.id} failed: ${err?.message ?? err}`);
      warnings.push('Connecteam');
      return [] as number[];
    });

    const parts = await Promise.all([
      guard('Bids', () => this.bidItems(person, range)),
      guard('Connecteam shifts', () => this.shiftItems(ctUserIds, range)),
      guard('Connecteam time clock', () => this.clockedItems(ctUserIds, range)),
      guard('Connecteam tasks', () => this.taskItems(ctUserIds, range)),
      guard('Connecteam time off', () => this.timeOffItems(ctUserIds, range)),
      guard('Custom events', () => this.customItems(person.id, viewer.id, range)),
    ]);

    return {
      person: { id: person.id, name: userDisplayName(person), email: person.email },
      from: range.from,
      to: range.to,
      items: sortItems(parts.flat()),
      warnings,
    };
  }

  /** Active people an admin can pick from. */
  async listPeople(viewer: Viewer) {
    if (!isAdminPanelRole(viewer.role)) throw new ForbiddenException('Admins only');
    const rows = await this.users.find({
      where: { status: UserStatus.Active },
      select: { id: true, email: true, firstName: true, lastName: true, role: true },
    });
    return rows
      .map((u) => ({ id: u.id, name: userDisplayName(u), email: u.email, role: u.role }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Bids this person is on — for linking a custom event to a bid. */
  async listMyBids(viewer: Viewer, userId?: number) {
    const person = await this.resolvePerson(viewer, userId);
    const rows = await this.loadBids();
    const isMe = personNameMatcher(person);
    return rows
      .map((b) => ({ bid: b, roles: bidRolesFor(person, b, isMe) }))
      .filter((r) => r.roles.length)
      .map((r) => bidInfo(r.bid, r.roles));
  }

  async createEvent(viewer: Viewer, dto: CalendarEventDto) {
    const fields = await this.eventFields(dto);
    const saved = await this.events.save(this.events.create({ ...fields, ownerUserId: viewer.id }));
    return (await this.customItems(viewer.id, viewer.id, null, saved.id))[0];
  }

  async updateEvent(viewer: Viewer, id: number, dto: CalendarEventDto) {
    const row = await this.ownEvent(viewer, id);
    Object.assign(row, await this.eventFields(dto), { updatedAt: new Date() });
    await this.events.save(row);
    return (await this.customItems(viewer.id, viewer.id, null, id))[0];
  }

  async deleteEvent(viewer: Viewer, id: number) {
    await this.ownEvent(viewer, id);
    await this.events.delete({ id, ownerUserId: viewer.id });
    return { ok: true };
  }

  // ── Sources ────────────────────────────────────────────────────────────────

  private async loadBids(): Promise<BidRowForCalendar[]> {
    const rows = await this.bids
      .createQueryBuilder('b')
      .leftJoinAndSelect('b.content', 'c')
      .where('b.isDeleted = 0')
      .andWhere("b.status <> 'archived'")
      .getMany();
    const teams = await this.teams.find();
    const teamName = new Map(teams.map((t) => [t.id, t.teamName]));
    return rows.map((b) => {
      const process = parseProcess(safeJson(b.content?.processJson));
      const company = safeJson(b.content?.companyInfoJson) as Record<string, unknown> | null;
      return {
        id: b.id,
        estimateNumber: b.estimateNumber,
        bidName: b.bidName,
        processStage: b.processStage,
        outcomeStatus: b.outcomeStatus,
        bidDate: dateOnly(b.bidDate),
        submitDate: dateOnly(b.submitDate),
        createdByUserId: b.createdByUserId,
        clientCompanyName: typeof company?.companyName === 'string' ? company.companyName : null,
        teamName: process.assignment.teamId != null ? teamName.get(process.assignment.teamId) ?? null : null,
        process,
      };
    });
  }

  private async bidItems(person: User, range: { from: string; to: string }): Promise<CalendarItem[]> {
    const rows = await this.loadBids();
    return rows.flatMap((b) => bidCalendarItems(b, person, range));
  }

  private async connecteamIds(appUserId: number): Promise<number[]> {
    const rows = await this.ctUsers.find({ where: { appUserId }, select: { userId: true } });
    return rows.map((r) => r.userId);
  }

  private async shiftItems(ctIds: number[], range: { from: string; to: string }): Promise<CalendarItem[]> {
    if (!ctIds.length) return [];
    const { startSec, endSec } = paddedSeconds(range);
    const rows = await this.ctShifts
      .createQueryBuilder('s')
      .where('s.startTime >= :a AND s.startTime <= :b', { a: startSec, b: endSec })
      .andWhere('s.isPublished = 1')
      .getMany();
    return rows
      .filter((s) => jsonIds(s.assignedUserIdsJson).some((id) => ctIds.includes(id)))
      .map((s) =>
        item({
          id: `shift:${s.schedulerId}:${s.shiftId}`,
          source: 'shift',
          kind: 'scheduled_shift',
          title: s.title || 'Scheduled shift',
          start: unixToIso(s.startTime)!,
          end: unixToIso(s.endTime),
          location: s.locationAddress,
        }),
      )
      .filter((i) => i.start);
  }

  private async clockedItems(ctIds: number[], range: { from: string; to: string }): Promise<CalendarItem[]> {
    if (!ctIds.length) return [];
    const { startSec, endSec } = paddedSeconds(range);
    const rows = await this.ctClocked
      .createQueryBuilder('a')
      .where('a.userId IN (:...ids)', { ids: ctIds })
      .andWhere('a.startTimestamp >= :a AND a.startTimestamp <= :b', { a: startSec, b: endSec })
      .getMany();
    return rows
      .map((a) =>
        item({
          id: `clocked:${a.timeClockId}:${a.shiftId}`,
          source: 'clocked',
          kind: a.endTimestamp ? 'clocked_shift' : 'clocked_in',
          title: a.endTimestamp ? 'Clocked shift' : 'Clocked in',
          start: unixToIso(a.startTimestamp)!,
          end: unixToIso(a.endTimestamp),
          description: [a.employeeNote, a.managerNote].filter(Boolean).join('\n') || null,
        }),
      )
      .filter((i) => i.start);
  }

  private async taskItems(ctIds: number[], range: { from: string; to: string }): Promise<CalendarItem[]> {
    if (!ctIds.length) return [];
    const { startSec, endSec } = paddedSeconds(range);
    const rows = await this.ctTasks
      .createQueryBuilder('t')
      .where('t.isArchived = 0')
      .andWhere('t.dueDate >= :a AND t.dueDate <= :b', { a: startSec, b: endSec })
      .getMany();
    return rows
      .filter((t) => jsonIds(t.userIdsJson).some((id) => ctIds.includes(id)))
      .map((t) =>
        item({
          id: `task:${t.taskBoardId}:${t.taskId}`,
          source: 'task',
          kind: 'task_due',
          title: `Task due — ${t.title || 'Untitled task'}`,
          start: unixToIso(t.dueDate)!,
          end: null,
          description: t.descriptionSummary,
          details: t.status ? [{ label: 'Status', value: t.status }] : [],
        }),
      )
      .filter((i) => i.start);
  }

  private async timeOffItems(ctIds: number[], range: { from: string; to: string }): Promise<CalendarItem[]> {
    if (!ctIds.length) return [];
    const rows = await this.ctTimeOff
      .createQueryBuilder('r')
      .where('r.userId IN (:...ids)', { ids: ctIds })
      .andWhere('r.startDate <= :to AND r.endDate >= :from', range)
      .andWhere("LOWER(r.status) NOT IN ('rejected', 'denied', 'cancelled', 'canceled')")
      .getMany();
    return rows.map((r) => {
      const start = dateOnly(r.startDate)!;
      const end = dateOnly(r.endDate);
      return item({
        id: `time_off:${r.requestId}`,
        source: 'time_off',
        kind: `time_off_${String(r.status).toLowerCase()}`,
        title: `Time off (${r.status})`,
        start,
        end: end && end !== start ? end : null,
        allDay: true,
        description: r.employeeNote,
        details: [
          ...(r.durationAmount != null ? [{ label: 'Duration', value: `${Number(r.durationAmount)} ${r.durationUnits ?? ''}`.trim() }] : []),
          ...(r.managerNote ? [{ label: 'Manager note', value: r.managerNote }] : []),
        ],
      });
    });
  }

  private async customItems(
    ownerId: number,
    viewerId: number,
    range: { from: string; to: string } | null,
    onlyId?: number,
  ): Promise<CalendarItem[]> {
    const qb = this.events.createQueryBuilder('e').where('e.ownerUserId = :ownerId', { ownerId });
    if (onlyId != null) qb.andWhere('e.id = :id', { id: onlyId });
    if (range) {
      const { start, end } = paddedInstants(range);
      qb.andWhere('e.startAt <= :end AND COALESCE(e.endAt, e.startAt) >= :start', { start, end });
    }
    const rows = await qb.getMany();
    const bidIds = [...new Set(rows.map((r) => r.bidId).filter((id): id is number => id != null))];
    const bids = bidIds.length
      ? await this.bids.find({ where: { id: In(bidIds), isDeleted: false }, select: { id: true, estimateNumber: true, bidName: true } })
      : [];
    const byId = new Map(bids.map((b) => [b.id, b]));
    return rows.map((e) => {
      const b = e.bidId != null ? byId.get(e.bidId) : undefined;
      return item({
        id: `custom:${e.id}`,
        source: 'custom',
        kind: 'custom',
        title: e.title,
        start: e.allDay ? e.startAt.toISOString().slice(0, 10) : e.startAt.toISOString(),
        end: e.endAt ? (e.allDay ? e.endAt.toISOString().slice(0, 10) : e.endAt.toISOString()) : null,
        allDay: e.allDay,
        description: e.description,
        location: e.location,
        editable: ownerId === viewerId,
        customEventId: e.id,
        bidLink: b ? { id: b.id, estimateNumber: b.estimateNumber, bidName: b.bidName } : null,
      });
    });
  }

  // ── Custom event helpers ─────────────────────────────────────────────────────

  /** Someone else's event reads as not found, so ids can't be probed. */
  private async ownEvent(viewer: Viewer, id: number): Promise<CalendarEvent> {
    const row = await this.events.findOne({ where: { id, ownerUserId: viewer.id } });
    if (!row) throw new NotFoundException(`Event ${id} not found`);
    return row;
  }

  private async eventFields(dto: CalendarEventDto) {
    const allDay = dto.allDay === true;
    const start = parseEventInstant(dto.start, allDay);
    const end = dto.end ? parseEventInstant(dto.end, allDay) : null;
    if (!start) throw apiBadRequest('CALENDAR_EVENT_INVALID', allDay ? 'start must be YYYY-MM-DD' : 'start must be an ISO date-time');
    if (dto.end && !end) throw apiBadRequest('CALENDAR_EVENT_INVALID', 'end is not a valid date');
    if (end && end < start) throw apiBadRequest('CALENDAR_EVENT_INVALID', 'end must be on or after start');
    if (dto.bidId != null) {
      const exists = await this.bids.exists({ where: { id: dto.bidId, isDeleted: false } });
      if (!exists) throw apiBadRequest('CALENDAR_EVENT_INVALID', `Bid ${dto.bidId} not found`);
    }
    return {
      title: dto.title.trim(),
      description: dto.description?.trim() || null,
      location: dto.location?.trim() || null,
      allDay,
      startAt: start,
      endAt: end,
      bidId: dto.bidId ?? null,
    };
  }
}

function item(p: {
  id: string;
  source: CalendarItem['source'];
  kind: string;
  title: string;
  start: string;
  end: string | null;
  allDay?: boolean;
  description?: string | null;
  location?: string | null;
  details?: CalendarItem['details'];
  editable?: boolean;
  customEventId?: number;
  bidLink?: { id: number; estimateNumber: string; bidName: string | null } | null;
}): CalendarItem {
  return {
    id: p.id,
    source: p.source,
    kind: p.kind,
    title: p.title,
    start: p.start,
    end: p.end,
    allDay: p.allDay ?? false,
    description: p.description ?? null,
    location: p.location ?? null,
    bid: p.bidLink
      ? {
          id: p.bidLink.id,
          estimateNumber: p.bidLink.estimateNumber,
          bidName: p.bidLink.bidName,
          clientCompanyName: null,
          processStage: '',
          outcomeStatus: '',
          dueDate: null,
          dueTime: null,
          teamName: null,
          captain: null,
          roles: [],
        }
      : null,
    details: p.details ?? [],
    editable: p.editable ?? false,
    ...(p.customEventId != null ? { customEventId: p.customEventId } : {}),
  };
}

function safeJson(raw: string | null | undefined): unknown {
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** `date` columns come back as Date or string depending on the driver path. */
function dateOnly(v: Date | string | null | undefined): string | null {
  if (!v) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null;
}

function paddedInstants(range: { from: string; to: string }) {
  return {
    start: new Date(`${shiftYmd(range.from, -PAD_DAYS)}T00:00:00Z`),
    end: new Date(`${shiftYmd(range.to, PAD_DAYS + 1)}T00:00:00Z`),
  };
}

function paddedSeconds(range: { from: string; to: string }) {
  const { start, end } = paddedInstants(range);
  return { startSec: Math.floor(start.getTime() / 1000), endSec: Math.floor(end.getTime() / 1000) };
}

/** All-day: `YYYY-MM-DD` → UTC midnight. Timed: any ISO instant. */
function parseEventInstant(raw: string, allDay: boolean): Date | null {
  const v = String(raw ?? '').trim();
  if (allDay) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
    const d = new Date(`${v}T00:00:00Z`);
    return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? null : d;
  }
  if (!/^\d{4}-\d{2}-\d{2}T/.test(v)) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}
