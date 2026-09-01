/**
 * Spec-sheet material dropdown: Excel List types, with Trimble catalog sizes/thicknesses.
 * Filter is the kind's Excel materials (not "skip accessory"). Units we scan:
 * Roll, Linear Foot / Foot, Square Foot (LF and SF treated the same).
 */
import { classifyInsulationFamily, classifySpecLayer, specInchOption } from '../process/spec-sheet';
import {
  parseLineItemName,
  parseRollDims,
  resolveMaterial,
  type CatalogMatchMode,
  type HelperMapEntry,
} from './specs-engine';

export type ExcelSpecMaterial = {
  id: number;
  description: string;
  code: string;
  kind: string;
  facing: string | null;
  jacket: string | null;
  thicknessIn: number | null;
  weight: number | null;
  sortOrder: number;
};

export type TrimbleCatalogRow = {
  recordId: string;
  itemName: string;
  units: string;
};

export type SpecInchOption = { value: number; label: string; sortOrder: number };

export type CatalogDims = {
  skuCount: number;
  sizes: SpecInchOption[];
  thicknesses: SpecInchOption[];
};

export type SpecMaterialOption = ExcelSpecMaterial & {
  excelDescription: string;
  sizeIn: number | null;
  trimbleUnit: string | null;
  matchMode: CatalogMatchMode;
  skuCount: number;
  sizes: SpecInchOption[];
  thicknesses: SpecInchOption[];
  family: string;
  /** Same as `family` — cascade field name on the spec row. */
  insulationFamily: string;
  layer: 'insulation' | 'covering';
};

const SOFT_FACINGS = new Set(['plain', 'no-wrap', 'nowrap']);
/** Factory vapor jacket printed on the SKU. Field jackets (PVC, canvas, …) are not. */
const NAME_FACINGS = new Set(['asj', 'fsk', 'psk']);
const SKIP_JACKET_TOKS = new Set(['pvc', 'canvas', 'aluminum', 'stainless', 'vic', 'weather', 'all']);

/** Roll width / length misparsed as insulation thickness. */
const MAX_INSULATION_THICK_IN = 12;
/** 96"/120" is roll width, not pipe NPS. 48" pipe covering exists. */
const MAX_PIPE_SIZE_IN = 80;

function nameLc(s: string): string {
  return String(s || '').toLowerCase();
}

function keywordHit(itemNameLc: string, keyword: string | null): boolean {
  if (!keyword) return false;
  const kw = keyword.toLowerCase();
  if (itemNameLc.includes(kw)) return true;
  if (kw === 'armaflex' && itemNameLc.includes('armacell')) return true;
  return false;
}

function approxEq(a: number | null | undefined, b: number): boolean {
  if (a == null || !Number.isFinite(a)) return false;
  return Math.abs(a - b) < 0.02;
}

function inchKey(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function uniqueInches(values: number[]): SpecInchOption[] {
  const uniq = [...new Set(values.map(inchKey))]
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);
  return uniq.map((v, i) => specInchOption(v, i));
}

function facingMustAppearInName(facing: string | null | undefined): boolean {
  const f = (facing || '').trim().toLowerCase();
  if (!f || SOFT_FACINGS.has(f)) return false;
  return NAME_FACINGS.has(f);
}

function jacketMustAppearInName(jacket: string | null | undefined): boolean {
  const tok = (jacket || '').trim().toLowerCase().split(/\s+/)[0];
  if (!tok || SKIP_JACKET_TOKS.has(tok)) return false;
  return true;
}

/** Weight token in a Trimble name (`3/4#`, `0.75#`). */
function nameHasWeight(itemNameLc: string, weight: number | null): boolean {
  if (weight == null || !Number.isFinite(weight)) return true;
  const wt = String(weight);
  const fracMap: Record<string, string> = {
    '0.75': '3/4',
    '0.5': '1/2',
    '0.25': '1/4',
    '3': '3',
    '1': '1',
    '1.5': '1.5',
    '6': '6',
  };
  const frac = fracMap[wt] || wt;
  return itemNameLc.includes(`${wt}#`) || itemNameLc.includes(`${frac}#`) || itemNameLc.includes(`${frac}lb`);
}

/**
 * Roll | LF/Foot | SF. Other units (Each, Bag, Box, …) are not expanded — they
 * usually fail Excel match anyway (blocks are Each).
 */
export function trimbleUnitKind(units: string): 'roll' | 'length' | null {
  const n = String(units || '')
    .trim()
    .toLowerCase();
  if (!n) return null;
  if (n === 'roll') return 'roll';
  if (
    n === 'linear foot' ||
    n === 'foot' ||
    n === 'lf' ||
    n === 'length' ||
    n === 'square foot' ||
    n === 'sf'
  ) {
    return 'length';
  }
  return null;
}

