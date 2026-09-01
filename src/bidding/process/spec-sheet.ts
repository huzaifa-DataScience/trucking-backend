/**
 * Client spec rules (Estimating Setup, before takeoff).
 * Dependent dropdowns from Specs Plumb masters — not a free-form spreadsheet.
 * CSV cross-check against these rows is later; day 1 is pick-and-save.
 */

import { parseLineItemName, parseRollDims, resolveMaterial, type HelperMapEntry } from '../specs/specs-engine';

export const SPEC_SHEET_KINDS = ['duct', 'hydronic', 'plumbing', 'equipment'] as const;
export type SpecSheetKind = (typeof SPEC_SHEET_KINDS)[number];

/** FE query aliases → spec sheet kind. `hydrionic` / `hvac` still resolve. */
export function specSheetKind(raw?: string | null): SpecSheetKind | undefined {
  const k = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ');
  if (k === 'duct' || k === 'ductwork' || k === 'duct insulation') return 'duct';
  if (k === 'hydronic' || k === 'hydrionic' || k === 'hvac' || k === 'hvac pipe' || k === 'hvac piping') {
    return 'hydronic';
  }
  if (k === 'plumbing' || k === 'plumb') return 'plumbing';
  if (k === 'equipment' || k === 'equip' || k === 'tanks') return 'equipment';
  return undefined;
}

/** PJ 2026-08-23: pick family first, then the product. */
export const INSULATION_FAMILIES = [
  'fiberglass',
  'elastomeric',
  'polyiso',
  'phenolic',
  'mineral_wool',
  'calcium_silicate',
  'foamglas',
  'fire_rated_duct_wrap',
  'closed_cell_polyethylene',
  'other',
] as const;
export type InsulationFamily = (typeof INSULATION_FAMILIES)[number];

export const SPEC_LAYERS = ['insulation', 'covering'] as const;
export type SpecLayer = (typeof SPEC_LAYERS)[number];

export const DUCT_SHAPES = ['rectangular', 'square', 'round', 'oval'] as const;
export type DuctShape = (typeof DUCT_SHAPES)[number];

export const SIZE_MODES = ['nps', 'circumference', 'any'] as const;
export type SizeMode = (typeof SIZE_MODES)[number];

export const SIZE_MODE_BY_KIND: Record<SpecSheetKind, SizeMode> = {
  duct: 'circumference',
  hydronic: 'nps',
  plumbing: 'nps',
  equipment: 'any',
};

const FAMILY_LABEL: Record<InsulationFamily, string> = {
  fiberglass: 'Fiberglass',
  elastomeric: 'Elastomeric',
  polyiso: 'Polyiso',
  phenolic: 'Phenolic foam',
  mineral_wool: 'Mineral wool',
  calcium_silicate: 'Calcium silicate',
  foamglas: 'Foamglas',
  fire_rated_duct_wrap: 'Fire-rated duct wrap',
  closed_cell_polyethylene: 'Closed-cell polyethylene / bubble wrap',
  other: 'Other',
};

/** Layer 2 — field-applied jacket. Factory finish is `facing` (spec-facings). Stainless is never layer 1. */
export const SPEC_COVERINGS = [
  { value: 'none', label: 'None' },
  { value: 'aluminum_016', label: 'Aluminum 0.016"' },
  { value: 'aluminum_020', label: 'Aluminum 0.020"' },
  { value: 'aluminum_024', label: 'Aluminum 0.024"' },
  { value: 'stainless', label: 'Stainless' },
  { value: 'pvc', label: 'PVC' },
  { value: 'canvas', label: 'Canvas' },
  { value: 'sound_lag', label: 'Sound lagging / MLV' },
  { value: 'other', label: 'Other' },
] as const;

export const SPEC_MANUFACTURERS = [
  { value: 'owens_corning', label: 'Owens Corning' },
  { value: 'johns_manville', label: 'Johns Manville' },
  { value: 'knauf', label: 'Knauf' },
  { value: 'manson', label: 'Manson' },
  { value: 'other', label: 'Other' },
] as const;

