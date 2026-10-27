import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Office } from './office.entity';
import { User } from './user.entity';

/** Where someone was when they signed in: browser location and the floor they picked. */
@Entity({ name: 'App_User_Sign_In_Locations', schema: 'dbo' })
export class UserSignInLocation {
  @PrimaryGeneratedColumn({ name: 'Id' })
  id!: number;

  @Column({ name: 'UserId', type: 'int' })
  userId!: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'UserId' })
  user!: User;

  @Column({ name: 'Latitude', type: 'decimal', precision: 9, scale: 6 })
  latitude!: string;

  @Column({ name: 'Longitude', type: 'decimal', precision: 9, scale: 6 })
  longitude!: string;

  /** Browser's accuracy radius in metres. */
  @Column({ name: 'AccuracyM', type: 'float' })
  accuracyM!: number;

  /** The office the person confirmed; null = not at an office. */
  @Column({ name: 'OfficeId', type: 'int', nullable: true })
  officeId!: number | null;

  @ManyToOne(() => Office, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'OfficeId' })
  office!: Office | null;

  /** Readable address looked up from the coordinates; null until found. */
  @Column({ name: 'Address', type: 'nvarchar', length: 400, nullable: true })
  address!: string | null;

  @Column({ name: 'Floor', type: 'nvarchar', length: 40 })
  floor!: string;

  @Column({ name: 'CreatedAt', type: 'datetime2', insert: false })
  createdAt!: Date;
}
