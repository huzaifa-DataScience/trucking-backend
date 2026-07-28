/**
 * Create Specs tables (if needed) + seed List/helpermap/item catalog from EstimationFile.xlsx.
 * Usage: npx ts-node scripts/seed-bidding-specs-from-estimation.ts [path/to.xlsx]
 */
import 'dotenv/config';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import * as ExcelJS from 'exceljs';
import { AppModule } from '../src/app.module';
import {
  BidHelperMap,
  BidItemCatalog,
  BidSpecArea,
  BidSpecMaterial,
  BidSpecSystem,
} from '../src/database/entities';
import { parseLineItemName } from '../src/bidding/specs/specs-engine';

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

function n(v: unknown): number | null {
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}

async function runSqlFile(ds: DataSource, relPath: string): Promise<void> {
  const sql = readFileSync(join(__dirname, relPath), 'utf8');
  const batches = sql
    .split(/\r?\n\s*GO\s*\r?\n/i)
    .map((b) => b.trim())
    .filter((b) => b.replace(/--[^\n]*/g, '').trim().length > 0);
  for (const batch of batches) await ds.query(batch);
}

async function main(): Promise<void> {
  const xlsxPath =
    process.argv[2] || join(__dirname, '..', 'EstimationFile.xlsx');
  if (!existsSync(xlsxPath)) {
    throw new Error(`Workbook not found: ${xlsxPath}`);
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    const ds = app.get(DataSource);
    await runSqlFile(ds, 'sql/add-bidding-specs-tables.sql');
    await runSqlFile(ds, 'sql/add-bidding-specs-phase2.sql');
    console.log('✓ Specs tables ensured (phase 1+2)');

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(xlsxPath);
    const list = wb.getWorksheet('List');
    const hm = wb.getWorksheet('helpermap');
    const items = wb.getWorksheet('item Database');
    if (!list || !hm) throw new Error('Missing List or helpermap sheet');
    if (!items) throw new Error('Missing item Database sheet');

    // List: AL=38 system, AN=40 code, AO=41 unit (dedupe — List repeats HVAC/Plumb names)
    const systemsByKey = new Map<
      string,
      { systemName: string; code: string; unit: string; sortOrder: number }
    >();
    for (let r = 2; r <= 120; r++) {
      const systemName = s(cell(list.getRow(r).getCell(38)));
      const code = s(cell(list.getRow(r).getCell(40)));
      const unit = s(cell(list.getRow(r).getCell(41))) || 'LF';
      if (!systemName || systemName === '---' || systemName === 'System') continue;
      if (!code || code === '---') continue;
      const key = systemName.toLowerCase();
      if (systemsByKey.has(key)) continue;
      systemsByKey.set(key, { systemName, code, unit, sortOrder: systemsByKey.size });
    }
    const systems = [...systemsByKey.values()];

    // Materials: AZ=52 desc, AT=46 code
    const materialsByKey = new Map<
      string,
      { description: string; code: string; sortOrder: number }
    >();
    for (let r = 2; r <= 80; r++) {
      const description = s(cell(list.getRow(r).getCell(52)));
      const code = s(cell(list.getRow(r).getCell(46)));
      if (!description || description === '---') continue;
      if (!code || code === '---') continue;
      const key = description.toLowerCase();
      if (materialsByKey.has(key)) continue;
      materialsByKey.set(key, { description, code, sortOrder: materialsByKey.size });
    }
    const materials = [...materialsByKey.values()];

    // Areas: BB=54 name, BA=53 code
    const areasByKey = new Map<string, { areaName: string; code: string; sortOrder: number }>();
    for (let r = 2; r <= 80; r++) {
      const areaName = s(cell(list.getRow(r).getCell(54)));
      const code = s(cell(list.getRow(r).getCell(53)));
      if (!areaName || areaName === '---') continue;
      if (!code || code === '---') continue;
      const key = areaName.toLowerCase();
      if (areasByKey.has(key)) continue;
      areasByKey.set(key, { areaName, code, sortOrder: areasByKey.size });
    }
    const areas = [...areasByKey.values()];

    // helpermap E/F = insulation prefix → Mike material base; A/B = Spec phrase → keyword
    const prefixes: Array<{ rawPrefix: string; baseName: string }> = [];
    for (let r = 2; r <= 40; r++) {
      const rawPrefix = s(cell(hm.getRow(r).getCell(5)));
      const baseName = s(cell(hm.getRow(r).getCell(6)));
      if (rawPrefix && baseName) prefixes.push({ rawPrefix, baseName });
    }
    const matchPrefix = (phrase: string) => {
      const lower = phrase.toLowerCase();
      let best: { rawPrefix: string; baseName: string } | null = null;
      for (const p of prefixes) {
        if (!lower.includes(p.rawPrefix.toLowerCase())) continue;
        if (!best || p.rawPrefix.length > best.rawPrefix.length) best = p;
      }
      return best;
    };

    const helpersByKey = new Map<
      string,
      {
        specPhrase: string;
        keyword: string;
        keyword2: string | null;
        rawPrefix: string | null;
        baseName: string | null;
        sortOrder: number;
      }
    >();
    for (let r = 2; r <= 100; r++) {
      const specPhrase = s(cell(hm.getRow(r).getCell(1)));
      const keyword = s(cell(hm.getRow(r).getCell(2)));
      if (!specPhrase || !keyword) continue;
      const key = specPhrase.toLowerCase();
      if (helpersByKey.has(key)) continue;
      const keyword2 = s(cell(hm.getRow(r).getCell(3))) || null;
      const mapped = matchPrefix(specPhrase);
      helpersByKey.set(key, {
        specPhrase,
        keyword,
        keyword2,
        rawPrefix: mapped?.rawPrefix ?? null,
        baseName: mapped?.baseName ?? null,
        sortOrder: helpersByKey.size,
      });
    }
    const helpers = [...helpersByKey.values()];

    // item Database: A=name, L=price, S=_name_lc, T=_size1, U=_size2
    const catalog: Array<{
      itemName: string;
      price: number | null;
      nameLc: string;
      size1: number | null;
      size2: number | null;
    }> = [];
    for (let r = 2; r <= items.rowCount; r++) {
      const row = items.getRow(r);
      const itemName = s(cell(row.getCell(1)));
      if (!itemName) continue;
      const price = n(cell(row.getCell(12)));
      let nameLc = s(cell(row.getCell(19))).toLowerCase();
      if (!nameLc) nameLc = itemName.toLowerCase();
      let size1 = n(cell(row.getCell(20)));
      let size2 = n(cell(row.getCell(21)));
      if (size1 == null || size2 == null) {
        const parsed = parseLineItemName(itemName);
        if (size1 == null) size1 = parsed.sizeNum;
        if (size2 == null) size2 = parsed.thickNum;
      }
      catalog.push({
        itemName: itemName.slice(0, 500),
        price,
        nameLc: (nameLc || itemName.toLowerCase()).slice(0, 500),
        size1,
        size2,
      });
    }

    await ds.transaction(async (manager) => {
      await manager.query('DELETE FROM dbo.Bid_HelperMap');
      await manager.query('DELETE FROM dbo.Bid_SpecAreas');
      await manager.query('DELETE FROM dbo.Bid_SpecMaterials');
      await manager.query('DELETE FROM dbo.Bid_SpecSystems');
      await manager.query('DELETE FROM dbo.Bid_ItemCatalog');

      await manager.getRepository(BidSpecSystem).save(
        systems.map((x) => manager.getRepository(BidSpecSystem).create(x)),
        { chunk: 50 },
      );
      await manager.getRepository(BidSpecMaterial).save(
        materials.map((x) => manager.getRepository(BidSpecMaterial).create(x)),
        { chunk: 50 },
      );
      await manager.getRepository(BidSpecArea).save(
        areas.map((x) => manager.getRepository(BidSpecArea).create(x)),
        { chunk: 50 },
      );
      await manager.getRepository(BidHelperMap).save(
        helpers.map((x) => manager.getRepository(BidHelperMap).create(x)),
        { chunk: 50 },
      );

      // Bulk insert via VALUES — TypeORM save() hits TDS param limits / length bugs on 15k rows
      const chunkSize = 100;
      for (let i = 0; i < catalog.length; i += chunkSize) {
        const slice = catalog.slice(i, i + chunkSize);
        const values = slice
          .map(
            (_, j) =>
              `(@${j * 5}, @${j * 5 + 1}, @${j * 5 + 2}, @${j * 5 + 3}, @${j * 5 + 4})`,
          )
          .join(',');
        const params: unknown[] = [];
        for (const row of slice) {
          params.push(row.itemName, row.price, row.nameLc, row.size1, row.size2);
        }
        await manager.query(
          `INSERT INTO dbo.Bid_ItemCatalog (ItemName, Price, NameLc, Size1, Size2)
           VALUES ${values}`,
          params,
        );
      }
    });

    console.log(
      `✓ Seeded systems=${systems.length} materials=${materials.length} areas=${areas.length} helperMap=${helpers.length} catalog=${catalog.length}`,
    );
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