/** PJ: tanks / chillers / pumps live here, not as a pipe system. */
export const EQUIPMENT_SYSTEMS: Array<{
  systemName: string;
  code: string;
  unit: string;
  kind: 'equipment';
}> = [
  { kind: 'equipment', systemName: 'Expansion Tank', code: 'ETK', unit: 'SF' },
  { kind: 'equipment', systemName: 'Chiller', code: 'CHL', unit: 'SF' },
  { kind: 'equipment', systemName: 'Chiller Head', code: 'CHH', unit: 'SF' },
  { kind: 'equipment', systemName: 'Pumps', code: 'PMP', unit: 'SF' },
  { kind: 'equipment', systemName: 'Chilled Beams', code: 'CHB', unit: 'SF' },
  { kind: 'equipment', systemName: 'Air Separator', code: 'ASP', unit: 'SF' },
  { kind: 'equipment', systemName: 'Boiler', code: 'BLR', unit: 'SF' },
  { kind: 'equipment', systemName: 'Heat Exchanger', code: 'HX', unit: 'SF' },
  { kind: 'equipment', systemName: 'Fan Coil Unit', code: 'FCU', unit: 'SF' },
  { kind: 'equipment', systemName: 'Buffer Tank', code: 'BUF', unit: 'SF' },
  { kind: 'equipment', systemName: 'Other', code: 'OTH', unit: 'SF' },
];

const COVERING_RE =
  /\b(pvc coverings?|pvc jacket|canvas|sound lagg|metal mesh|hex mesh|glass fabric|armatuff|removable covers?|cement 2 layers|sizing|aluminum jacket|stainless steel)\b/i;

export function classifySpecLayer(description: string): SpecLayer {
  const t = String(description || '').trim();
  if (!t) return 'insulation';
  if (COVERING_RE.test(t) && !/\b(fiberglass|foamglas|elastomer|armaflex|phenolic|polyiso|mineral wool|cal[\s-]*sil)\b/i.test(t)) {
    return 'covering';
  }
  return 'insulation';
}

export function classifyInsulationFamily(description: string): InsulationFamily {
  const t = String(description || '').toLowerCase();
  if (/foam\s*glas|foamglas|cellular glass/.test(t)) return 'foamglas';
  if (/cal[\s-]*sil|calcium silicate|calsil/.test(t)) return 'calcium_silicate';
  if (/phenolic/.test(t)) return 'phenolic';
  if (/polyiso|polyisocyanurate/.test(t)) return 'polyiso';
  if (/mineral\s*wool|mineral fiber|rockwool|\bmin wool\b/.test(t)) return 'mineral_wool';
  if (/fire[\s-]*rated|friendly feel|fire master/.test(t)) return 'fire_rated_duct_wrap';
  if (/\b(polyethylene|bubble wrap|imcoa|therma-?cel)\b/.test(t)) return 'closed_cell_polyethylene';
  if (/elastomer|armaflex|armacell|rubbertex|rubertex|\brubber\b/.test(t)) return 'elastomeric';
  if (/fiberglass|fibre glass|\bfg\b|duct wrap|duct board/.test(t)) return 'fiberglass';
  return 'other';
}

/** Accept family id (`fiberglass`) or process-meta label (`Fiberglass`, `Mineral wool`). */
export function parseFamilyQuery(raw?: string | null): InsulationFamily | null {
  const s = String(raw || '').trim();
  if (!s) return null;
  const compact = s.toLowerCase().replace(/[^a-z0-9]+/g, '');
  for (const id of INSULATION_FAMILIES) {
    if (id === s.toLowerCase().replace(/[\s-]+/g, '_')) return id;
    if (id.replace(/_/g, '') === compact) return id;
    const label = FAMILY_LABEL[id].toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (label === compact || (label.startsWith(compact) && compact.length >= 4)) return id;
  }
  return null;
}

