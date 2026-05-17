import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as ExcelJS from 'exceljs';

function cellToString(v: unknown): string | null {
  if (v == null || v === '') return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object' && v !== null && 'text' in v) {
    const t = (v as { text?: unknown }).text;
    return t == null ? null : String(t);
  }
  if (typeof v === 'object' && v !== null && 'result' in v) {
    return cellToString((v as { result: unknown }).result);
  }
  return String(v);
}

/** Normalized header key for SQL Server CI uniqueness (dup "Ref Item" vs "REF ITEM"). */
function normKey(name: string): string {
  return (name || '')
    .replace(/\u00a0/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .slice(0, 128);
}

/** Bracketed SQL Server identifier; escape `]` per T-SQL rules. */
export function sqlBracketIdent(name: string): string {
  const n = (name.trim() || '__empty').slice(0, 128);
  return `[${n.replace(/\]/g, ']]')}]`;
}

function sqlNString(v: string | null): string {
  if (v == null) return 'NULL';
  return `N'${String(v).replace(/'/g, "''")}'`;
}

/** Drop trailing `__col_N` columns when every row is empty there (Excel grid noise). */
function trimTrailingSyntheticColumns(headers: string[], rows: ParsedSheet['rows']): void {
  while (headers.length > 0) {
    const idx = headers.length - 1;
    const last = headers[idx];
    if (!/^__col_\d+(?:_\d+)?$/.test(last)) break;
    const hasData = rows.some((r) => {
      const v = r.values[idx];
      return v != null && String(v).trim() !== '';
    });
    if (hasData) break;
    headers.pop();
    for (const r of rows) r.values.pop();
  }
}

interface ParsedSheet {
  headers: string[];
  rows: { excelRowNumber: number; values: (string | null)[] }[];
}

@Injectable()
export class TrimbleLineItemIngestService {
  constructor(private readonly dataSource: DataSource) {}

  async clearForProject(projectId: number): Promise<void> {
    const pid = Number(projectId);
    if (!Number.isFinite(pid)) return;
    await this.dataSource.query(
      `DELETE FROM dbo.Trimble_ProjectLineItems WHERE ProjectId = ${pid}`,
    );
  }

  /**
   * Parse workbook, ensure one SQL column per Excel header (exact name), replace rows for project.
   */
  async ingestFromXlsx(projectId: number, _rawExportId: number, buffer: Buffer): Promise<number> {
    const sheet = await this.parseWorkbook(buffer);
    const pid = Number(projectId);
    if (!Number.isFinite(pid)) return 0;
    if (sheet.headers.length === 0) {
      await this.clearForProject(pid);
      return 0;
    }

    const physicalByNorm = await this.ensureExcelColumns(sheet.headers);

    await this.dataSource.transaction(async (manager) => {
      await manager.query(
        `DELETE FROM dbo.Trimble_ProjectLineItems WHERE ProjectId = ${pid}`,
      );
      const chunk = 25;
      const headerSql = sheet.headers
        .map((h) => sqlBracketIdent(physicalByNorm.get(normKey(h))!))
        .join(', ');
      const fixedCols = '[ProjectId], [ExcelRowNumber]';

      for (let i = 0; i < sheet.rows.length; i += chunk) {
        const part = sheet.rows.slice(i, i + chunk);
        const valueTuples = part
          .map((r) => {
            const cells = r.values.map((v) => sqlNString(v)).join(', ');
            return `(${pid}, ${r.excelRowNumber}, ${cells})`;
          })
          .join(',\n');
        await manager.query(
          `INSERT INTO dbo.Trimble_ProjectLineItems (${fixedCols}, ${headerSql})\nVALUES\n${valueTuples}`,
        );
      }
    });

    return sheet.rows.length;
  }

  /**
   * Add missing columns (case-insensitive vs existing DB columns — SQL Server CI collation).
   * Returns map normalizedKey -> physical column name to use in INSERT.
   */
  private async ensureExcelColumns(headers: string[]): Promise<Map<string, string>> {
    const rows: { COLUMN_NAME: string }[] = await this.dataSource.query(
      `SELECT COLUMN_NAME AS COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = N'dbo' AND TABLE_NAME = N'Trimble_ProjectLineItems'`,
    );
    const physicalByNorm = new Map<string, string>();
    for (const r of rows) {
      const name = (r.COLUMN_NAME || '').slice(0, 128);
      physicalByNorm.set(normKey(name), name);
    }

    for (const h of headers) {
      const n = normKey(h);
      if (physicalByNorm.has(n)) continue;
      const physical = (h.trim() || '__empty').slice(0, 128);
      await this.dataSource.query(
        `ALTER TABLE dbo.Trimble_ProjectLineItems ADD ${sqlBracketIdent(h)} nvarchar(max) NULL`,
      );
      physicalByNorm.set(n, physical);
    }
    return physicalByNorm;
  }

  private async parseWorkbook(buffer: Buffer): Promise<ParsedSheet> {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);

    let ws = wb.getWorksheet('Project_Items');
    if (!ws) ws = wb.worksheets[0];
    if (!ws) return { headers: [], rows: [] };

    const headerRow = ws.getRow(1);
    const dimRight =
      ws.dimensions != null && typeof (ws.dimensions as { right?: number }).right === 'number'
        ? (ws.dimensions as { right: number }).right
        : undefined;
    let colCount = Math.max(ws.columnCount || 0, dimRight || 0, 1);
    colCount = Math.min(colCount, 512);

    const seenNorm = new Set<string>();
    const headers: string[] = [];
    for (let c = 1; c <= colCount; c++) {
      const raw = cellToString(headerRow.getCell(c).value)?.trim();
      let key = raw && raw.length > 0 ? raw : `__col_${c}`;
      if (seenNorm.has(normKey(key))) {
        key = `${raw && raw.length > 0 ? raw : `__col_${c}`}_${c}`;
      }
      seenNorm.add(normKey(key));
      headers.push(key.slice(0, 128));
    }

    const rows: ParsedSheet['rows'] = [];
    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return;
      const values: (string | null)[] = [];
      for (let c = 0; c < headers.length; c++) {
        values.push(cellToString(row.getCell(c + 1).value));
      }
      rows.push({ excelRowNumber: rowNumber, values });
    });

    trimTrailingSyntheticColumns(headers, rows);

    return { headers, rows };
  }
}
