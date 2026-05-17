import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Parsed line-item rows from the StructShare Line Items XLSX (`Project_Items` sheet).
 * Actual spreadsheet columns are added to the table dynamically at ingest time so SQL
 * column names match Excel headers exactly (see `TrimbleLineItemIngestService`).
 *
 * TypeORM only maps the fixed bookkeeping columns; all Excel fields live as extra
 * columns on the same table (synchronize: false — we manage DDL in code).
 */
@Entity({ name: 'Trimble_ProjectLineItems' })
export class TrimbleProjectLineItem {
  @PrimaryGeneratedColumn({ name: 'Id', type: 'bigint' })
  id!: number;

  @Index()
  @Column({ name: 'ProjectId', type: 'bigint' })
  projectId!: number;

  /** Excel row number (header is row 1). */
  @Index()
  @Column({ name: 'ExcelRowNumber', type: 'int' })
  excelRowNumber!: number;
}