/** Bare GET used to dump every List type — that's the old one-dropdown. Family first, unless `code` / `q`. */
export function specMaterialsQueryEmpty(opts?: {
  family?: string | null;
  insulationFamily?: string | null;
  code?: string | null;
  q?: string | null;
}): boolean {
  if (String(opts?.code || '').trim() || String(opts?.q || '').trim()) return false;
  return parseFamilyQuery(opts?.family || opts?.insulationFamily) == null;
}

export function insulationFamiliesMeta() {
  return INSULATION_FAMILIES.map((id, i) => ({ id, label: FAMILY_LABEL[id], sortOrder: i }));
}

export const MAX_SPEC_SHEETS = 12;
export const MAX_SPEC_ROWS = 60;
export const MAX_SPEC_IMAGES = 20;
export const EMPTY_DATA_ROWS = 6;

/** Fallback only. Prefer GET /lookups/bidding/spec-systems?kind=… (Bid_SpecSystems.Kind). */
export const SPEC_KIND_SYSTEM_HINTS: Record<SpecSheetKind, string[]> = {
  duct: ['air', 'duct', 'exhaust', 'supply', 'return', 'hood', 'oa', 'doas', 'grease', 'pressuriz', 'transfer'],
  hydronic: [
    'chill',
    'heat',
    'steam',
    'condensate',
    'refrigerant',
    'hydronic',
    'hhw',
    'chw',
    'boiler',
    'glycol',
    'heating hot',
  ],
  plumbing: ['domestic', 'sanitary', 'storm', 'vent', 'dhw', 'dcw', 'potable', 'waste', 'overflow', 'plumbing'],
  equipment: [
    'expansion',
    'chiller',
    'pump',
    'beam',
    'separator',
    'boiler',
    'exchanger',
    'fan coil',
    'buffer',
    'tank',
    'equipment',
  ],
};

export type SpecSheetRow = {
  id: string;
  systemName: string | null;
  /** List AN. Auto from systemName — never a dropdown. */
  systemCode: string | null;
  /** List AO. Auto from systemName. */
  unit: string | null;
  areaName: string | null;
  /** List BA. Auto from areaName. Shared list — not per system. */
  areaCode: string | null;
  /** Pipe NPS / duct circumference lower bound (inches). Null = any / not set. */
  sizeMin: number | null;
  /** Inclusive upper bound. Null = no upper limit. */
  sizeMax: number | null;
  /** nps = pipe. circumference = duct. any = equipment / all sizes. */
  sizeMode: SizeMode | null;
  ductShape: DuctShape | null;
  /** Family before the product. Auto from materialName if blank. */
  insulationFamily: InsulationFamily | null;
  materialName: string | null;
  /** List AT / BP / BQ. Auto from materialName. Estimators may send this to skip the cascade. */
  materialCode: string | null;
  thicknessIn: number | null;
  /** Duct density (3/4lb → 0.75). Auto from duct material when present. */
  weight: number | null;
  /** Layer 1 factory jacket (ASJ / FSK / none). */
  facing: string | null;
  /** Layer 2 field jacket (aluminum / stainless / PVC / none). */
  jacket: string | null;
  manufacturersAllowed: string[];
  manufacturerPreferred: string | null;
  accessories: string | null;
  specSection: string | null;
  specParagraph: string | null;
  otherNote: string | null;
  notes: string | null;
};

/** List HVAC_Thickness (BC). No Mike code. */
export const SPEC_THICKNESSES = [0.25, 0.5, 0.75, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 7, 8];

/** List HVAC_Pipe_Size (BD). No Mike code. */
export const SPEC_PIPE_SIZES = [
  0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1, 1.125, 1.25, 1.375, 1.5, 1.75, 2, 2.5, 3, 3.5,
  ...Array.from({ length: 57 }, (_, i) => i + 4),
];

