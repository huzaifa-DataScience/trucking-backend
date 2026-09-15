/**
 * Role home (`GET /bids/my-plate`): due / upcoming / assigned for this login.
 * Company-wide list stays on `GET /bids`. Edit is still team-assigned (`canEdit`).
 */
import { APP_ROLE_IDS, isAdminPanelRole, type AppRoleId } from '../../auth/rbac-catalog';

export const NEW_BID_DAYS = 7;
export const UPCOMING_DAYS = 7;

export type PlateColumn = { key: string; label: string };

export type BidEditor = { id?: number; role: string; bidTeamId?: number | null };

export type PlateGroupId = 'due' | 'upcoming' | 'assigned';

export type PlateRowBase = {
  processStage: string;
  outcomeStatus?: string | null;
  status?: string | null;
  dueDate?: string | null;
  teamId?: number | null;
  isNew?: boolean;
};

const COLS: PlateColumn[] = [
  { key: 'estimateNumber', label: 'Bid #' },
  { key: 'bidName', label: 'Project' },
  { key: 'dueDate', label: 'Due date' },
  { key: 'dueTime', label: 'Due time' },
  { key: 'teamId', label: 'Team' },
  { key: 'processStage', label: 'Stage' },
  { key: 'isNew', label: 'New' },
  { key: 'canEdit', label: 'Edit' },
];

const CAPTAIN_ASSIGNED_COLS: PlateColumn[] = [
  ...COLS,
  { key: 'takeoffAssigned', label: 'Takeoff sent' },
  { key: 'takeoffReceived', label: 'Takeoff back' },
];

const ESTIMATING_STAGES = new Set(['estimating_setup', 'takeoff', 'proposal']);
const AE_STAGES = new Set(['estimating_setup', 'takeoff']);

type RolePlateDef = {
  plateId: string;
  title: string;
  hint: string;
  assignedTitle: string;
  assignedCols: PlateColumn[];
};

const ROLE_PLATES: Record<AppRoleId, RolePlateDef> = {
  super_admin: {
    plateId: 'admin',
    title: 'Admin dashboard',
    hint: 'Every bid. Due / upcoming from the full list; All bids is the company list.',
    assignedTitle: 'All bids',
    assignedCols: COLS,
  },
  admin: {
    plateId: 'admin',
    title: 'Admin dashboard',
    hint: 'Every bid. Due / upcoming from the full list; All bids is the company list.',
    assignedTitle: 'All bids',
    assignedCols: COLS,
  },
  bid_clerk: {
    plateId: 'clerk',
    title: 'Intake dashboard',
    hint: 'Your intake queue — due, coming due, and everything still in Intake.',
    assignedTitle: 'Assigned',
    assignedCols: COLS,
  },
  captain: {
    plateId: 'captain',
    title: 'Captain dashboard',
    hint: 'Your team’s setup / takeoff / proposal. Takeoff sent vs back is on Assigned.',
    assignedTitle: 'Assigned',
    assignedCols: CAPTAIN_ASSIGNED_COLS,
  },
  assistant_estimator: {
    plateId: 'estimator',
    title: 'Estimator dashboard',
    hint: 'Your team’s setup and takeoff — due this week, upcoming, and assigned to the team.',
    assignedTitle: 'Assigned',
    assignedCols: COLS,
  },
  project_manager: {
    plateId: 'pm',
    title: 'PM dashboard',
    hint: 'Awarded jobs on your plate — due dates, upcoming, and the awarded list.',
    assignedTitle: 'Assigned',
    assignedCols: COLS,
  },
  operations_manager: {
    plateId: 'ops',
    title: 'Ops dashboard',
    hint: 'Awarded jobs after the bid — due, upcoming, and assigned awarded work.',
    assignedTitle: 'Assigned',
    assignedCols: COLS,
  },
  user: {
    plateId: 'estimator',
    title: 'Estimator dashboard',
    hint: 'Same as assistant estimator — team setup and takeoff.',
    assignedTitle: 'Assigned',
    assignedCols: COLS,
  },
};

function plateKey(role: string): AppRoleId {
  if (role === 'user') return 'user';
  if ((APP_ROLE_IDS as readonly string[]).includes(role)) return role as AppRoleId;
  return 'assistant_estimator';
}

/** Scope used for due / upcoming vs assigned (admin calendar is company-wide). */
function inAssignedUniverse(role: string, row: PlateRowBase, bidTeamId: number | null): boolean {
  const key = plateKey(role);
  if (isAdminPanelRole(key)) return true;
  if (!isActiveBid(row)) return false;
  if (key === 'bid_clerk') return isOpenOutcome(row) && row.processStage === 'intake';
  if (key === 'captain') {
    return isOpenOutcome(row) && ESTIMATING_STAGES.has(row.processStage) && onMyTeam(row, bidTeamId);
  }
  if (key === 'assistant_estimator' || key === 'user') {
    return isOpenOutcome(row) && AE_STAGES.has(row.processStage) && onMyTeam(row, bidTeamId);
  }
  if (key === 'project_manager' || key === 'operations_manager') {
    return (row.outcomeStatus ?? '') === 'awarded';
  }
  return false;
}

