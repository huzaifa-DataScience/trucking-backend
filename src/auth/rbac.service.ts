import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AppRole, AppSetting, Permission } from '../database/entities';
import {
  APP_ROLE_IDS,
  DEFAULT_PERMISSIONS_BY_ROLE,
  PERMISSION_CATALOG,
  PERMISSION_KEYS,
  ROLE_META,
  isAppRoleId,
  type AppRoleId,
} from './rbac-catalog';

const DEFAULT_ROLE_SETTING = 'rbac_default_role';

@Injectable()
export class RbacService implements OnModuleInit {
  private seedPromise: Promise<void> | null = null;

  constructor(
    @InjectRepository(AppRole)
    private readonly roleRepo: Repository<AppRole>,
    @InjectRepository(Permission)
    private readonly permRepo: Repository<Permission>,
    @InjectRepository(AppSetting)
    private readonly settings: Repository<AppSetting>,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.ensureSeed();
    } catch (e) {
      console.error('[RbacService] seed skipped:', e);
    }
  }

  async ensureSeed(): Promise<void> {
    if (!this.seedPromise) this.seedPromise = this.seedOnce();
    return this.seedPromise;
  }

  private async seedOnce(): Promise<void> {
    await this.roleRepo.query(`
      IF OBJECT_ID('dbo.App_Roles', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.App_Roles (
          Id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
          Name NVARCHAR(50) NOT NULL UNIQUE,
          Description NVARCHAR(255) NULL
        );
      END
      IF OBJECT_ID('dbo.App_Permissions', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.App_Permissions (
          Id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
          Name NVARCHAR(100) NOT NULL UNIQUE,
          Description NVARCHAR(255) NULL
        );
      END
      IF OBJECT_ID('dbo.App_RolePermissions', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.App_RolePermissions (
          RoleId INT NOT NULL,
          PermissionId INT NOT NULL,
          PRIMARY KEY (RoleId, PermissionId),
          FOREIGN KEY (RoleId) REFERENCES dbo.App_Roles(Id) ON DELETE CASCADE,
          FOREIGN KEY (PermissionId) REFERENCES dbo.App_Permissions(Id) ON DELETE CASCADE
        );
      END
      IF OBJECT_ID('dbo.App_Settings', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.App_Settings (
          SettingKey nvarchar(100) NOT NULL PRIMARY KEY,
          SettingValue nvarchar(200) NOT NULL,
          UpdatedAt datetime2 NOT NULL CONSTRAINT DF_App_Settings_UpdatedAt DEFAULT SYSUTCDATETIME()
        );
      END
    `);

    for (const id of APP_ROLE_IDS) {
      const exists = await this.roleRepo.findOne({ where: { name: id } });
      if (!exists) {
        await this.roleRepo.save(
          this.roleRepo.create({ name: id, description: ROLE_META[id].note }),
        );
      }
    }
    for (const p of PERMISSION_CATALOG) {
      const exists = await this.permRepo.findOne({ where: { name: p.key } });
      if (!exists) {
        await this.permRepo.save(
          this.permRepo.create({ name: p.key, description: p.description }),
        );
      }
    }

    const allPerms = await this.permRepo.find();
    const byName = new Map(allPerms.map((p) => [p.name, p]));
    for (const id of APP_ROLE_IDS) {
      const role = await this.roleRepo.findOne({
        where: { name: id },
        relations: ['permissions'],
      });
      if (!role) continue;
      if (id === 'super_admin' || !role.permissions?.length) {
        const keys = DEFAULT_PERMISSIONS_BY_ROLE[id];
        role.permissions = keys.map((k) => byName.get(k)).filter((p): p is Permission => !!p);
        await this.roleRepo.save(role);
      }
    }
  }

  async getPermissionNamesForRole(roleName: string): Promise<string[]> {
    await this.ensureSeed();
    // IT admin + Nick/PJ: full chrome. Matrix still edits other roles.
    if (roleName === 'super_admin' || roleName === 'admin') return [...PERMISSION_KEYS];
    const role = await this.roleRepo.findOne({
      where: { name: roleName },
      relations: ['permissions'],
    });
    if (!role?.permissions?.length) return [];
    return role.permissions.map((p) => p.name);
  }

  async permissionsByRole(): Promise<Record<string, string[]>> {
    await this.ensureSeed();
    const roles = await this.roleRepo.find({ relations: ['permissions'] });
    const out: Record<string, string[]> = {};
    for (const r of roles) {
      out[r.name] =
        r.name === 'super_admin' || r.name === 'admin'
          ? [...PERMISSION_KEYS]
          : (r.permissions ?? []).map((p) => p.name);
    }
    return out;
  }

  catalog() {
    return {
      roles: APP_ROLE_IDS.map((id) => ({
        id,
        label: ROLE_META[id].label,
        note: ROLE_META[id].note,
        locked: !!ROLE_META[id].locked,
      })),
      permissions: PERMISSION_CATALOG,
    };
  }

  async getMatrix() {
    const byRole = await this.permissionsByRole();
    const matrix: Record<string, string[]> = {};
    for (const id of APP_ROLE_IDS) matrix[id] = byRole[id] ?? [];
    return {
      ...this.catalog(),
      matrix,
      defaults: await this.getUserDefaults(),
    };
  }

  async setRolePermissions(roleName: string, keys: string[]): Promise<string[]> {
    await this.ensureSeed();
    if (!isAppRoleId(roleName)) throw new BadRequestException(`Unknown role: ${roleName}`);
    if (roleName === 'super_admin') {
      throw new BadRequestException('super_admin always has every permission');
    }
    const uniq = [...new Set(keys)];
    const unknown = uniq.filter((k) => !PERMISSION_KEYS.includes(k));
    if (unknown.length) throw new BadRequestException(`Unknown permissions: ${unknown.join(', ')}`);
    const role = await this.roleRepo.findOne({
      where: { name: roleName },
      relations: ['permissions'],
    });
    if (!role) throw new BadRequestException(`Role not in database: ${roleName}`);
    const perms = uniq.length ? await this.permRepo.find({ where: { name: In(uniq) } }) : [];
    role.permissions = perms;
    await this.roleRepo.save(role);
    return perms.map((p) => p.name);
  }

  async getUserDefaults(): Promise<{ role: AppRoleId; permissions: string[] }> {
    await this.ensureSeed();
    const row = await this.settings.findOne({ where: { settingKey: DEFAULT_ROLE_SETTING } });
    const role: AppRoleId = isAppRoleId(row?.settingValue ?? '')
      ? (row!.settingValue as AppRoleId)
      : 'user';
    return { role, permissions: await this.getPermissionNamesForRole(role) };
  }

  async setUserDefaults(input: { role?: string; permissions?: string[] }) {
    await this.ensureSeed();
    if (input.permissions) {
      throw new BadRequestException(
        'Permissions are per role. Set the default role here, then PATCH /admin/rbac/roles/:name',
      );
    }
    if (input.role) {
      if (!isAppRoleId(input.role) || input.role === 'super_admin') {
        throw new BadRequestException('Invalid default role');
      }
      await this.upsertSetting(DEFAULT_ROLE_SETTING, input.role);
    }
    return this.getUserDefaults();
  }

  private async upsertSetting(key: string, value: string): Promise<void> {
    const existing = await this.settings.findOne({ where: { settingKey: key } });
    if (existing) {
      existing.settingValue = value;
      existing.updatedAt = new Date();
      await this.settings.save(existing);
      return;
    }
    await this.settings.save(
      this.settings.create({ settingKey: key, settingValue: value, updatedAt: new Date() }),
    );
  }
}