export function companyItemMatchesExcel(
  item: TrimbleCatalogRow,
  mat: ExcelSpecMaterial,
  helpers: HelperMapEntry[],
): boolean {
  if (!trimbleUnitKind(item.units)) return false;
  const res = resolveMaterial(mat.description, helpers);
  if (!res.keyword) return false;
  const lc = nameLc(item.itemName);
  if (!keywordHit(lc, res.keyword)) return false;

  const facing = (mat.facing || res.facing || '').trim();
  if (facingMustAppearInName(facing) && !lc.includes(facing.toLowerCase())) return false;

  if (jacketMustAppearInName(mat.jacket)) {
    const tok = (mat.jacket || '').trim().toLowerCase().split(/\s+/)[0];
    if (tok && !lc.includes(tok)) return false;
  }

  const unit = trimbleUnitKind(item.units);
  const rollish = res.matchMode === 'roll' || unit === 'roll';
  if (rollish) {
    if (mat.thicknessIn != null) {
      const dims = parseRollDims(item.itemName);
      const thick = dims.thickIn ?? parseLineItemName(item.itemName).sizeNum;
      if (!approxEq(thick, Number(mat.thicknessIn))) return false;
    }
    if (!nameHasWeight(lc, mat.weight == null ? null : Number(mat.weight))) return false;
  }
  return true;
}

function parsedDims(item: TrimbleCatalogRow, mode: CatalogMatchMode): { sizeIn: number | null; thicknessIn: number | null } {
  if (mode === 'roll' || trimbleUnitKind(item.units) === 'roll') {
    const dims = parseRollDims(item.itemName);
    return { sizeIn: null, thicknessIn: dims.thickIn };
  }
  const p = parseLineItemName(item.itemName);
  return { sizeIn: p.sizeNum, thicknessIn: p.thickNum };
}

function keepSize(n: number | null): n is number {
  return n != null && Number.isFinite(n) && n > 0 && n <= MAX_PIPE_SIZE_IN;
}

function keepThick(n: number | null): n is number {
  return n != null && Number.isFinite(n) && n > 0 && n < MAX_INSULATION_THICK_IN;
}

export function catalogDimsForMaterial(
  mat: ExcelSpecMaterial,
  helpers: HelperMapEntry[],
  trimble: TrimbleCatalogRow[],
): CatalogDims {
  if (!trimble.length) return { skuCount: 0, sizes: [], thicknesses: [] };
  const res = resolveMaterial(mat.description, helpers);
  const sizes: number[] = [];
  const thicknesses: number[] = [];
  let skuCount = 0;
  for (const item of trimble) {
    if (!companyItemMatchesExcel(item, mat, helpers)) continue;
    skuCount += 1;
    const dims = parsedDims(item, res.matchMode);
    if (keepSize(dims.sizeIn)) sizes.push(dims.sizeIn);
    if (keepThick(dims.thicknessIn)) thicknesses.push(dims.thicknessIn);
  }
  return {
    skuCount,
    sizes: uniqueInches(sizes),
    thicknesses: uniqueInches(thicknesses),
  };
}

function toOption(
  mat: ExcelSpecMaterial,
  helpers: HelperMapEntry[],
  dims: CatalogDims,
): SpecMaterialOption {
  const family = classifyInsulationFamily(mat.description);
  return {
    ...mat,
    excelDescription: mat.description,
    sizeIn: null,
    trimbleUnit: null,
    matchMode: resolveMaterial(mat.description, helpers).matchMode,
    skuCount: dims.skuCount,
    sizes: dims.sizes,
    thicknesses: dims.thicknesses,
    family,
    insulationFamily: family,
    layer: classifySpecLayer(mat.description),
  };
}

/**
 * Spec-sheet `?kind=` list: one row per Excel List type.
 * `sizes` / `thicknesses` are unique Trimble dims for that type (empty if no catalog hit).
 */
export function expandSpecMaterialsForKind(
  excel: ExcelSpecMaterial[],
  helpers: HelperMapEntry[],
  trimble: TrimbleCatalogRow[],
): SpecMaterialOption[] {
  return excel.map((m) => toOption(m, helpers, catalogDimsForMaterial(m, helpers, trimble)));
}

/** List BR / Mike coded labels — not the Insulation dropdown. */
export function isDuctEncodedLabel(description: string): boolean {
  return /^\d+(?:\.\d+)?"\s/.test(String(description || '').trim());
}

const KIND_RANK: Record<string, number> = { hydronic: 0, plumbing: 1, duct: 2 };

/**
 * Specs Plumb column H (Insulation): one shared type list for every sheet.
 * List AZ first, then plumbing extras. Never `1.5" 3/4lb Duct Wrap`.
 */
export function specSheetExcelMaterials(rows: ExcelSpecMaterial[]): ExcelSpecMaterial[] {
  const sorted = [...rows].sort(
    (a, b) => (KIND_RANK[a.kind] ?? 9) - (KIND_RANK[b.kind] ?? 9) || a.sortOrder - b.sortOrder,
  );
  const seen = new Set<string>();
  const out: ExcelSpecMaterial[] = [];
  for (const r of sorted) {
    if (isDuctEncodedLabel(r.description)) continue;
    const key = r.description.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}
