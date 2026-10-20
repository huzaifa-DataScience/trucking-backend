import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BidContent } from '../database/entities';
import { OutboundEmailService } from '../email/outbound-email.service';
import { UsersService } from '../users/users.service';
import { BiddingLookupsService } from './bidding-lookups.service';
import { indexPeopleByName, lookupPersonByName } from './process/bid-crew';
import { TAKEOFF_ROLES, parseProcess, type BidProcess, type TakeoffRole } from './process/bid-process';

const TAKEOFF_ROLE_LABELS: Record<TakeoffRole, string> = {
  duct1: 'Duct 1',
  duct2: 'Duct 2',
  duct3: 'Duct 3',
  hydronic1: 'Hydronic 1',
  hydronic2: 'Hydronic 2',
  hydronic3: 'Hydronic 3',
  plumbing1: 'Plumbing 1',
  plumbing2: 'Plumbing 2',
  vrf: 'VRF',
  equipment: 'Equipment',
  other: 'Other',
};

type AssigneeChange = { role: string; roleLabel: string; name: string };

/**
 * Assignment-stage email nudges: captain gets one when they're named captain,
 * assistant estimator / takeoff people get one when a captain assigns them a role.
 * Fire-and-forget from BiddingService — never blocks or fails a bid save.
 */
@Injectable()
export class BiddingAssignmentNotificationsService {
  private readonly logger = new Logger(BiddingAssignmentNotificationsService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly outbound: OutboundEmailService,
    private readonly usersService: UsersService,
    private readonly lookups: BiddingLookupsService,
    @InjectRepository(BidContent) private readonly contentRepo: Repository<BidContent>,
  ) {}

