import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * Latest full JSON body returned by Clearstory Web API for a resource (list + detail merged when both exist).
 * Pairs with typed mirror tables for reporting; use this for Swagger-faithful / complete field access.
 */
@Entity({ name: 'Clearstory_ApiPayloads' })
export class ClearstoryApiPayload {
  @PrimaryColumn({ name: 'ResourceType', type: 'nvarchar', length: 80 })
  resourceType!: string;

  @PrimaryColumn({ name: 'ResourceKey', type: 'nvarchar', length: 400 })
  resourceKey!: string;

  @Column({ name: 'PayloadJson', type: 'nvarchar', nullable: true })
  payloadJson!: string | null;

  @Column({ name: 'LastFetchedAt', type: 'datetime2', default: () => 'SYSUTCDATETIME()' })
  lastFetchedAt!: Date;
}
