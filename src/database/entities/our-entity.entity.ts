import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('Ref_OurEntities', { schema: 'dbo' })
export class OurEntity {
  @PrimaryGeneratedColumn({ name: 'EntityID' })
  id: number;

  @Column({ name: 'EntityName', type: 'nvarchar' })
  name: string;
}
