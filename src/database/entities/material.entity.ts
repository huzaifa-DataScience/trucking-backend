import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Ticket } from './ticket.entity';

@Entity('Ref_Materials', { schema: 'dbo' })
export class Material {
  @PrimaryGeneratedColumn({ name: 'MaterialID' })
  id: number;

  @Column({ name: 'MaterialName', type: 'nvarchar' })
  name: string;

  @Column({ name: 'ParentMaterialID', type: 'int', nullable: true })
  parentMaterialId: number | null;

  @OneToMany(() => Ticket, (t: Ticket) => t.material)
  tickets: Ticket[];
}
