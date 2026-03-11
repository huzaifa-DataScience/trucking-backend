import { Entity, Column, PrimaryGeneratedColumn, ManyToMany } from 'typeorm';
import { AppRole } from './role.entity';

@Entity('App_Permissions', { schema: 'dbo' })
export class Permission {
  @PrimaryGeneratedColumn({ name: 'Id' })
  id: number;

  @Column({ name: 'Name', type: 'nvarchar', length: 100, unique: true })
  name: string;

  @Column({ name: 'Description', type: 'nvarchar', length: 255, nullable: true })
  description: string | null;

  @ManyToMany(() => AppRole, (role) => role.permissions)
  roles: AppRole[];
}
