/**
 * Pure calendar helpers: who a person is on a bid, and which bid dates become
 * calendar items. No I/O here — the service loads rows and calls these.
 */
import type { BidProcess } from '../bidding/process/bid-process';
import { indexPeopleByName, lookupPersonByName } from '../bidding/process/bid-crew';

export type CalendarSource =
  | 'bid'
  | 'takeoff'
  | 'shift'
  | 'clocked'
  | 'task'
  | 'time_off'
  | 'custom';

export type CalendarBidInfo = {
  id: number;
  estimateNumber: string;
  bidName: string | null;
  clientCompanyName: string | null;
  processStage: string;
  outcomeStatus: string;
  dueDate: string | null;
  dueTime: string | null;
  teamName: string | null;
  captain: string | null;
  /** This person's roles on the bid, e.g. ["Captain", "Takeoff (duct1)"]. */
  roles: string[];
};

export type CalendarItem = {
  id: string;
  source: CalendarSource;
  /** Stable machine key, e.g. `bid_due`, `internal_review_due`, `shift`. */
  kind: string;
  title: string;
  /** All-day: `YYYY-MM-DD`. Timed: ISO instant. */
  start: string;
  end: string | null;
  allDay: boolean;
  description: string | null;
  location: string | null;
  bid: CalendarBidInfo | null;
  /** Extra facts for the detail panel. */
  details: Array<{ label: string; value: string }>;
  /** Only the owner's custom events are editable. */
  editable: boolean;
  customEventId?: number;
};

export type PersonRef = {
  id: number;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  bidTeamId?: number | null;
};

export type BidRowForCalendar = {
  id: number;
  estimateNumber: string;
  bidName: string | null;
  processStage: string;
  outcomeStatus: string;
  bidDate: string | null;
  submitDate: string | null;
  createdByUserId: number | null;
  clientCompanyName: string | null;
  teamName: string | null;
  process: BidProcess;
};

/** Returns a matcher for names stored as free text on bids ("Mike Roberts", email, aliases). */
export function personNameMatcher(person: PersonRef): (name: unknown) => boolean {
  const index = indexPeopleByName([person]);
  return (name) => lookupPersonByName(index, name) === person;
}

/**
 * Every role this person holds on the bid. Empty → the bid isn't on their calendar.
 * Uses the same name matching the crew picker uses, since most bid people are stored by name.
 */
export function bidRolesFor(person: PersonRef, bid: BidRowForCalendar, isMe = personNameMatcher(person)): string[] {
  const p = bid.process;
  const roles: string[] = [];
  const add = (r: string) => {
    if (!roles.includes(r)) roles.push(r);
  };

  if (p.assignment.captainUserId === person.id || isMe(p.assignment.captain)) add('Captain');
  if (isMe(p.assignment.assistantEstimator)) add('Assistant estimator');
  if (isMe(p.assignment.bidClerk)) add('Bid clerk');
  for (const t of p.takeoffAssignments ?? []) {
    if (isMe(t.assigneeName)) add(`Takeoff (${t.role})`);
  }
  if ([p.additionalDetails.takeOffPerson, p.additionalDetails.takeOffPerson2, p.additionalDetails.takeOffPerson3].some(isMe)) add('Takeoff');
  if (isMe(p.technicalReview.preparedBy)) add('Technical review (prepared)');
  if (isMe(p.technicalReview.reviewedBy)) add('Technical review (reviewer)');
  if (isMe(p.submission.submittedBy)) add('Submitted bid');
  if (isMe(p.intelligence.followUpOwner)) add('Follow-up owner');
  if (isMe(p.award.pm)) add('Project manager');
  if (isMe(p.award.ops)) add('Operations');
  if (person.bidTeamId != null && p.assignment.teamId === person.bidTeamId) add('Team');
  if (bid.createdByUserId === person.id) add('Created bid');
  return roles;
}

const YMD = /^(\d{4}-\d{2}-\d{2})/;
const HM = /^(\d{1,2}):(\d{2})/;

/** Loose bid date → `YYYY-MM-DD`, or null. Accepts `2026-09-24`, `2026-09-24T…`. */
export function ymd(v: unknown): string | null {
  const m = YMD.exec(String(v ?? '').trim());
  return m ? m[1] : null;
}

