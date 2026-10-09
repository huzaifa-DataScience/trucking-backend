import { Column, Entity, PrimaryColumn } from 'typeorm';

/** One row. The Togal chat instruction set John copies. Not per bid. */
@Entity({ name: 'Bid_TogalInstruction' })
export class BidTogalInstruction {
  @PrimaryColumn({ name: 'Id', type: 'int' })
  id!: number;

  @Column({ name: 'Body', type: 'nvarchar', length: 'MAX' })
  body!: string;

  @Column({ name: 'UpdatedAt', type: 'datetime2', default: () => 'SYSUTCDATETIME()' })
  updatedAt!: Date;

  @Column({ name: 'UpdatedByUserId', type: 'int', nullable: true })
  updatedByUserId!: number | null;

  @Column({ name: 'ClientId', type: 'nvarchar', length: 200, nullable: true })
  clientId!: string | null;

  @Column({ name: 'AccessToken', type: 'nvarchar', length: 'MAX', nullable: true })
  accessToken!: string | null;

  @Column({ name: 'AccessExpiresAt', type: 'datetime2', nullable: true })
  accessExpiresAt!: Date | null;

  @Column({ name: 'DeviceCode', type: 'nvarchar', length: 'MAX', nullable: true })
  deviceCode!: string | null;

  @Column({ name: 'DeviceUserCode', type: 'nvarchar', length: 40, nullable: true })
  deviceUserCode!: string | null;

  @Column({ name: 'DeviceVerificationUrl', type: 'nvarchar', length: 'MAX', nullable: true })
  deviceVerificationUrl!: string | null;

  @Column({ name: 'DeviceExpiresAt', type: 'datetime2', nullable: true })
  deviceExpiresAt!: Date | null;
}
