import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export enum Role {
  SuperAdmin = 'super_admin',
  Admin = 'admin',
  BidClerk = 'bid_clerk',
  Captain = 'captain',
  AssistantEstimator = 'assistant_estimator',
  ProjectManager = 'project_manager',
  OperationsManager = 'operations_manager',
  /** Legacy App_Users value — same seed as assistant estimator + trucking dashboards. */
  User = 'user',
}

export function isAdminPanelRole(role: string): boolean {
  return role === Role.SuperAdmin || role === Role.Admin;
}

export enum UserStatus {
  Pending = 'pending',    // New signup, awaiting admin approval
  Active = 'active',      // Approved and can login
  Inactive = 'inactive',  // Admin deactivated
  Rejected = 'rejected',  // Signup rejected by admin
}

@Entity('App_Users', { schema: 'dbo' })
export class User {
  @PrimaryGeneratedColumn({ name: 'Id' })
  id: number;

  @Column({ name: 'Email', type: 'nvarchar', length: 255, unique: true })
  email: string;

  @Column({ name: 'FirstName', type: 'nvarchar', length: 200, nullable: true })
  firstName: string | null;

  @Column({ name: 'LastName', type: 'nvarchar', length: 200, nullable: true })
  lastName: string | null;

  @Column({ name: 'PasswordHash', type: 'nvarchar', length: 255 })
  passwordHash: string;

  @Column({ name: 'Role', type: 'nvarchar', length: 50, default: Role.User })
  role: Role;

  /** Bidding crew — `Bid_Teams.TeamId`. Null = not on a team yet. */
  @Column({ name: 'BidTeamId', type: 'int', nullable: true })
  bidTeamId: number | null;

  @Column({ name: 'Status', type: 'nvarchar', length: 50, default: UserStatus.Pending })
  status: UserStatus;

  @CreateDateColumn({ name: 'CreatedAt' })
  createdAt: Date;

  @Column({ name: 'LastLoginAt', type: 'datetime2', nullable: true })
  lastLoginAt: Date | null;
}

export type UserNameBits = {
  id?: number;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
};

export function cleanPersonName(v: unknown): string | null {
  const t = String(v ?? '').trim();
  return t || null;
}

/** `First Last`, or null if both missing. */
export function userFullName(user: UserNameBits | null | undefined): string | null {
  const parts = [cleanPersonName(user?.firstName), cleanPersonName(user?.lastName)].filter(Boolean);
  return parts.length ? parts.join(' ') : null;
}

/** First + last, else email, else `User {id}`. */
export function userDisplayName(user: UserNameBits | null | undefined, fallback = 'Unknown'): string {
  return userFullName(user) || cleanPersonName(user?.email) || (user?.id ? `User ${user.id}` : fallback);
}
