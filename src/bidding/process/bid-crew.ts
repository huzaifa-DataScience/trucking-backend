/**
 * Captain ↔ team on Bid Assignment.
 * Pick a captain → that captain's BidTeamId fills assignment.teamId.
 * Pick a team only → fill captain from the login captain on that crew.
 */

export type CrewCaptain = {
  userId: number;
  name: string;
  email: string | null;
  teamId: number | null;
};

export type CrewTeam = {
  id: number;
  captain: string | null;
  bidClerk: string | null;
  captainUserId: number | null;
};

export type AssignmentCrew = {
  pursue: boolean | null;
  priority: string | null;
  teamId: number | null;
  captainUserId: number | null;
  captain: string | null;
  assistantEstimator: string | null;
  bidClerk: string | null;
  internalEstimateDue: string | null;
  internalReviewDue: string | null;
};

function norm(v: unknown): string {
  return String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Connecteam / seed roster name → lookup key. */
export function crewNameKey(name: unknown): string {
  return norm(name);
}

export function indexPeopleByName<T extends { firstName?: string | null; lastName?: string | null; email?: string | null; name?: string | null }>(
  rows: T[],
): Map<string, T> {
  const map = new Map<string, T>();
  const add = (k: string, row: T) => {
    if (k && !map.has(k)) map.set(k, row);
  };
  for (const row of rows) {
    const first = String(row.firstName ?? '').trim();
    const last = String(row.lastName ?? '').trim();
    const full = [first, last].filter(Boolean).join(' ') || String(row.name ?? '').trim();
    add(crewNameKey(full), row);
    if (first && last) {
      add(crewNameKey(`${first.split(/\s+/)[0]} ${last}`), row);
    }
    if (row.email) add(crewNameKey(row.email), row);
  }
  return map;
}

/** Excel Team_list typos / aliases → Connecteam spelling. */
export const CREW_NAME_ALIASES: Record<string, string> = {
  'mike robberts': 'mike roberts',
  'bil palomino': 'bil shams',
};

export function lookupPersonByName<T>(map: Map<string, T>, name: unknown): T | undefined {
  const raw = crewNameKey(name);
  if (!raw) return undefined;
  const keys = [raw, CREW_NAME_ALIASES[raw]].filter((k): k is string => Boolean(k));
  for (const k of keys) {
    if (map.has(k)) return map.get(k);
    const parts = k.split(' ');
    if (parts.length >= 2) {
      const hit = map.get(crewNameKey(`${parts[0]} ${parts[parts.length - 1]}`));
      if (hit) return hit;
    }
  }
  return undefined;
}

export function bindAssignmentCrew(
  assignment: AssignmentCrew,
  captains: CrewCaptain[],
  teams: CrewTeam[],
): AssignmentCrew {
  const next = { ...assignment };
  const byUserId = new Map(captains.map((c) => [c.userId, c]));
  const byTeam = new Map<number, CrewCaptain>();
  for (const c of captains) {
    if (c.teamId != null && !byTeam.has(c.teamId)) byTeam.set(c.teamId, c);
  }

  if (next.captainUserId != null) {
    const cap = byUserId.get(next.captainUserId);
    if (cap) {
      next.captain = cap.name;
      if (cap.teamId != null) next.teamId = cap.teamId;
    }
    return fillFromTeam(next, teams, byTeam);
  }

  const captainNeedle = norm(next.captain);
  if (captainNeedle && next.teamId == null) {
    const cap =
      captains.find((c) => norm(c.name) === captainNeedle) ??
      captains.find((c) => c.email && norm(c.email) === captainNeedle);
    if (cap) {
      next.captainUserId = cap.userId;
      next.captain = cap.name;
      if (cap.teamId != null) next.teamId = cap.teamId;
    }
  }

  return fillFromTeam(next, teams, byTeam);
}

function fillFromTeam(
  next: AssignmentCrew,
  teams: CrewTeam[],
  byTeam: Map<number, CrewCaptain>,
): AssignmentCrew {
  if (next.teamId == null) return next;
  const team = teams.find((t) => t.id === next.teamId);
  const cap = byTeam.get(next.teamId);
  if (next.captainUserId == null && cap) next.captainUserId = cap.userId;
  if (!next.captain) next.captain = cap?.name ?? null;
  if (!next.bidClerk) next.bidClerk = team?.bidClerk ?? null;
  return next;
}

/** Captain Settings roster — pick people, not a pre-made Bid_Teams row. */
export const TEAM_CREW_SLOTS = [
  'bidClerk',
  'assistantManager',
  'duct1',
  'duct2',
  'hydronic1',
  'hydronic2',
  'plumbing1',
  'plumbing2',
] as const;
export type TeamCrewSlot = (typeof TEAM_CREW_SLOTS)[number];

export type TeamCrewPerson = {
  appUserId: number | null;
  connecteamUserId: number | null;
  name: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
};

export type TeamCrewSlots = Record<TeamCrewSlot, TeamCrewPerson | null> & {
  captain: TeamCrewPerson | null;
};

export function emptyCrewSlots(captain: TeamCrewPerson | null = null): TeamCrewSlots {
  return {
    captain,
    bidClerk: null,
    assistantManager: null,
    duct1: null,
    duct2: null,
    hydronic1: null,
    hydronic2: null,
    plumbing1: null,
    plumbing2: null,
  };
}

export function parseCrewJson(raw: string | null | undefined, captain: TeamCrewPerson | null): TeamCrewSlots {
  const next = emptyCrewSlots(captain);
  if (!raw) return next;
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    if (!captain && isCrewPerson(obj.captain)) next.captain = obj.captain;
    for (const slot of TEAM_CREW_SLOTS) {
      const v = obj[slot];
      next[slot] = isCrewPerson(v) ? v : null;
    }
  } catch {
    /* ponytail: bad JSON → empty slots, names still on Bid_Teams columns */
  }
  return next;
}

