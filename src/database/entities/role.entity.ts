import { Column, Entity, JoinTable, ManyToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Permission } from './permission.entity';

@Entity('App_Roles', { schema: 'dbo' })
export class AppRole {
  @PrimaryGeneratedColumn({ name: 'Id' })
  id: number;

  @Column({ name: 'Name', type: 'nvarchar', length: 50, unique: true })
  name: string;

  @Column({ name: 'Description', type: 'nvarchar', length: 255, nullable: true })
  description: string | null;

  @ManyToMany(() => Permission, (p) => p.roles, { eager: true })
  @JoinTable({
    name: 'App_RolePermissions',
    schema: 'dbo',
    joinColumn: { name: 'RoleId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'PermissionId', referencedColumnName: 'id' },
  })
  permissions: Permission[];
}
