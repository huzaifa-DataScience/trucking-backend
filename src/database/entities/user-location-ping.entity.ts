import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from './user.entity';

/** One location sent while someone had the app open. */
@Entity({ name: 'App_User_Location_Pings', schema: 'dbo' })
export class UserLocationPing {
  @PrimaryGeneratedColumn({ name: 'Id', type: 'bigint' })
  id!: string;

  @Column({ name: 'UserId', type: 'int' })
  userId!: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'UserId' })
  user!: User;

  @Column({ name: 'Latitude', type: 'decimal', precision: 9, scale: 6 })
  latitude!: string;

  @Column({ name: 'Longitude', type: 'decimal', precision: 9, scale: 6 })
  longitude!: string;

  @Column({ name: 'AccuracyM', type: 'float' })
  accuracyM!: number;

  @Column({ name: 'CreatedAt', type: 'datetime2', insert: false })
  createdAt!: Date;
}