function inCalendarUniverse(role: string, row: PlateRowBase, bidTeamId: number | null): boolean {
  const key = plateKey(role);
  if (isAdminPanelRole(key)) return true;
  if (!isActiveBid(row)) return false;
  return inAssignedUniverse(role, row, bidTeamId);
}

function isActiveBid(row: PlateRowBase): boolean {
  return (row.status ?? 'draft') !== 'archived';
}

function isOpenOutcome(row: PlateRowBase): boolean {
  return (row.outcomeStatus ?? 'open') === 'open';
}

/** No team on the user → show the role’s stages (empty plate is worse). Team set → that crew only. */
function onMyTeam(row: PlateRowBase, bidTeamId: number | null): boolean {
  if (bidTeamId == null) return true;
  return row.teamId === bidTeamId;
}

export function todayYmd(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  dt.setDate(dt.getDate() + days);
  return todayYmd(dt);
}

export type DueBucket = 'overdue' | 'due' | 'upcoming' | 'later' | 'none';

export function dueBucket(dueDate: string | null | undefined, today: string): DueBucket {
  const d = (dueDate ?? '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return 'none';
  if (d < today) return 'overdue';
  if (d === today) return 'due';
  if (d <= addDaysYmd(today, UPCOMING_DAYS)) return 'upcoming';
  return 'later';
}

function byDueThenId<T extends PlateRowBase>(a: T, b: T): number {
  const da = (a.dueDate ?? '').slice(0, 10);
  const db = (b.dueDate ?? '').slice(0, 10);
  if (da && db && da !== db) return da < db ? -1 : 1;
  if (da && !db) return -1;
  if (!da && db) return 1;
  return 0;
}

/** No team on the bid yet → anyone may edit (intake). After assign → that team + admins. */
export function canEditBid(editor: BidEditor, bidTeamId: number | null): boolean {
  if (isAdminPanelRole(editor.role)) return true;
  if (bidTeamId == null) return true;
  return editor.bidTeamId != null && editor.bidTeamId === bidTeamId;
}

export function plateForRole(role: string) {
  const key = plateKey(role);
  const def = ROLE_PLATES[key];
  return {
    role,
    plateId: def.plateId,
    title: def.title,
    hint: def.hint,
    groups: [
      { id: 'due' as const, title: 'Due', columns: COLS },
      { id: 'upcoming' as const, title: 'Upcoming', columns: COLS },
      { id: 'assigned' as const, title: def.assignedTitle, columns: def.assignedCols },
    ],
  };
}

export function dashboardPlatesMeta() {
  return APP_ROLE_IDS.map((role) => plateForRole(role));
}

export function fillPlateGroups<T extends PlateRowBase>(
  role: string,
  rows: T[],
  opts: { bidTeamId?: number | null; now?: Date } = {},
): Array<{ id: PlateGroupId; title: string; columns: PlateColumn[]; rows: T[] }> {
  const plate = plateForRole(role);
  const bidTeamId = opts.bidTeamId ?? null;
  const today = todayYmd(opts.now ?? new Date());
  const calendar = rows.filter((r) => inCalendarUniverse(role, r, bidTeamId));
  const assigned = rows.filter((r) => inAssignedUniverse(role, r, bidTeamId)).sort(byDueThenId);
  const due = calendar
    .filter((r) => {
      const b = dueBucket(r.dueDate, today);
      return b === 'due' || b === 'overdue';
    })
    .sort(byDueThenId);
  const upcoming = calendar.filter((r) => dueBucket(r.dueDate, today) === 'upcoming').sort(byDueThenId);
  const byId: Record<PlateGroupId, T[]> = { due, upcoming, assigned };
  return plate.groups.map((g) => ({ ...g, rows: byId[g.id] }));
}

export function isNewBid(
  updatedAt: string | null | undefined,
  createdAt: string | null | undefined,
  now = new Date(),
): boolean {
  const raw = updatedAt || createdAt;
  if (!raw) return false;
  const t = new Date(raw).getTime();
  if (Number.isNaN(t)) return false;
  return now.getTime() - t <= NEW_BID_DAYS * 86_400_000;
}

export type DashboardMessage = {
  conversationId: string;
  title: string | null;
  type: string | null;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  lastMessageSenderName: string | null;
  unreadCount: number;
};

export type DashboardNotification = {
  kind: 'message' | 'due' | 'new_bid' | 'comment_mention';
  title: string;
  body: string | null;
  bidId?: string;
  commentId?: number;
  conversationId?: string;
  at?: string | null;
};

export function dashboardNotifications<
  T extends PlateRowBase & { id?: string; estimateNumber?: string | null; bidName?: string | null },
>(
  groups: Array<{ id: PlateGroupId; rows: T[] }>,
  messages: DashboardMessage[],
): DashboardNotification[] {
  const out: DashboardNotification[] = [];
  for (const m of messages) {
    if (!(m.unreadCount > 0)) continue;
    out.push({
      kind: 'message',
      title: m.title?.trim() || 'Message',
      body: m.lastMessagePreview,
      conversationId: m.conversationId,
      at: m.lastMessageAt,
    });
  }
  const due = groups.find((g) => g.id === 'due')?.rows ?? [];
  for (const r of due) {
    out.push({
      kind: 'due',
      title: r.bidName?.trim() || r.estimateNumber || 'Bid due',
      body: r.dueDate ? `Due ${r.dueDate}` : 'Due',
      bidId: r.id,
      at: r.dueDate,
    });
  }
  const assigned = groups.find((g) => g.id === 'assigned')?.rows ?? [];
  for (const r of assigned) {
    if (!r.isNew) continue;
    if (due.some((d) => d.id && d.id === r.id)) continue;
    out.push({
      kind: 'new_bid',
      title: r.bidName?.trim() || r.estimateNumber || 'New bid',
      body: 'Updated in the last 7 days',
      bidId: r.id,
    });
  }
  return out.slice(0, 15);
}

/** Mirrors `STAGE_LABELS` in bid-process — kept here to avoid a circular import. */
const EXCEL_STAGE_LABELS: Record<string, string> = {
  intake: 'Bid Intake',
  assignment: 'Bid Assignment',
  estimating_setup: 'Estimating Setup',
  takeoff: 'Takeoff & Estimate',
  proposal: 'Bid Review & Proposal',
  post_bid: 'Post-Bid / Intelligence',
  result: 'Outcome',
};

export const BID_LIST_EXCEL_COLUMNS: { header: string; key: string; width: number }[] = [
  { header: 'Bid #', key: 'estimateNumber', width: 14 },
  { header: 'Project', key: 'bidName', width: 32 },
  { header: 'Our company', key: 'companyName', width: 22 },
  { header: 'Client', key: 'clientCompanyName', width: 24 },
  { header: 'Due date', key: 'dueDate', width: 12 },
  { header: 'Due time', key: 'dueTime', width: 10 },
  { header: 'Team', key: 'teamName', width: 16 },
  { header: 'Stage', key: 'stage', width: 24 },
  { header: 'Outcome', key: 'outcomeStatus', width: 12 },
  { header: 'Status', key: 'status', width: 12 },
  { header: 'Work type', key: 'workType', width: 14 },
  { header: 'Bid kind', key: 'bidKind', width: 12 },
  { header: 'Owner #', key: 'ownerProjectNumber', width: 14 },
  { header: 'ME #', key: 'mechanicalEngineerProjectNumber', width: 14 },
  { header: 'New', key: 'isNew', width: 8 },
];

export type BidListExcelSource = {
  estimateNumber?: string | null;
  bidName?: string | null;
  companyName?: string | null;
  clientCompanyName?: string | null;
  dueDate?: string | null;
  dueTime?: string | null;
  teamId?: number | null;
  processStage?: string | null;
  outcomeStatus?: string | null;
  status?: string | null;
  workType?: string | null;
  bidKind?: string | null;
  ownerProjectNumber?: string | null;
  mechanicalEngineerProjectNumber?: string | null;
  isNew?: boolean;
};

export function bidListExcelRow(
  row: BidListExcelSource,
  teamName: string | null,
): Record<string, string> {
  const stage = row.processStage ?? '';
  return {
    estimateNumber: row.estimateNumber ?? '',
    bidName: row.bidName ?? '',
    companyName: row.companyName ?? '',
    clientCompanyName: row.clientCompanyName ?? '',
    dueDate: row.dueDate ?? '',
    dueTime: row.dueTime ?? '',
    teamName: teamName ?? '',
    stage: EXCEL_STAGE_LABELS[stage] ?? stage,
    outcomeStatus: row.outcomeStatus ?? '',
    status: row.status ?? '',
    workType: row.workType ?? '',
    bidKind: row.bidKind ?? '',
    ownerProjectNumber: row.ownerProjectNumber ?? '',
    mechanicalEngineerProjectNumber: row.mechanicalEngineerProjectNumber ?? '',
    isNew: row.isNew ? 'Yes' : '',
  };
}
