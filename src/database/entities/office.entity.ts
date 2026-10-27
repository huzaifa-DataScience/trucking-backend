import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** A known office: its name and exact spot. Sign-ins are matched to the nearest one. */
@Entity({ name: 'App_Offices', schema: 'dbo' })
export class Office {
  @PrimaryGeneratedColumn({ name: 'Id' })
  id!: number;

  @Column({ name: 'Name', type: 'nvarchar', length: 200 })
  name!: string;

  @Column({ name: 'Latitude', type: 'decimal', precision: 9, scale: 6 })
  latitude!: string;

  @Column({ name: 'Longitude', type: 'decimal', precision: 9, scale: 6 })
  longitude!: string;

  @Column({ name: 'CreatedAt', type: 'datetime2', insert: false })
  createdAt!: Date;
}
