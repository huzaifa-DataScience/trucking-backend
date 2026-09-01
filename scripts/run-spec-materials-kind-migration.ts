/**
 * Add Bid_SpecMaterials.Kind + HVAC/Plumbing/Duct List rows from EstimationFile.
 * Usage: npm run bidding-migrate-spec-materials
 */
import 'dotenv/config';
import { existsSync } from 'fs';
import { join } from 'path';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import * as ExcelJS from 'exceljs';
import { AppModule } from '../src/app.module';
import { BidSpecMaterial } from '../src/database/entities';
import { implyMaterialFields } from '../src/bidding/process/spec-sheet';
import { readFileSync } from 'fs';

function cell(c: ExcelJS.Cell): unknown {
  const v = c.value;
  if (v == null) return null;
  if (typeof v === 'object' && v !== null) {
    if ('result' in v) return (v as { result: unknown }).result;
    if ('richText' in v) {
      return (v as { richText: { text: string }[] }).richText.map((t) => t.text).join('');
    }
    if ('text' in v) return (v as { text: string }).text;
  }
  return v;
}

function s(v: unknown): string {
  return String(v ?? '')
    .replace(/\u00a0/g, ' ')
    .trim();
}

async function main(): Promise<void> {
  const xlsxPath = process.argv[2] || join(__dirname, '..', 'EstimationFile.xlsx');
  if (!existsSync(xlsxPath)) throw new Error(`Workbook not found: ${xlsxPath}`);

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    const ds = app.get(DataSource);
    const sql = readFileSync(join(__dirname, 'sql', 'add-bid-spec-materials-kind.sql'), 'utf8');
    const batches = sql
      .split(/\r?\n\s*GO\s*\r?\n/i)
      .map((b) => b.trim())
      .filter((b) => b.replace(/--[^\n]*/g, '').trim().length > 0);
    for (const batch of batches) await ds.query(batch);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(xlsxPath);
    const list = wb.getWorksheet('List');
    if (!list) throw new Error('Missing List sheet');

    type MatRow = {
      description: string;
      code: string;
      kind: 'hydronic' | 'plumbing' | 'duct';
      facing: string | null;
      jacket: string | null;
      thicknessIn: number | null;
      weight: number | null;
      sortOrder: number;
    };
    const materialsByKey = new Map<string, MatRow>();
    const addMaterial = (
      kind: MatRow['kind'],
      description: string,
      code: string,
      fieldJacket: string,
    ) => {
      if (!description || description === '---') return;
      if (!code || code === '---') return;
      const key = `${kind}|${description.toLowerCase()}`;
      if (materialsByKey.has(key)) return;
      const implied = implyMaterialFields(description, fieldJacket || null);
      materialsByKey.set(key, {
        description,
        code,
        kind,
        facing: implied.facing,
        jacket: implied.jacket,
        thicknessIn: implied.thicknessIn,
        weight: implied.weight,
        sortOrder: materialsByKey.size,
      });
    };
    for (let r = 2; r <= 80; r++) {
      const row = list.getRow(r);
      addMaterial('hydronic', s(cell(row.getCell(52))), s(cell(row.getCell(46))), s(cell(row.getCell(48))));
    }
    for (let r = 2; r <= 80; r++) {
      const row = list.getRow(r);
      addMaterial('plumbing', s(cell(row.getCell(67))), s(cell(row.getCell(68))), '');
    }
    for (let r = 2; r <= 80; r++) {
      const row = list.getRow(r);
      addMaterial('duct', s(cell(row.getCell(70))), s(cell(row.getCell(69))), '');
    }
    const materials = [...materialsByKey.values()];

    await ds.transaction(async (manager) => {
      await manager.query('DELETE FROM dbo.Bid_SpecMaterials');
      await manager.getRepository(BidSpecMaterial).save(
        materials.map((x) => manager.getRepository(BidSpecMaterial).create(x)),
        { chunk: 50 },
      );
    });

    const counts = await ds.query(`
      SELECT Kind, COUNT(*) AS n FROM dbo.Bid_SpecMaterials GROUP BY Kind ORDER BY Kind
    `);
    console.log('✓ Bid_SpecMaterials kind + List codes ready.', counts);
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