/** Excel `Team_list` roster — written to Bid_Teams then linked to Connecteam / App_Users. */
export type ExcelBidTeamSeed = { teamName: string; captain: string } & Record<TeamCrewSlot, string | null>;

export const EXCEL_BID_TEAMS: ExcelBidTeamSeed[] = [
  {
    teamName: 'Wilder Rodriguez',
    captain: 'Wilder Rodriguez',
    bidClerk: 'Hassan Riaz',
    assistantManager: null,
    duct1: 'John Carlo Orpilla',
    duct2: null,
    hydronic1: 'Jonathan Bruce',
    hydronic2: 'Brian Angelo Limon',
    plumbing1: 'Hennan Berberio',
    plumbing2: 'Mark Chua',
  },
  {
    teamName: 'Bil Shams',
    captain: 'Bil Shams',
    bidClerk: 'Mark Tan',
    assistantManager: null,
    duct1: 'Marc Maniago',
    duct2: 'Oliver Crucero',
    hydronic1: 'Maristella Malamug',
    hydronic2: 'Kevin Strauss',
    plumbing1: 'Ralph Resare',
    plumbing2: 'Hugh Belangel',
  },
  {
    teamName: 'Mike Robberts',
    captain: 'Mike Roberts',
    bidClerk: 'Rhal Dumol',
    assistantManager: null,
    duct1: 'Wesley Morris',
    duct2: 'Gerald Ordonez',
    hydronic1: 'Jeremee Camat',
    hydronic2: null,
    plumbing1: 'Joel Simplina',
    plumbing2: 'Junel Neri',
  },
];

export type BiddingContact = TeamCrewPerson & { role: string | null };

/** Excel Team_list people with the role they sat in (crew ≠ login captain). */
export function excelRosterContacts(): Array<{ name: string; role: string }> {
  const out: Array<{ name: string; role: string }> = [];
  for (const seed of EXCEL_BID_TEAMS) {
    out.push({ name: seed.captain, role: 'captain' });
    if (seed.bidClerk) out.push({ name: seed.bidClerk, role: 'bid_clerk' });
    for (const slot of TEAM_CREW_SLOTS) {
      if (slot === 'bidClerk' || !seed[slot]) continue;
      out.push({ name: seed[slot] as string, role: 'assistant_estimator' });
    }
  }
  return out;
}

/** App_Users + Connecteam + leftover Excel names, one row per person. */
export function mergeBiddingContacts(
  appUsers: Array<TeamCrewPerson & { role: string }>,
  connecteam: TeamCrewPerson[],
  roster: Array<{ name: string; role: string | null }>,
): BiddingContact[] {
  const rows: BiddingContact[] = [];
  const index = new Map<string, BiddingContact>();

  const keysOf = (p: BiddingContact) => {
    const keys: string[] = [];
    if (p.appUserId != null) keys.push(`a:${p.appUserId}`);
    if (p.connecteamUserId != null) keys.push(`c:${p.connecteamUserId}`);
    const email = crewNameKey(p.email);
    if (email) keys.push(`e:${email}`);
    const name = crewNameKey(p.name);
    if (name) keys.push(`n:${name}`);
    return keys;
  };

  const upsert = (incoming: BiddingContact) => {
    let hit: BiddingContact | undefined;
    for (const k of keysOf(incoming)) {
      hit = index.get(k);
      if (hit) break;
    }
    if (!hit) {
      rows.push(incoming);
      for (const k of keysOf(incoming)) index.set(k, incoming);
      return;
    }
    if (hit.appUserId == null) hit.appUserId = incoming.appUserId;
    if (hit.connecteamUserId == null) hit.connecteamUserId = incoming.connecteamUserId;
    if (!hit.email) hit.email = incoming.email;
    if (!hit.firstName) hit.firstName = incoming.firstName;
    if (!hit.lastName) hit.lastName = incoming.lastName;
    if (incoming.name && incoming.name.length > hit.name.length) hit.name = incoming.name;
    if (!hit.role && incoming.role) hit.role = incoming.role;
    for (const k of keysOf(hit)) index.set(k, hit);
  };

  for (const u of appUsers) upsert({ ...u, role: u.role });
  for (const c of connecteam) upsert({ ...c, role: null });
  for (const r of roster) {
    const name = r.name.trim();
    if (!name) continue;
    upsert({
      appUserId: null,
      connecteamUserId: null,
      name,
      email: null,
      firstName: null,
      lastName: null,
      role: r.role,
    });
  }

  rows.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  return rows;
}

function isCrewPerson(v: unknown): v is TeamCrewPerson {
  if (!v || typeof v !== 'object') return false;
  const o = v as TeamCrewPerson;
  return typeof o.name === 'string';
}

/** Captain / AE Estimates list — their crew. Admin / clerk stay unfiltered unless `?teamId=` is set. */
export const ESTIMATES_TEAM_ROLES = new Set(['captain', 'assistant_estimator', 'user']);

export function resolveEstimatesTeamId(opts: {
  queryTeamId?: number | 'all' | null;
  role?: string | null;
  userTeamId?: number | null;
}): number | null {
  if (opts.queryTeamId === 'all') return null;
  if (typeof opts.queryTeamId === 'number' && Number.isFinite(opts.queryTeamId)) {
    return opts.queryTeamId;
  }
  const mine = opts.userTeamId ?? null;
  if (mine != null && opts.role && ESTIMATES_TEAM_ROLES.has(opts.role)) return mine;
  return null;
}
