import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export enum Role {
  User = 'user',
  Admin = 'admin',
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

  @Column({ name: 'PasswordHash', type: 'nvarchar', length: 255 })
  passwordHash: string;

  @Column({ name: 'Role', type: 'nvarchar', length: 50, default: Role.User })
  role: Role;

  @Column({ name: 'Status', type: 'nvarchar', length: 50, default: UserStatus.Pending })
  status: UserStatus;

  @CreateDateColumn({ name: 'CreatedAt' })
  createdAt: Date;

  @Column({ name: 'LastLoginAt', type: 'datetime2', nullable: true })
  lastLoginAt: Date | null;
}
