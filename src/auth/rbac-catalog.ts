/** Canonical Goel login roles + permission keys. Seeded into App_Roles / App_Permissions. */

export const APP_ROLE_IDS = [
  'super_admin',
  'admin',
  'bid_clerk',
  'captain',
  'assistant_estimator',
  'project_manager',
  'operations_manager',
  'user',
] as const;
export type AppRoleId = (typeof APP_ROLE_IDS)[number];

/** Shown on the access-control matrix (super_admin is always all keys). */
export const MATRIX_ROLE_IDS = APP_ROLE_IDS.filter((id) => id !== 'super_admin');

export const ROLE_META: Record<AppRoleId, { label: string; note: string; locked?: boolean }> = {
  super_admin: { label: 'Super admin', note: 'Nick, PJ — everything', locked: true },
  admin: { label: 'Admin', note: 'IT — users & settings' },
  bid_clerk: { label: 'Bid clerk', note: 'Intake only' },
  captain: { label: 'Captain', note: 'Team lead, spec bless, takeoff assign' },
  assistant_estimator: { label: 'Assistant estimator', note: 'Setup, wage, spec draft' },
  project_manager: { label: 'Project manager', note: 'Awarded jobs, Siteline' },
  operations_manager: { label: 'Operations manager', note: 'Awarded job ops' },
  user: { label: 'Legacy user', note: 'Old App_Users.Role=user — treat like assistant estimator' },
};

export type PermissionDef = { key: string; label: string; description: string; group: string };

export const PERMISSION_CATALOG: PermissionDef[] = [
  { key: 'bidding:read', label: 'Bidding — view', description: 'List and open bids', group: 'Bidding' },
  { key: 'bidding:write', label: 'Bidding — edit', description: 'Create / PATCH bids, spec sheet, intake', group: 'Bidding' },
  { key: 'bidding:summary', label: 'Bidding — totals', description: 'MIKE / PJ $ on the results rail', group: 'Bidding' },
  { key: 'tickets:read', label: 'Tickets — view', description: 'Ticket grids and detail', group: 'Trucking' },
  { key: 'tickets:export', label: 'Tickets — export', description: 'Export to Excel', group: 'Trucking' },
  { key: 'job_dashboard:read', label: 'Job dashboard', description: 'Job dashboard tab', group: 'Trucking' },
  { key: 'material_dashboard:read', label: 'Material dashboard', description: 'Material dashboard tab', group: 'Trucking' },
  { key: 'hauler_dashboard:read', label: 'Hauler dashboard', description: 'Hauler dashboard tab', group: 'Trucking' },
  { key: 'forensic:read', label: 'Forensic', description: 'Late submission / efficiency', group: 'Trucking' },
  { key: 'siteline:read', label: 'Siteline', description: 'Billing, aging, pay apps', group: 'Jobs' },
  { key: 'clearstory:read', label: 'Clearstory', description: 'CORs and contract comparison', group: 'Jobs' },
  { key: 'trimble:read', label: 'Trimble', description: 'Line items / company items', group: 'Jobs' },
  { key: 'connecteam:read', label: 'Workforce — view', description: 'Hours, roster, schedule', group: 'Workforce' },
  { key: 'connecteam:write', label: 'Workforce — write', description: 'Clock, PTO, chat writes', group: 'Workforce' },
  { key: 'admin:users', label: 'Admin — users', description: 'Approve, reject, change role/status', group: 'Admin' },
  { key: 'admin:create_user', label: 'Admin — create user', description: 'Create accounts', group: 'Admin' },
  { key: 'admin:rbac', label: 'Admin — access control', description: 'Edit the role × permission matrix', group: 'Admin' },
];

export const PERMISSION_KEYS = PERMISSION_CATALOG.map((p) => p.key);

const ALL = PERMISSION_KEYS;

/** First-time seed only (empty role). super_admin is always ALL at runtime. */
export const DEFAULT_PERMISSIONS_BY_ROLE: Record<AppRoleId, string[]> = {
  super_admin: ALL,
  /** Runtime JWT is also ALL (see RbacService.getPermissionNamesForRole). */
  admin: ALL,
  bid_clerk: ['bidding:read', 'bidding:write'],
  captain: ['bidding:read', 'bidding:write', 'bidding:summary', 'trimble:read'],
  assistant_estimator: ['bidding:read', 'bidding:write', 'bidding:summary', 'trimble:read'],
  project_manager: ['bidding:read', 'siteline:read', 'clearstory:read'],
  operations_manager: ['siteline:read', 'clearstory:read', 'connecteam:read', 'connecteam:write'],
  user: ['bidding:read', 'bidding:write', 'bidding:summary', 'tickets:read', 'tickets:export', 'job_dashboard:read', 'material_dashboard:read', 'hauler_dashboard:read', 'forensic:read'],
};

export function isAppRoleId(raw: string): raw is AppRoleId {
  return (APP_ROLE_IDS as readonly string[]).includes(raw);
}

export function isAdminPanelRole(role: string): boolean {
  return role === 'super_admin' || role === 'admin';
}