  /** Weekday mail when a takeoff due date is 5, 4, or 3 New York days away. One mail per person per bid. */
  @Cron('0 15 8 * * 1-5', { timeZone: 'America/New_York' })
  async remindTakeoffDue(): Promise<void> {
    try {
      if (!this.outbound.isConfigured()) return;
      const today = nyCalendarDate(0);
      const rows = await this.contentRepo
        .createQueryBuilder('c')
        .innerJoinAndSelect('c.bid', 'b')
        .where('b.isDeleted = :del', { del: false })
        .andWhere('b.status != :arch', { arch: 'archived' })
        .getMany();
      const contacts = await this.usersService.listCrewContacts();
      const byName = indexPeopleByName(contacts);
      for (const row of rows) {
        const bid = row.bid;
        if (!bid) continue;
        let process: BidProcess;
        try {
          process = parseProcess(JSON.parse(row.processJson || 'null'));
        } catch {
          continue;
        }
        const byEmail = new Map<string, { name: string; lines: string[]; soonest: number }>();
        for (const assignment of process.takeoffAssignments) {
          const name = assignment.assigneeName?.trim();
          if (!name || !assignment.dueAt) continue;
          const days = daysUntil(assignment.dueAt, today);
          if (days !== 5 && days !== 4 && days !== 3) continue;
          const person = lookupPersonByName(byName, name);
          if (!person?.email) continue;
          const label = TAKEOFF_ROLE_LABELS[assignment.role] ?? assignment.role;
          const entry = byEmail.get(person.email) ?? { name, lines: [], soonest: days };
          entry.soonest = Math.min(entry.soonest, days);
          entry.lines.push(`${label} is due in ${days} days (${assignment.dueAt.slice(0, 10)})`);
          byEmail.set(person.email, entry);
        }
        const bidLabel = this.bidEmailLabel(bid);
        const bidUrl = this.bidUrl(bid.id);
        for (const [email, entry] of byEmail) {
          const subject = `Takeoff due in ${entry.soonest} days — ${bidLabel}`;
          const html = this.wrapHtml(`
            <p>${this.escapeHtml(entry.name)}, your takeoff on <strong>${this.escapeHtml(bidLabel)}</strong>:</p>
            <ul>${entry.lines.map((line) => `<li>${this.escapeHtml(line)}</li>`).join('')}</ul>
            ${bidUrl ? `<p><a href="${bidUrl}" style="color:#2563eb;">Open the bid</a></p>` : ''}
          `);
          await this.sendOne(email, subject, html);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Takeoff due reminder failed: ${msg}`);
    }
  }

  async notify(bidId: number, bidLabel: string, before: BidProcess, after: BidProcess): Promise<void> {
    try {
      if (!this.outbound.isConfigured()) return;

      const captainChange = this.captainChange(before, after);
      const assigneeChanges = this.assigneeChanges(before, after);
      if (!captainChange && assigneeChanges.length === 0) return;

      const bidUrl = this.bidUrl(bidId);

      if (captainChange != null) {
        await this.notifyCaptain(captainChange, bidLabel, bidUrl);
      }
      if (assigneeChanges.length) {
        await this.notifyAssignees(assigneeChanges, bidLabel, bidUrl);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Assignment notification failed for bid ${bidId}: ${msg}`);
    }
  }

  private captainChange(before: BidProcess, after: BidProcess): number | null {
    const nextId = after.assignment.captainUserId;
    const prevId = before.assignment.captainUserId;
    return nextId != null && nextId !== prevId ? nextId : null;
  }

  private assigneeChanges(before: BidProcess, after: BidProcess): AssigneeChange[] {
    const changes: AssigneeChange[] = [];

    const nextAe = (after.assignment.assistantEstimator ?? '').trim();
    const prevAe = (before.assignment.assistantEstimator ?? '').trim();
    if (nextAe && nextAe.toLowerCase() !== prevAe.toLowerCase()) {
      changes.push({ role: 'assistantEstimator', roleLabel: 'Assistant Estimator', name: nextAe });
    }

    const prevByRole = new Map(before.takeoffAssignments.map((r) => [r.role, r.assigneeName]));
    for (const role of TAKEOFF_ROLES) {
      const row = after.takeoffAssignments.find((r) => r.role === role);
      const nextName = (row?.assigneeName ?? '').trim();
      if (!nextName) continue;
      const prevName = (prevByRole.get(role) ?? '').trim();
      if (nextName.toLowerCase() !== prevName.toLowerCase()) {
        changes.push({ role, roleLabel: TAKEOFF_ROLE_LABELS[role], name: nextName });
      }
    }

    return changes;
  }

  private async notifyCaptain(captainUserId: number, bidLabel: string, bidUrl: string): Promise<void> {
    const captain = await this.usersService.findById(captainUserId);
    if (!captain?.email) {
      this.logger.warn(`Captain user ${captainUserId} has no email — skipping assignment email`);
      return;
    }
    const subject = `You're captain on ${bidLabel}`;
    const html = this.wrapHtml(`
      <p>You've been assigned as <strong>Captain</strong> on:</p>
      <p style="font-size:16px;font-weight:600;">${this.escapeHtml(bidLabel)}</p>
      ${bidUrl ? `<p><a href="${bidUrl}" style="color:#2563eb;">Open the bid</a></p>` : ''}
    `);
    await this.sendOne(captain.email, subject, html);
  }

  private async notifyAssignees(changes: AssigneeChange[], bidLabel: string, bidUrl: string): Promise<void> {
    const contacts = await this.usersService.listCrewContacts();
    const byName = indexPeopleByName(contacts);

    const byEmail = new Map<string, { roles: string[] }>();
    const unresolved: AssigneeChange[] = [];
    for (const change of changes) {
      const person = lookupPersonByName(byName, change.name);
      if (!person?.email) {
        unresolved.push(change);
        continue;
      }
      const entry = byEmail.get(person.email) ?? { roles: [] };
      entry.roles.push(change.roleLabel);
      byEmail.set(person.email, entry);
    }

    if (unresolved.length) {
      this.logger.warn(
        `No email on file for: ${unresolved.map((c) => `${c.name} (${c.roleLabel})`).join(', ')} — skipping their assignment email`,
      );
    }

    for (const [email, { roles }] of byEmail) {
      const subject =
        roles.length > 1
          ? `You've been assigned to ${bidLabel} (${roles.length} roles)`
          : `You've been assigned to ${bidLabel} as ${roles[0]}`;
      const html = this.wrapHtml(`
        <p>The captain assigned you to:</p>
        <p style="font-size:16px;font-weight:600;">${this.escapeHtml(bidLabel)}</p>
        <p>Role${roles.length > 1 ? 's' : ''}: <strong>${this.escapeHtml(roles.join(', '))}</strong></p>
        ${bidUrl ? `<p><a href="${bidUrl}" style="color:#2563eb;">Open the bid</a></p>` : ''}
      `);
      await this.sendOne(email, subject, html);
    }
  }

  private async sendOne(to: string, subject: string, html: string): Promise<void> {
    try {
      await this.outbound.send({ to, subject, html });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Assignment email to ${to} failed: ${msg}`);
    }
  }

  private bidEmailLabel(bid: { estimateNumber: string; bidName: string | null }): string {
    return bid.bidName ? `${bid.estimateNumber} — ${bid.bidName}` : bid.estimateNumber;
  }

  private bidUrl(bidId: number): string {
    const base = this.config.get<string>('APP_DASHBOARD_URL', '').trim();
    return base ? `${base.replace(/\/+$/, '')}/bidding/${bidId}` : '';
  }

  private wrapHtml(body: string): string {
    return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111827;">${body}</div>`;
  }

  private escapeHtml(s: string | null | undefined): string {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}

function nyCalendarDate(offsetDays: number): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const [year, month, day] = parts.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + offsetDays)).toISOString().slice(0, 10);
}

function daysUntil(dueAt: string, today: string): number | null {
  const due = Date.parse(`${dueAt.slice(0, 10)}T00:00:00Z`);
  const start = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(due) || Number.isNaN(start)) return null;
  return Math.round((due - start) / 86_400_000);
}