const INCH_FRAC: Record<string, string> = {
  '0.25': '1/4"',
  '0.375': '3/8"',
  '0.5': '1/2"',
  '0.625': '5/8"',
  '0.75': '3/4"',
  '0.875': '7/8"',
  '1.125': '1-1/8"',
  '1.25': '1-1/4"',
  '1.375': '1-3/8"',
};

/** Dropdown chip — same `{ value, label, sortOrder }` shape as spec-facings. */
export function specInchOption(value: number, sortOrder: number): { value: number; label: string; sortOrder: number } {
  const key = String(value);
  const label = INCH_FRAC[key] ?? `${value}"`;
  return { value, label, sortOrder };
}

export type SpecSheetSystemCat = {
  kind: string;
  systemName: string;
  code: string;
  unit: string;
};
export type SpecSheetAreaCat = { areaName: string; code: string };
export type SpecSheetMaterialCat = {
  kind: string;
  description: string;
  code: string;
  facing: string | null;
  jacket: string | null;
  thicknessIn: number | null;
  weight: number | null;
};
export type SpecSheetCatalogs = {
  systems: SpecSheetSystemCat[];
  areas: SpecSheetAreaCat[];
  materials: SpecSheetMaterialCat[];
  helpers?: HelperMapEntry[];
};

export type SpecSheet = {
  id: string;
  kind: SpecSheetKind;
  title: string;
  specNumber: string | null;
  rows: SpecSheetRow[];
  footerNote: string | null;
  imageAttachmentIds: number[];
};

const KIND_TITLE: Record<SpecSheetKind, string> = {
  duct: 'Duct Insulation',
  hydronic: 'HVAC Piping Insulation',
  plumbing: 'Plumbing Piping Insulation',
  equipment: 'Equipment Insulation',
};

function emptyRow(i: number): SpecSheetRow {
  return {
    id: `row-${i + 1}`,
    systemName: null,
    systemCode: null,
    unit: null,
    areaName: null,
    areaCode: null,
    sizeMin: null,
    sizeMax: null,
    sizeMode: null,
    ductShape: null,
    insulationFamily: null,
    materialName: null,
    materialCode: null,
    thicknessIn: null,
    weight: null,
    facing: null,
    jacket: null,
    manufacturersAllowed: [],
    manufacturerPreferred: null,
    accessories: null,
    specSection: null,
    specParagraph: null,
    otherNote: null,
    notes: null,
  };
}

