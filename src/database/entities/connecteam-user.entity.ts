import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/** Safe roster fields only — no SSN, address, or full custom-field payloads. */
@Entity({ name: 'Connecteam_Users' })
export class ConnecteamUser {
  @PrimaryColumn({ name: 'UserId', type: 'int' })
  userId!: number;

  @Column({ name: 'FirstName', type: 'nvarchar', length: 100, nullable: true })
  firstName!: string | null;

  @Column({ name: 'LastName', type: 'nvarchar', length: 100, nullable: true })
  lastName!: string | null;

  @Index()
  @Column({ name: 'Email', type: 'nvarchar', length: 320, nullable: true })
  email!: string | null;

  @Column({ name: 'PhoneNumber', type: 'nvarchar', length: 50, nullable: true })
  phoneNumber!: string | null;

  @Column({ name: 'UserType', type: 'nvarchar', length: 40, nullable: true })
  userType!: string | null;

  @Index()
  @Column({ name: 'EmployeeId', type: 'nvarchar', length: 64, nullable: true })
  employeeId!: string | null;

  @Column({ name: 'IsArchived', type: 'bit', default: false })
  isArchived!: boolean;

  @Column({ name: 'ProfilePictureUrl', type: 'nvarchar', length: 1000, nullable: true })
  profilePictureUrl!: string | null;

  @Column({ name: 'CreatedAt', type: 'datetime2', nullable: true })
  createdAt!: Date | null;

  @Column({ name: 'ModifiedAt', type: 'datetime2', nullable: true })
  modifiedAt!: Date | null;

  @Column({ name: 'LastLoginAt', type: 'datetime2', nullable: true })
  lastLoginAt!: Date | null;

  @Column({ name: 'LastSyncedAt', type: 'datetime2', default: () => 'SYSUTCDATETIME()' })
  lastSyncedAt!: Date;
}
