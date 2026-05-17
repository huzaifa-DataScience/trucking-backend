import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * One historical snapshot of the raw Line Items XLSX export pulled from
 * StructShare for a single project (GET /api/next/project/{id}/line-items/excel?).
 *
 * We persist the workbook bytes verbatim so we can both (a) re-serve them to
 * the frontend without hitting StructShare again and (b) re-parse them later
 * if the upstream column layout changes.  Each sync run inserts a new row,
 * giving us a full history per project.
 *
 * Failed downloads are also recorded (Payload IS NULL, Error populated) so
 * the dashboard can surface them.
 */
@Entity({ name: 'Trimble_LineItemRawExports' })
export class TrimbleLineItemRawExport {
  @PrimaryGeneratedColumn({ name: 'Id', type: 'bigint' })
  id!: number;

  @Index()
  @Column({ name: 'ProjectId', type: 'bigint' })
  projectId!: number;

  @Column({ name: 'ProjectName', type: 'nvarchar', nullable: true })
  projectName!: string | null;

  /** "line-items" — kept for forward compatibility if we add other report types later. */
  @Column({ name: 'ReportType', type: 'nvarchar', length: 60, default: 'line-items' })
  reportType!: string;

  @Column({ name: 'FileName', type: 'nvarchar', length: 400, nullable: true })
  fileName!: string | null;

  @Column({ name: 'ContentType', type: 'nvarchar', length: 200, nullable: true })
  contentType!: string | null;

  @Column({ name: 'ByteLength', type: 'int', nullable: true })
  byteLength!: number | null;

  /** Raw XLSX bytes (varbinary(max)).  Null when the download failed. */
  @Column({ name: 'Payload', type: 'varbinary', length: 'MAX', nullable: true })
  payload!: Buffer | null;

  @Column({ name: 'HttpStatus', type: 'int', nullable: true })
  httpStatus!: number | null;

  @Column({ name: 'Error', type: 'nvarchar', nullable: true })
  error!: string | null;

  @Index()
  @Column({ name: 'FetchedAt', type: 'datetime2', default: () => 'SYSUTCDATETIME()' })
  fetchedAt!: Date;
}