function nameKey(s: string | null | undefined): string {
  return String(s || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

const FINISH_TOKENS: Array<{ re: RegExp; value: string }> = [
  { re: /\basj\b/i, value: 'ASJ' },
  { re: /\bfsk\b/i, value: 'FSK' },
  { re: /\bpsk\b/i, value: 'PSK' },
  { re: /\baluminum\b/i, value: 'Aluminum' },
  { re: /\bcanvas\b/i, value: 'Canvas' },
  { re: /\bpvc\b/i, value: 'PVC' },
  { re: /\bstainless\b/i, value: 'Stainless' },
  { re: /\bvic\b/i, value: 'VIC' },
  { re: /\bplain\b/i, value: 'Plain' },
];

function facingFromName(description: string): string | null {
  // VIC + finish: helpermap pins the finish (Aluminum), not VIC.
  const vicFinish = description.match(/\bvic\b[^a-z]*\b(aluminum|canvas|pvc|stainless)\b/i);
  if (vicFinish) {
    const hit = FINISH_TOKENS.find((t) => t.re.test(vicFinish[1]));
    return hit?.value ?? null;
  }
  for (const t of FINISH_TOKENS) {
    if (t.re.test(description)) return t.value;
  }
  return null;
}

function fracToNumber(raw: string): number | null {
  const f = raw.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (f) {
    const n = Number(f[1]) / Number(f[2]);
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** Duct List BR: `1.5" 3/4lb Duct Wrap`, `2" 3lb Board FSK w/Canvas`. */
function parseDuctEncoded(description: string): {
  thicknessIn: number;
  weight: number;
  facing: string | null;
  jacket: string | null;
} | null {
  const m = description
    .trim()
    .match(/^(\d+(?:\.\d+)?)"\s+(\d+\s*\/\s*\d+|\d+(?:\.\d+)?)\s*lb\b(.*)$/i);
  if (!m) return null;
  const thicknessIn = Number(m[1]);
  const weight = fracToNumber(m[2].replace(/\s+/g, ''));
  if (!Number.isFinite(thicknessIn) || weight == null) return null;
  const rest = m[3] || '';
  const jacketHit = rest.match(/w\/\s*(canvas|pvc|weather\s*proof(?:\s*jacket)?)/i);
  let jacket: string | null = null;
  if (jacketHit) {
    const j = jacketHit[1].toLowerCase();
    jacket = j.startsWith('weather') ? 'Weather Proof' : j === 'pvc' ? 'PVC' : 'Canvas';
  }
  return { thicknessIn, weight, facing: facingFromName(rest), jacket };
}

/** Facing / jacket / duct thick+wt implied by List material name (+ optional AV jacket). */
export function implyMaterialFields(
  description: string,
  fieldJacket?: string | null,
): {
  facing: string | null;
  jacket: string | null;
  thicknessIn: number | null;
  weight: number | null;
} {
  const jacketFromList = fieldJacket?.trim() ? fieldJacket.trim().slice(0, 40) : null;
  const duct = parseDuctEncoded(description);
  if (duct) {
    return {
      facing: duct.facing,
      jacket: jacketFromList || duct.jacket,
      thicknessIn: duct.thicknessIn,
      weight: duct.weight,
    };
  }
  return {
    facing: facingFromName(description),
    jacket: jacketFromList,
    thicknessIn: null,
    weight: null,
  };
}

/**
 * Codes are never typed. Re-derive from names against List masters.
 * Implied facing/jacket/thick/wt fill only when the row left them blank (PJ override wins).
 */
export function fillSpecSheetCodes(sheets: SpecSheet[], catalogs: SpecSheetCatalogs): SpecSheet[] {
  return sheets.map((sheet) => ({
    ...sheet,
    rows: sheet.rows.map((row) => fillOneRow(row, sheet.kind, catalogs)),
  }));
}

function fillOneRow(row: SpecSheetRow, kind: SpecSheetKind, cat: SpecSheetCatalogs): SpecSheetRow {
  const sys = row.systemName
    ? cat.systems.find((s) => s.kind === kind && nameKey(s.systemName) === nameKey(row.systemName))
    : undefined;
  const area = row.areaName
    ? cat.areas.find((a) => nameKey(a.areaName) === nameKey(row.areaName))
    : undefined;
  let mat = row.materialName
    ? cat.materials.find((m) => m.kind === kind && nameKey(m.description) === nameKey(row.materialName))
    : undefined;
  // Duct sheet types live on HVAC AZ (kind=hydronic), e.g. FIBERGLASS DUCT WRAP / DUW.
  if (!mat && row.materialName) {
    mat = cat.materials.find((m) => nameKey(m.description) === nameKey(row.materialName));
  }
  if (!mat && row.materialCode) {
    const code = row.materialCode.trim().toLowerCase();
    mat = cat.materials.find((m) => (m.code || '').trim().toLowerCase() === code);
  }
  if (!mat && row.materialName && cat.helpers?.length) {
    const resolved = resolveMaterial(row.materialName, cat.helpers);
    const phrase = resolved.specPhrase;
    if (phrase) {
      mat =
        cat.materials.find((m) => m.kind === kind && nameKey(m.description) === nameKey(phrase)) ||
        cat.materials.find((m) => nameKey(m.description) === nameKey(phrase));
    }
  }
  const next: SpecSheetRow = {
    ...row,
    systemCode: sys ? sys.code || null : null,
    unit: sys ? sys.unit || null : null,
    areaCode: area ? area.code || null : null,
    materialCode: mat ? mat.code || null : row.materialCode,
    materialName: row.materialName || (mat ? mat.description : null),
    sizeMode: row.sizeMode || SIZE_MODE_BY_KIND[kind],
  };
  if (mat) {
    if (next.facing == null && mat.facing) next.facing = mat.facing;
    if (next.jacket == null && mat.jacket) next.jacket = mat.jacket;
    if (next.thicknessIn == null && mat.thicknessIn != null) next.thicknessIn = Number(mat.thicknessIn);
    if (next.weight == null && mat.weight != null) next.weight = Number(mat.weight);
    if (next.insulationFamily == null) next.insulationFamily = classifyInsulationFamily(mat.description);
  } else if (next.materialName && next.insulationFamily == null) {
    next.insulationFamily = classifyInsulationFamily(next.materialName);
  }
  if (row.materialName && (next.sizeMin == null || next.thicknessIn == null)) {
    const roll = parseRollDims(row.materialName);
    const pipe = parseLineItemName(row.materialName);
    if (next.sizeMin == null && pipe.sizeNum != null && roll.sfPerRoll == null) {
      next.sizeMin = pipe.sizeNum;
      if (next.sizeMax == null) next.sizeMax = pipe.sizeNum;
    }
    if (next.thicknessIn == null) {
      next.thicknessIn = roll.thickIn ?? pipe.thickNum;
    }
  }
  return next;
}

export function specSheetLookupsMeta() {
  return {
    systems: 'GET /lookups/bidding/spec-systems?kind=duct|hydronic|plumbing|equipment',
    areas: 'GET /lookups/bidding/spec-areas',
    materials:
      'GET /lookups/bidding/spec-materials?family=<id>&layer=insulation  (bare GET → []. code= / q= skip)',
    facings: 'GET /lookups/bidding/spec-facings  (layer 1 factory jacket)',
    coverings: 'process-meta.specSheetEditor.coverings  (layer 2 field jacket)',
    manufacturers: 'process-meta.specSheetEditor.manufacturers',
    families: 'process-meta.specSheetEditor.families',
    sizes: 'GET /lookups/bidding/spec-sizes?code=  (pipe NPS; duct uses circumference on the row)',
    thicknesses: 'GET /lookups/bidding/spec-thicknesses?code=',
    codeSkip: 'GET /lookups/bidding/spec-materials?code=FGA  — Mike code column, not a dropdown',
  };
}

export function specSheetTemplate(kind: SpecSheetKind): SpecSheet {
  return {
    id: `new-${kind}`,
    kind,
    title: KIND_TITLE[kind],
    specNumber: null,
    rows: Array.from({ length: EMPTY_DATA_ROWS }, (_, i) => emptyRow(i)),
    footerNote: null,
    imageAttachmentIds: [],
  };
}

export function specSheetTemplatesMeta() {
  return SPEC_SHEET_KINDS.map((id) => ({
    id,
    label: KIND_TITLE[id],
    systemKindHints: SPEC_KIND_SYSTEM_HINTS[id],
    empty: specSheetTemplate(id),
  }));
}

export function normalizeSpecSheets(raw: unknown): SpecSheet[] {
  if (!Array.isArray(raw)) return [];
  if (raw.length > MAX_SPEC_SHEETS) {
    throw new Error(`process.specSheets max ${MAX_SPEC_SHEETS}`);
  }
  const sheets = raw.map((item, i) => normalizeOne(item, i));
  const ids = new Set<string>();
  for (const s of sheets) {
    if (ids.has(s.id)) throw new Error(`process.specSheets duplicate id ${s.id}`);
    ids.add(s.id);
  }
  return sheets;
}

function coerceKind(raw: unknown): SpecSheetKind {
  return specSheetKind(raw == null ? '' : String(raw)) ?? 'duct';
}

function numOrNull(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function strOrNull(v: unknown, max: number): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
}

function strList(raw: unknown, maxItems: number, maxLen: number): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const s = String(item ?? '').trim().slice(0, maxLen);
    if (!s) continue;
    const k = s.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
    if (out.length >= maxItems) break;
  }
  return out;
}

function asEnum<T extends string>(raw: unknown, allowed: readonly T[]): T | null {
  const s = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  return (allowed as readonly string[]).includes(s) ? (s as T) : null;
}

function normalizeRow(raw: unknown, index: number, sheetIndex: number): SpecSheetRow {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const sizeMin = numOrNull(o.sizeMin);
  const sizeMax = numOrNull(o.sizeMax);
  if (sizeMin != null && sizeMax != null && sizeMax < sizeMin) {
    throw new Error(`specSheets[${sheetIndex}].rows[${index}] sizeMax < sizeMin`);
  }
  return {
    id: String(o.id || `row-${index + 1}`).slice(0, 80),
    systemName: strOrNull(o.systemName, 200),
    systemCode: strOrNull(o.systemCode, 20),
    unit: strOrNull(o.unit, 20),
    areaName: strOrNull(o.areaName, 100),
    areaCode: strOrNull(o.areaCode, 20),
    sizeMin,
    sizeMax,
    sizeMode: asEnum(o.sizeMode, SIZE_MODES),
    ductShape: asEnum(o.ductShape, DUCT_SHAPES),
    insulationFamily: asEnum(o.insulationFamily, INSULATION_FAMILIES),
    materialName: strOrNull(o.materialName, 200),
    materialCode: strOrNull(o.materialCode, 20),
    thicknessIn: numOrNull(o.thicknessIn),
    weight: numOrNull(o.weight),
    facing: strOrNull(o.facing, 40),
    jacket: strOrNull(o.jacket, 40),
    manufacturersAllowed: strList(o.manufacturersAllowed, 8, 80),
    manufacturerPreferred: strOrNull(o.manufacturerPreferred, 80),
    accessories: strOrNull(o.accessories, 500),
    specSection: strOrNull(o.specSection, 40),
    specParagraph: strOrNull(o.specParagraph, 40),
    otherNote: strOrNull(o.otherNote, 500),
    notes: strOrNull(o.notes, 500),
  };
}

function normalizeOne(raw: unknown, index: number): SpecSheet {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const kind = coerceKind(o.kind ?? o.template);
  const fallback = specSheetTemplate(kind);
  const title = strOrNull(o.title, 200) || fallback.title;
  let rows: SpecSheetRow[];
  if (Array.isArray(o.rows)) {
    rows = o.rows.map((r, i) => normalizeRow(r, i, index));
  } else {
    // ponytail: old FortuneSheet { cells, merges } — drop the grid, keep the sheet shell
    rows = fallback.rows.map((r, i) => ({ ...r, id: `row-${i + 1}` }));
  }
  if (rows.length > MAX_SPEC_ROWS) throw new Error(`specSheets[${index}] rows max ${MAX_SPEC_ROWS}`);
  const rowIds = new Set<string>();
  for (const r of rows) {
    if (rowIds.has(r.id)) throw new Error(`specSheets[${index}] duplicate row id ${r.id}`);
    rowIds.add(r.id);
  }
  const imageAttachmentIds = Array.isArray(o.imageAttachmentIds)
    ? o.imageAttachmentIds
        .map((n) => Number(n))
        .filter((n) => Number.isFinite(n) && n > 0)
        .slice(0, MAX_SPEC_IMAGES)
    : [];
  return {
    id: String(o.id || `sheet-${index + 1}`).slice(0, 80),
    kind,
    title,
    specNumber: strOrNull(o.specNumber, 40),
    rows,
    footerNote: strOrNull(o.footerNote, 2000),
    imageAttachmentIds,
  };
}
