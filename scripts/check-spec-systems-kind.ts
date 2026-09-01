/**
 * Diagnose Bid_SpecSystems kind filter (spec-sheet System dropdown).
 * Usage: npx ts-node --transpile-only scripts/check-spec-systems-kind.ts
 */
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AppModule } from '../src/app.module';
import { BidSpecSystem } from '../src/database/entities';

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });
  try {
    const ds = app.get(DataSource);
    const cols = await ds.query(`
      SELECT c.name, t.name AS typeName, c.is_nullable, dc.definition AS defaultDef
      FROM sys.columns c
      JOIN sys.types t ON t.user_type_id = c.user_type_id
      LEFT JOIN sys.default_constraints dc ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
      WHERE c.object_id = OBJECT_ID('dbo.Bid_SpecSystems')
      ORDER BY c.column_id
    `);
    const grouped = await ds.query(`
      SELECT Kind, IsActive, COUNT(*) AS n
      FROM dbo.Bid_SpecSystems
      GROUP BY Kind, IsActive
      ORDER BY Kind, IsActive
    `);
    const sample = await ds.query(`
      SELECT TOP 3 SpecSystemId, SystemName, Code, Kind, IsActive
      FROM dbo.Bid_SpecSystems
      WHERE Kind = N'duct'
      ORDER BY SortOrder
    `);
    const repo = app.get<Repository<BidSpecSystem>>(getRepositoryToken(BidSpecSystem));
    const duct = await repo.find({
      where: { isActive: true, kind: 'duct' },
      order: { sortOrder: 'ASC' },
    });
    const ductRaw = await repo.find({ where: { kind: 'duct' } });
    const all = await repo.find();
    console.log(JSON.stringify({ cols, grouped, sample, typeorm: { ductActive: duct.length, ductAny: ductRaw.length, all: all.length, firstDuct: duct[0] || ductRaw[0] || null } }, null, 2));
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
