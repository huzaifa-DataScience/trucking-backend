/**
 * Self-check: role × permission catalog. No DB.
 * Usage: npx ts-node scripts/check-rbac-catalog.ts
 */
import {
  APP_ROLE_IDS,
  DEFAULT_PERMISSIONS_BY_ROLE,
  MATRIX_ROLE_IDS,
  PERMISSION_CATALOG,
  PERMISSION_KEYS,
  ROLE_META,
  SUPER_ADMIN_ONLY_KEYS,
  hardcodedPermissionsForRole,
  isAppRoleId,
} from '../src/auth/rbac-catalog';

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

assert(APP_ROLE_IDS.includes('super_admin'), 'super_admin role');
assert(ROLE_META.super_admin.locked === true, 'super_admin locked');
assert(MATRIX_ROLE_IDS.length === APP_ROLE_IDS.length - 1, 'matrix hides super_admin');
assert(new Set(PERMISSION_KEYS).size === PERMISSION_KEYS.length, 'unique permission keys');
assert(PERMISSION_CATALOG.every((p) => p.key && p.label && p.group), 'catalog fields');

for (const id of APP_ROLE_IDS) {
  assert(isAppRoleId(id), id);
  const keys = DEFAULT_PERMISSIONS_BY_ROLE[id];
  assert(Array.isArray(keys) && keys.length, `${id} has defaults`);
  for (const k of keys) {
    assert(PERMISSION_KEYS.includes(k), `${id} unknown perm ${k}`);
  }
}

assert(
  DEFAULT_PERMISSIONS_BY_ROLE.super_admin.length === PERMISSION_KEYS.length,
  'super_admin has every key',
);
assert(
  DEFAULT_PERMISSIONS_BY_ROLE.bid_clerk.includes('bidding:write') &&
    !DEFAULT_PERMISSIONS_BY_ROLE.bid_clerk.includes('bidding:summary'),
  'clerk has write, no summary',
);
assert(
  DEFAULT_PERMISSIONS_BY_ROLE.admin.includes('admin:rbac') &&
    !DEFAULT_PERMISSIONS_BY_ROLE.admin.some((k) => SUPER_ADMIN_ONLY_KEYS.includes(k)),
  'IT admin has every key except WFS',
);
assert(hardcodedPermissionsForRole('admin')?.includes('wfs:read') !== true, 'admin JWT has no WFS');
assert(hardcodedPermissionsForRole('super_admin')?.includes('wfs:read') === true, 'super_admin JWT has WFS');
assert(PERMISSION_CATALOG.filter((p) => p.locked).every((p) => p.key.startsWith('wfs:')), 'only WFS rows locked');

console.log('check-rbac-catalog: ok', APP_ROLE_IDS.length, 'roles', PERMISSION_KEYS.length, 'permissions');