function hm(v: unknown): string | null {
  const m = HM.exec(String(v ?? '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? `${String(h).padStart(2, '0')}:${m[2]}` : null;
}

const SALES_LABELS: Record<string, string> = {
  initialContact: 'Initial contact',
  siteVisit: 'Site visit',
  bidDrafted: 'Bid drafted',
  bidDelivered: 'Bid delivered',
  frontEndDocs: 'Front-end docs',
  heatTracingSubPricing: 'Heat tracing sub pricing',
  prequalificationPackage: 'Prequalification package',
  mandatoryPreBid: 'Mandatory pre-bid',
};

type DatedBidEvent = { kind: string; label: string; date: string | null; time?: string | null; source?: CalendarSource; details?: CalendarItem['details'] };

/** Every dated milestone on a bid, including this person's own takeoff due dates. */
export function bidDateEvents(bid: BidRowForCalendar, person: PersonRef, isMe = personNameMatcher(person)): DatedBidEvent[] {
  const p = bid.process;
  const out: DatedBidEvent[] = [
    { kind: 'bid_due', label: 'Bid due', date: p.dueDate ?? bid.bidDate, time: p.dueTime },
    { kind: 'submit_target', label: 'Target submit date', date: bid.submitDate },
    { kind: 'internal_estimate_due', label: 'Internal estimate due', date: p.assignment.internalEstimateDue },
    { kind: 'internal_review_due', label: 'Internal review due', date: p.assignment.internalReviewDue },
    { kind: 'technical_review', label: 'Technical review', date: p.technicalReview.reviewDate },
    { kind: 'pre_bid', label: 'Pre-bid meeting', date: p.additionalDetails.preBidDate },
    { kind: 'estimator_bid_date', label: 'Estimator bid date', date: p.additionalDetails.estimatorBidDate },
    { kind: 'login_date', label: 'Login date', date: p.additionalDetails.loginDate },
    { kind: 'dead_date', label: 'Dead date', date: p.additionalDetails.deadDate },
    { kind: 'contract_date', label: 'Contract date', date: p.additionalDetails.contractDate },
    {
      kind: 'submitted',
      label: 'Bid submitted',
      date: p.submission.date,
      time: p.submission.time,
      details: p.submission.amount != null ? [{ label: 'Amount', value: `$${p.submission.amount.toLocaleString('en-US')}` }] : [],
    },
    { kind: 'next_follow_up', label: 'Follow-up', date: p.intelligence.nextFollowUpDate },
    { kind: 'expected_award', label: 'Expected award', date: p.intelligence.expectedAwardDate },
    { kind: 'awarded', label: 'Awarded', date: p.award.awardDate },
    { kind: 'project_start', label: 'Project start', date: p.schedule.expectedStart },
    { kind: 'project_completion', label: 'Project completion', date: p.schedule.expectedCompletion },
  ];
  for (const [key, label] of Object.entries(SALES_LABELS)) {
    out.push({ kind: `sales_${key}`, label, date: (p.salesActivities as Record<string, string | null>)?.[key] ?? null });
  }
  for (const a of p.amendments ?? []) {
    out.push({
      kind: 'addendum',
      label: `Addendum #${a.number}`,
      date: a.date,
      details: a.notes ? [{ label: 'Notes', value: a.notes }] : [],
    });
  }
  for (const v of p.proposalVersions ?? []) {
    out.push({
      kind: 'proposal_version',
      label: `Proposal v${v.version}`,
      date: v.date,
      details: v.amount != null ? [{ label: 'Amount', value: `$${v.amount.toLocaleString('en-US')}` }] : [],
    });
  }
  for (const c of p.intelligence.followUpCalls ?? []) {
    for (const call of c.callAttempts ?? []) {
      out.push({
        kind: 'follow_up_call',
        label: `Follow-up call${c.companyName ? ` — ${c.companyName}` : ''}`,
        date: call.dateOfCall,
        details: [
          ...(c.contactName ? [{ label: 'Contact', value: c.contactName }] : []),
          ...(c.phone ? [{ label: 'Phone', value: c.phone }] : []),
          ...(call.remarks ? [{ label: 'Remarks', value: call.remarks }] : []),
        ],
      });
    }
  }
  for (const t of p.takeoffAssignments ?? []) {
    if (!isMe(t.assigneeName)) continue;
    const details = [
      { label: 'Scope', value: t.role },
      ...(t.status ? [{ label: 'Status', value: t.status }] : []),
      ...(t.hoursSpent != null ? [{ label: 'Hours logged', value: String(t.hoursSpent) }] : []),
      ...(t.notes ? [{ label: 'Notes', value: t.notes }] : []),
    ];
    out.push({ kind: 'takeoff_assigned', label: `Takeoff assigned (${t.role})`, date: t.assignedAt, source: 'takeoff', details });
    out.push({ kind: 'takeoff_due', label: `Takeoff due (${t.role})`, date: t.dueAt, time: timeOf(t.dueAt), source: 'takeoff', details });
  }
  return out.filter((e) => ymd(e.date));
}

/** `2026-09-24T14:30…` → `14:30`; plain dates → null. */
function timeOf(v: string | null): string | null {
  const m = /T(\d{2}:\d{2})/.exec(String(v ?? ''));
  return m && m[1] !== '00:00' ? m[1] : null;
}

export function bidInfo(bid: BidRowForCalendar, roles: string[]): CalendarBidInfo {
  return {
    id: bid.id,
    estimateNumber: bid.estimateNumber,
    bidName: bid.bidName,
    clientCompanyName: bid.clientCompanyName,
    processStage: bid.processStage,
    outcomeStatus: bid.outcomeStatus,
    dueDate: ymd(bid.process.dueDate ?? bid.bidDate),
    dueTime: hm(bid.process.dueTime),
    teamName: bid.teamName,
    captain: bid.process.assignment.captain,
    roles,
  };
}

/**
 * Bid milestones as calendar items. Dates with a time become timed items;
 * the time is the bid's local wall-clock time, so it's returned without a zone
 * (`2026-09-24T14:00`) and the browser shows it as-is.
 */
export function bidCalendarItems(bid: BidRowForCalendar, person: PersonRef, range: { from: string; to: string }): CalendarItem[] {
  const isMe = personNameMatcher(person);
  const roles = bidRolesFor(person, bid, isMe);
  if (!roles.length) return [];
  const info = bidInfo(bid, roles);
  const label = bid.bidName ? `${bid.estimateNumber} · ${bid.bidName}` : bid.estimateNumber;
  const seen = new Set<string>();
  const items: CalendarItem[] = [];
  for (const e of bidDateEvents(bid, person, isMe)) {
    const date = ymd(e.date)!;
    if (date < range.from || date > range.to) continue;
    const time = hm(e.time);
    const id = `bid:${bid.id}:${e.kind}:${date}:${e.label}`;
    if (seen.has(id)) continue;
    seen.add(id);
    items.push({
      id,
      source: e.source ?? 'bid',
      kind: e.kind,
      title: `${e.label} — ${label}`,
      start: time ? `${date}T${time}` : date,
      end: null,
      allDay: !time,
      description: null,
      location: null,
      bid: info,
      details: e.details ?? [],
      editable: false,
    });
  }
  return items;
}

/** `YYYY-MM-DD` plus/minus days, in UTC. */
export function shiftYmd(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Validates `from`/`to` query params. Max ~13 months so month/agenda views stay cheap. */
export function parseRange(from: unknown, to: unknown): { from: string; to: string } | null {
  const f = ymd(from);
  const t = ymd(to);
  if (!f || !t || f !== String(from).trim() || t !== String(to).trim() || t < f) return null;
  const days = (Date.parse(`${t}T00:00:00Z`) - Date.parse(`${f}T00:00:00Z`)) / 86400_000;
  return days <= 400 ? { from: f, to: t } : null;
}

/** Numbers stored as JSON arrays (`[1,2]`) in Connecteam mirror rows. */
export function jsonIds(raw: string | null | undefined): number[] {
  try {
    const v = JSON.parse(raw ?? '[]');
    return Array.isArray(v) ? v.map(Number).filter((n) => Number.isFinite(n) && n > 0) : [];
  } catch {
    return [];
  }
}

export function unixToIso(v: unknown): string | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toISOString() : null;
}

/** Sort: by start, all-day first on the same day, then title. */
export function sortItems(items: CalendarItem[]): CalendarItem[] {
  return items.sort((a, b) => {
    const da = a.start.slice(0, 10);
    const db = b.start.slice(0, 10);
    if (da !== db) return da.localeCompare(db);
    if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
    return a.start.localeCompare(b.start) || a.title.localeCompare(b.title);
  });
}
