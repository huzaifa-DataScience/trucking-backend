import { Column, Entity, PrimaryColumn } from 'typeorm';

/** Maps website `Ref_OurEntities.EntityID` to Siteline `currentCompany.id` (refreshed on sync). */
@Entity({ name: 'Siteline_EntityConfig' })
export class SitelineEntityConfig {
  @PrimaryColumn({ name: 'EntityId', type: 'int' })
  entityId!: number;

  @Column({ name: 'EntityName', type: 'nvarchar', length: 100 })
  entityName!: string;

  @Column({ name: 'SitelineCompanyId', type: 'nvarchar', length: 50, nullable: true })
  sitelineCompanyId!: string | null;

  @Column({ name: 'SitelineCompanyName', type: 'nvarchar', length: 255, nullable: true })
  sitelineCompanyName!: string | null;

  @Column({ name: 'LastResolvedAt', type: 'datetime2', nullable: true })
  lastResolvedAt!: Date | null;

  @Column({ name: 'UpdatedAt', type: 'datetime2' })
  updatedAt!: Date;
}
