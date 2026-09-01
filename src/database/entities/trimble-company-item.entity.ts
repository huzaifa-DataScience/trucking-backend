import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Parsed company-catalog rows from the StructShare Company Items XLSX
 * (`Company_Items` sheet). Spreadsheet columns are added dynamically at ingest
 * so SQL names match Excel headers (same pattern as `Trimble_ProjectLineItems`).
 */
@Entity({ name: 'Trimble_CompanyItems' })
export class TrimbleCompanyItem {
  @PrimaryGeneratedColumn({ name: 'Id', type: 'bigint' })
  id!: number;

  @Index()
  @Column({ name: 'CompanyId', type: 'bigint' })
  companyId!: number;

  /** Excel row number (header is row 1). */
  @Index()
  @Column({ name: 'ExcelRowNumber', type: 'int' })
  excelRowNumber!: number;
}
