import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OutboundEmailService } from '../email/outbound-email.service';
import { UsersService } from '../users/users.service';
import { BiddingLookupsService } from './bidding-lookups.service';
import { indexPeopleByName, lookupPersonByName } from './process/bid-crew';
import { TAKEOFF_ROLES, type BidProcess, type TakeoffRole } from './process/bid-process';

const TAKEOFF_ROLE_LABELS: Record<TakeoffRole, string> = {
  duct1: 'Duct 1',
  duct2: 'Duct 2',
  hydronic1: 'Hydronic 1',
  hydronic2: 'Hydronic 2',
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
  ) {}

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
