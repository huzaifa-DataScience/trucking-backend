import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'Clearstory_Users' })
export class ClearstoryUser {
  @PrimaryColumn({ name: 'Id', type: 'int' })
  id!: number;

  @Column({ name: 'FirstName', type: 'nvarchar', length: 200, nullable: true })
  firstName!: string | null;

  @Column({ name: 'LastName', type: 'nvarchar', length: 200, nullable: true })
  lastName!: string | null;

  @Column({ name: 'Email', type: 'nvarchar', length: 320, nullable: true })
  email!: string | null;

  @Column({ name: 'CompanyId', type: 'int', nullable: true })
  companyId!: number | null;

  @Column({ name: 'RoleId', type: 'int', nullable: true })
  roleId!: number | null;

  @Column({ name: 'RoleName', type: 'nvarchar', length: 100, nullable: true })
  roleName!: string | null;

  @Column({ name: 'UpdatedAt', type: 'datetime2', nullable: true })
  updatedAt!: Date | null;

  @Column({ name: 'CreatedAt', type: 'datetime2', nullable: true })
  createdAt!: Date | null;

  @Column({ name: 'LastSyncedAt', type: 'datetime2', default: () => 'SYSUTCDATETIME()' })
  lastSyncedAt!: Date;
}
