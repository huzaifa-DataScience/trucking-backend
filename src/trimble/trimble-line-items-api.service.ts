import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

export interface TrimbleLineItemsPage {
  page: number;
  pageSize: number;
  total: number;
  projectId: number;
  rows: Record<string, unknown>[];
}

@Injectable()
export class TrimbleLineItemsApiService {
  constructor(private readonly dataSource: DataSource) {}

  /** Ordered SQL column names (Excel headers + Id / ProjectId / ExcelRowNumber). */
  async listColumnNames(): Promise<string[]> {
    const rows: { COLUMN_NAME: string }[] = await this.dataSource.query(
      `SELECT COLUMN_NAME AS COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = N'dbo' AND TABLE_NAME = N'Trimble_ProjectLineItems'
       ORDER BY ORDINAL_POSITION`,
    );
    return rows.map((r) => r.COLUMN_NAME);
  }

  /** Paginated parsed line-item rows for one StructShare project. */
  async listForProject(
    projectId: number,
    page: number,
    pageSize: number,
  ): Promise<TrimbleLineItemsPage> {
    const pid = Math.floor(Number(projectId));
    const pageNum = Math.max(1, Math.floor(page) || 1);
    const size = Math.max(1, Math.min(500, Math.floor(pageSize) || 50));
    const offset = (pageNum - 1) * size;

    const cntRows: Array<{ cnt: number | string } | Record<string, unknown>> =
      await this.dataSource.query(
        `SELECT COUNT_BIG(*) AS cnt FROM dbo.Trimble_ProjectLineItems WHERE ProjectId = ${pid}`,
      );
    const rawCnt = cntRows[0];
    const total = Number(
      rawCnt && typeof rawCnt === 'object' && 'cnt' in rawCnt ? (rawCnt as { cnt: unknown }).cnt : 0,
    );

    const dataRows = await this.dataSource.query(
      `SELECT * FROM dbo.Trimble_ProjectLineItems
       WHERE ProjectId = ${pid}
       ORDER BY ExcelRowNumber ASC
       OFFSET ${offset} ROWS FETCH NEXT ${size} ROWS ONLY`,
    );

    const rows = (dataRows as Record<string, unknown>[]).map((row) => {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(row)) {
        out[k] = v instanceof Date ? v.toISOString() : v;
      }
      return out;
    });

    return {
      page: pageNum,
      pageSize: size,
      total,
      projectId: pid,
      rows,
    };
  }
}
