import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export enum Role {
  User = 'user',
  Admin = 'admin',
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

  @CreateDateColumn({ name: 'CreatedAt' })
  createdAt: Date;
}
