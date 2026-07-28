/**
 * Pure Specs Plumb matching (Excel-parity).
 * Qty Estimated / Prod/Hr: size + thickness + material base (system NOT filtered).
 * Qty Received: Trimble line-item name parse + keyword.
 * Structshare: catalog MIN positive price.
 */

export type HelperMapEntry = {
  specPhrase: string;
  keyword: string;
  keyword2?: string | null;
  rawPrefix?: string | null;
  baseName?: string | null;
};

export type MikeRollupRow = {
  size: number | null;
  thickness: number | null;
  quantity: number;
  hours: number | null;
  materialBase: string | null;
  materialPhrase?: string | null;
  systemName?: string | null;
  discipline?: string | null;
};

export type SpecLineInput = {
  systemName: string;
  areaName?: string | null;
  insulation: string;
  size: number;
  thickness: number;
  weight?: string | null;
  facing?: string | null;
};

export type LineItemRow = {
  itemName: string;
  received: number;
};

export type CatalogItem = {
  itemName: string;
  price: number | null;
  nameLc: string;
  size1: number | null;
  size2: number | null;
};

/**
 * How Structshare catalog dimensions map to a Spec line.
 * - pipe: size1 = opening/IPS size, size2 = insulation thickness (Excel Specs Plumb)
 * - roll: size1 = insulation thickness only; size2 is roll width — ignore (duct wrap, etc.)
 *
 * ponytail: registry by helpermap baseName. New family that isn't pipe-sized → add one line here
 * (or later a MatchMode column on Bid_HelperMap).
 */
export type CatalogMatchMode = 'pipe' | 'roll';

export type MaterialResolution = {
  specPhrase: string;
  keyword: string | null;
  baseName: string | null;
  matchMode: CatalogMatchMode;
  weight: string | null;
  facing: string | null;
};

const BASE_SEARCH_ORDER = [
  'Fiberglass',
  'Flex Tubing',
  'Foamglas',
  'Mineral Wool',
  'Calcium Silicate',
  'Duct Wrap',
] as const;

const MATCH_MODE_BY_BASE: Record<string, CatalogMatchMode> = {
  'duct wrap': 'roll',
  'pipe and tank wrap': 'roll',
};

/** When Mike only names the family (e.g. "2 .75# Ductwrap"), pick this Spec list phrase. */
const DEFAULT_SPEC_BY_BASE: Record<string, string> = {
  'duct wrap': 'FIBERGLASS DUCT WRAP',
};

const FACING_TOKENS = [
  'aluminum',
  'canvas',
  'pvc',
  'stainless',
  'asj',
  'fsk',
  'psk',
  'vic',
  'plain',
] as const;

/** Dropdown values for Spec line `facing` (Excel “Facing (FSK/ASJ)” + helpermap keyword2). */
export const SPEC_FACING_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'ASJ', label: 'ASJ' },
  { value: 'FSK', label: 'FSK' },
  { value: 'PSK', label: 'PSK' },
  { value: 'Aluminum', label: 'Aluminum' },
  { value: 'Canvas', label: 'Canvas' },
  { value: 'PVC', label: 'PVC' },
  { value: 'Stainless', label: 'Stainless' },
  { value: 'VIC', label: 'VIC' },
  { value: 'Plain', label: 'Plain' },
];

function normKey(s: string): string {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9#./]/g, '');
}

export function matchModeForBase(baseName: string | null | undefined): CatalogMatchMode {
  if (!baseName) return 'pipe';
  return MATCH_MODE_BY_BASE[baseName.trim().toLowerCase()] || 'pipe';
}

function helperBase(h: HelperMapEntry): string | null {
  return h.baseName?.trim() || null;
}

function findHelperBySpec(helpers: HelperMapEntry[], phrase: string): HelperMapEntry | undefined {
  const lower = phrase.trim().toLowerCase();
  return helpers.find((h) => h.specPhrase.trim().toLowerCase() === lower);
}

function defaultSpecForBase(helpers: HelperMapEntry[], base: string): string | null {
  const prefer = DEFAULT_SPEC_BY_BASE[base.trim().toLowerCase()];
  if (prefer) {
    const hit = findHelperBySpec(helpers, prefer);
    if (hit) return hit.specPhrase;
  }
  const withBase = helpers.find((h) => (helperBase(h) || '').toLowerCase() === base.toLowerCase());
  return withBase?.specPhrase ?? null;
}

export function parseFacingHint(phrase: string | null | undefined): string | null {
  const n = normKey(phrase || '');
  if (!n) return null;
  for (const f of FACING_TOKENS) {
    if (n.includes(f)) return f;
  }
  return null;
}

/**
 * Density for Structshare weight mask.
 * Mike often encodes thick + density: "2 .75# Ductwrap" (UI may mangle to "2.75#").
 */
export function parseDensityWeight(phrase: string | null | undefined): string | null {
  const p = (phrase || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!p) return null;
  const frac = p.match(/\b(\d+\/\d+)\s*#/);
  if (frac) return frac[1];
  const spaced = p.match(/\b\d+\s+(\.\d+)\s*#/);
  if (spaced) return spaced[1].startsWith('.') ? `0${spaced[1]}` : spaced[1];
  // Roll families: "2.75#" usually means 2" + .75#, not 2.75 pcf
  if (matchModeForBase(inferBaseFromText(p)) === 'roll') {
    const mangled = p.match(/\b(\d+)\.(75)\s*#/);
    if (mangled) return '0.75';
  }
  const dec = p.match(/\b(\d+\.\d+|\.\d+)\s*#/);
  if (dec) return dec[1].startsWith('.') ? `0${dec[1]}` : dec[1];
  const whole = p.match(/\b(\d+)\s*#/);
  return whole ? whole[1] : null;
}

/** Lightweight base guess without helpers (Mike import / roll density quirk). */
function inferBaseFromText(text: string): string | null {
  const n = normKey(text);
  if (n.includes('ductwrap') || n.includes('greaseduct')) return 'Duct Wrap';
  if (n.includes('pipeandtankwrap') || n.includes('tankwrap')) return 'Pipe and Tank Wrap';
  for (const token of BASE_SEARCH_ORDER) {
    if (n.includes(normKey(token))) return token;
  }
  return null;
}

/** Map common Mike material phrases onto List / helpermap Spec phrases. */
function mikePhraseToListSpec(phrase: string): string | null {
  const n = normKey(phrase);
  if (!n) return null;
  if (n.includes('ductwrap')) return null;
  if (n.includes('pipeandtankwrap') || n.includes('tankwrap')) return 'Pipe and Tank Wrap';
  if (n.includes('firemaster') || n.includes('fyrewrap') || n.includes('greaseduct')) {
    return 'Grease Duct Wrap';
  }
  if (n.includes('polyiso') || n.includes('urethane') || n.includes('polyurethane')) {
    return null; // not in seeded List — leave unmapped
  }
  if ((n.includes('fsk') || n.includes('asj')) && (n.includes('alum') || n.includes('aluminum'))) {
    return 'Fiberglass w/ Aluminum';
  }
  if (n.includes('asj')) return 'Fiberglass with ASJ';
  if (n.includes('fsk') && n.includes('duct')) return 'FIBERGLASS DUCT WRAP';
  return null;
}

function resolveMaterialFromHelper(h: HelperMapEntry, rawPhrase: string): MaterialResolution {
  const base = helperBase(h) || inferBaseFromText(h.specPhrase) || inferBaseFromText(rawPhrase);
  return {
    specPhrase: h.specPhrase,
    keyword: h.keyword?.trim() || null,
    baseName: base,
    matchMode: matchModeForBase(base),
    weight: parseDensityWeight(rawPhrase),
    facing: parseFacingHint(rawPhrase) || (h.keyword2?.trim().toLowerCase() || null),
  };
}

/**
 * Resolve any Mike / Spec / free-text insulation string against helpermap.
 * Order: exact Spec phrase → longest rawPrefix → longest keyword (fuzzy) → base token.
 */
export function resolveMaterial(
  text: string,
  helpers: HelperMapEntry[],
): MaterialResolution {
  const raw = (text || '').trim();
  const empty: MaterialResolution = {
    specPhrase: raw,
    keyword: null,
    baseName: null,
    matchMode: 'pipe',
    weight: parseDensityWeight(raw),
    facing: parseFacingHint(raw),
  };
  if (!raw) return empty;
  const lower = raw.toLowerCase();

  // Mike exports often use density+facing phrases instead of List Spec names
  const mikeHint = mikePhraseToListSpec(raw);
  if (mikeHint && mikeHint.trim().toLowerCase() !== lower) {
    const hinted = findHelperBySpec(helpers, mikeHint);
    if (hinted) return resolveMaterialFromHelper(hinted, raw);
  }

  const exact = findHelperBySpec(helpers, raw);
  if (exact) return resolveMaterialFromHelper(exact, raw);

  let bestPrefix: HelperMapEntry | null = null;
  for (const h of helpers) {
    const prefix = (h.rawPrefix || '').trim();
    if (!prefix || !lower.includes(prefix.toLowerCase())) continue;
    if (!bestPrefix || prefix.length > (bestPrefix.rawPrefix || '').length) bestPrefix = h;
  }
  if (bestPrefix) return resolveMaterialFromHelper(bestPrefix, raw);

  const hay = normKey(raw);
  let bestKw: HelperMapEntry | null = null;
  let bestLen = 0;
  for (const h of helpers) {
    const kw = (h.keyword || '').trim();
    if (!kw) continue;
    const kn = normKey(kw);
    if (kn.length < 3 || !hay.includes(kn)) continue;
    const facing = (h.keyword2 || '').trim().toLowerCase();
    const facingOk = !facing || hay.includes(normKey(facing));
    const score = kn.length + (facingOk && facing ? 10 : 0);
    if (score > bestLen) {
      bestLen = score;
      bestKw = h;
    }
  }
  if (bestKw) {
    let base = helperBase(bestKw);
    if (!base) base = inferBaseFromText(raw);
    // Prefer canonical Spec for the family when phrase is generic (no facing cue)
    const facing = parseFacingHint(raw);
    let spec = bestKw.specPhrase;
    if (!facing && base) {
      const def = defaultSpecForBase(helpers, base);
      if (def) spec = def;
    } else if (facing) {
      const faced = helpers.find(
        (h) =>
          normKey(h.keyword || '') === normKey(bestKw!.keyword || '') &&
          (h.keyword2 || '').trim().toLowerCase() === facing,
      );
      if (faced) spec = faced.specPhrase;
    }
    const hit = findHelperBySpec(helpers, spec) || bestKw;
    base = helperBase(hit) || base;
    return {
      specPhrase: hit.specPhrase,
      keyword: hit.keyword?.trim() || bestKw.keyword?.trim() || null,
      baseName: base,
      matchMode: matchModeForBase(base),
      weight: parseDensityWeight(raw),
      facing: facing || (hit.keyword2?.trim().toLowerCase() || null),
    };
  }

  const inferred = inferBaseFromText(raw);
  if (inferred) {
    const spec = defaultSpecForBase(helpers, inferred) || inferred;
    const hit = findHelperBySpec(helpers, spec);
    const base = (hit && helperBase(hit)) || inferred;
    return {
      specPhrase: hit?.specPhrase || spec,
      keyword: hit?.keyword?.trim() || null,
      baseName: base,
      matchMode: matchModeForBase(base),
      weight: parseDensityWeight(raw),
      facing: parseFacingHint(raw),
    };
  }

  return empty;
}

/** @deprecated use resolveMaterial — kept for call sites / checks */
export function isDuctWrapPhrase(text: string | null | undefined): boolean {
  return matchModeForBase(inferBaseFromText(text || '')) === 'roll' &&
    /duct/i.test(text || '');
}

export function isDuctWrapKeyword(keyword: string | null | undefined): boolean {
  const kw = (keyword || '').trim().toLowerCase();
  return kw === 'duct wrap' || kw.includes('duct wrap');
}

/** Collapse Mike phrases onto helpermap baseName via resolveMaterial. */
export function normalizeMaterialBase(
  base: string | null | undefined,
  phrase?: string | null,
  helpers?: HelperMapEntry[],
): string | null {
  const text = (phrase || base || '').trim();
  if (!text) return null;
  if (helpers?.length) {
    const res = resolveMaterial(text, helpers);
    if (res.baseName) return res.baseName;
  }
  return inferBaseFromText(text) || (base || '').trim() || null;
}

export function resolveSpecInsulation(
  insulation: string,
  helpers: HelperMapEntry[],
): string {
  return resolveMaterial(insulation, helpers).specPhrase || (insulation || '').trim();
}

function cleanWeightFacing(
  value: string | null | undefined,
  placeholders: string[],
): string | null {
  const t = (value || '').trim();
  if (!t) return null;
  if (placeholders.some((p) => p.toLowerCase() === t.toLowerCase())) return null;
  return t;
}

export function deriveMaterialBase(phrase: string | null | undefined): string | null {
  const p = (phrase || '').trim();
  if (!p) return null;
  return inferBaseFromText(p) || p;
}

export function baseForInsulation(
  insulation: string,
  helpers: HelperMapEntry[],
): string | null {
  return resolveMaterial(insulation, helpers).baseName;
}

export function keywordForInsulation(
  insulation: string,
  helpers: HelperMapEntry[],
): string | null {
  return resolveMaterial(insulation, helpers).keyword;
}

export function matchModeForInsulation(
  insulation: string,
  helpers: HelperMapEntry[],
): CatalogMatchMode {
  return resolveMaterial(insulation, helpers).matchMode;
}

export function parseSystemAndType(raw: string | null | undefined): {
  discipline: string | null;
  systemCode: string | null;
  areaLetter: string | null;
  systemName: string | null;
} {
  const s = (raw || '').replace(/\s+/g, ' ').trim();
  const m = s.match(/^([A-Z])\s+([A-Z0-9]+)\s+([A-Z0-9]?)\s+(.*)$/i);
  if (!m) {
    return { discipline: null, systemCode: null, areaLetter: null, systemName: s || null };
  }
  return {
    discipline: m[1].toUpperCase(),
    systemCode: m[2].toUpperCase(),
    areaLetter: m[3] ? m[3].toUpperCase() : null,
    systemName: m[4].trim() || null,
  };
}

/** Mike leaves shape on the name: "Return Air REC", "Low Pressure Supply    RND". */
export function stripMikeSystemShape(name: string | null | undefined): string {
  return String(name || '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s+(REC|RND|OUTDO|OUTDOOR|ALL|RECT|ROUND)\s*$/i, '')
    .trim();
}

/** Mike short names → List Spec system names (EstimationFile List). */
const SYSTEM_ALIASES: Record<string, string> = {
  'low pressure supply': 'Low Pressure Supply Air',
  'medium pressure supply': 'Medium Pressure Supply Air',
  'high pressure supply': 'High Pressure Supply Air',
  exhaust: 'Exhaust Air',
  'return air': 'Return Air',
  'stairwell pressurizati': 'Stairwell Pressurization',
  'stairwell pressurization': 'Stairwell Pressurization',
  'kitchen hood exhaust': 'Kitchen Hood Exhaust',
  'dishwasher exhaust': 'Dish Washer Exhaust',
  'dish washer exhaust': 'Dish Washer Exhaust',
};

/**
 * Map Mike/Spec systemName onto a List system name for code/unit lookup.
 * `knownNames` = Bid_SpecSystems.systemName values.
 */
export function resolveSpecSystemName(
  raw: string | null | undefined,
  knownNames: string[],
): string | null {
  const cleaned = stripMikeSystemShape(raw);
  if (!cleaned) return null;
  const lower = cleaned.toLowerCase();
  const byLower = new Map(knownNames.map((n) => [n.toLowerCase(), n]));

  if (byLower.has(lower)) return byLower.get(lower)!;
  const aliased = SYSTEM_ALIASES[lower];
  if (aliased && byLower.has(aliased.toLowerCase())) return byLower.get(aliased.toLowerCase())!;

  // List name starts with Mike name (or vice versa), longest wins
  let best: string | null = null;
  for (const n of knownNames) {
    const nl = n.toLowerCase();
    if (nl.startsWith(lower) || lower.startsWith(nl)) {
      if (!best || n.length > best.length) best = n;
    }
  }
  if (best) return best;

  // Truncated Mike names: "Stairwell Pressurizati"
  for (const n of knownNames) {
    const nl = n.toLowerCase();
    if (lower.length >= 8 && (nl.startsWith(lower) || lower.startsWith(nl.slice(0, lower.length)))) {
      if (!best || n.length > best.length) best = n;
    }
  }
  return best;
}

function numEq(a: number | null | undefined, b: number): boolean {
  if (a == null || !Number.isFinite(Number(a))) return false;
  return Math.abs(Number(a) - b) < 1e-9;
}

export function parseFraction(str: string): number | null {
  const s = String(str || '').trim();
  if (!s) return null;
  if (s.includes('-') && s.includes('/')) {
    const [whole, frac] = s.split('-');
    const [n1, d1] = frac.split('/').map(Number);
    if (!Number.isFinite(Number(whole)) || !d1) return null;
    return Number(whole) + n1 / d1;
  }
  if (s.includes('/')) {
    const [n1, d1] = s.split('/').map(Number);
    if (!d1) return null;
    return n1 / d1;
  }
  const x = Number(s);
  return Number.isFinite(x) ? x : null;
}

/** Excel Qty Received name parse: size before first ", thick after last " X ". */
export function parseLineItemName(name: string): {
  sizeNum: number | null;
  thickNum: number | null;
} {
  const qi = name.indexOf('"');
  let sizeRaw = qi >= 0 ? name.slice(0, qi) : '';
  let sizeTrim = sizeRaw.trim();
  if (sizeTrim.startsWith('00-')) sizeTrim = sizeTrim.slice(3);
  const idx = name.lastIndexOf(' X ');
  const after = idx >= 0 ? name.slice(idx + 3) : '';
  const q2 = after.indexOf('"');
  const thickRaw = q2 >= 0 ? after.slice(0, q2).trim() : '';
  return {
    sizeNum: parseFraction(sizeTrim),
    thickNum: parseFraction(thickRaw),
  };
}

function keywordHit(nameLc: string, keyword: string | null): boolean {
  if (!keyword) return false;
  const kw = keyword.toLowerCase();
  if (nameLc.includes(kw)) return true;
  if (kw === 'armaflex' && nameLc.includes('armacell')) return true;
  return false;
}

export function rollupMike(
  rows: MikeRollupRow[],
  size: number,
  thickness: number,
  materialBase: string | null,
): { qtyEstimated: number; hours: number; productionPerHour: number | null } {
  if (!materialBase) {
    return { qtyEstimated: 0, hours: 0, productionPerHour: null };
  }
  let qty = 0;
  let hours = 0;
  for (const r of rows) {
    if (!numEq(r.size, size) || !numEq(r.thickness, thickness)) continue;
    if ((r.materialBase || '').trim() !== materialBase.trim()) continue;
    qty += Number(r.quantity) || 0;
    hours += Number(r.hours) || 0;
  }
  return {
    qtyEstimated: qty,
    hours,
    productionPerHour: hours > 0 ? qty / hours : null,
  };
}

/** Excel Specs Qty Received (keyword col B only — keyword2 unused). */
export function sumQtyReceived(
  lineItems: LineItemRow[],
  size: number,
  thickness: number,
  keyword: string | null,
): number {
  if (!keyword) return 0;
  let sum = 0;
  for (const li of lineItems) {
    const nameLc = li.itemName.toLowerCase();
    if (!keywordHit(nameLc, keyword)) continue;
    const { sizeNum, thickNum } = parseLineItemName(li.itemName);
    if (!numEq(sizeNum, size) || !numEq(thickNum, thickness)) continue;
    sum += Number(li.received) || 0;
  }
  return sum;
}

function weightMask(nameLc: string, weight: string | null | undefined): boolean {
  if (!weight) return true;
  const wt = String(weight).trim();
  if (!wt) return true;
  const fracMap: Record<string, string> = {
    '0.75': '3/4',
    '.75': '3/4',
    '0.5': '1/2',
    '0.25': '1/4',
    '0.125': '1/8',
  };
  const frac = fracMap[wt] || wt;
  return nameLc.includes(` ${wt}#`) || nameLc.includes(` ${frac}#`);
}

/**
 * Structshare: cheapest catalog row. Prefer price > 0; if none, allow 0/null (Excel).
 * Mode from material profile (pipe vs roll) — not hard-coded per product name.
 * Exclude elbow/radius.
 */
export function pickStructshareItem(
  catalog: CatalogItem[],
  size: number,
  thickness: number,
  keyword: string | null,
  opts?: {
    weight?: string | null;
    facing?: string | null;
    matchMode?: CatalogMatchMode;
  },
): { itemName: string; price: number } | null {
  if (!keyword) return null;
  const facing = (opts?.facing || '').trim().toLowerCase();
  const mode = opts?.matchMode || 'pipe';
  type Cand = { item: CatalogItem; price: number; positive: boolean };
  const cands: Cand[] = [];
  for (const it of catalog) {
    if (mode === 'roll') {
      if (!numEq(it.size1, thickness)) continue;
    } else if (!numEq(it.size1, size) || !numEq(it.size2, thickness)) {
      continue;
    }
    const raw = it.price == null ? null : Number(it.price);
    const price = raw != null && Number.isFinite(raw) ? raw : 0;
    const lc = it.nameLc || it.itemName.toLowerCase();
    if (lc.includes('elbow') || lc.includes('radius')) continue;
    if (!keywordHit(lc, keyword)) continue;
    if (!weightMask(lc, opts?.weight)) continue;
    if (facing && !lc.includes(facing)) continue;
    cands.push({ item: it, price, positive: price > 0 });
  }
  if (!cands.length) return null;
  const pool = cands.some((c) => c.positive) ? cands.filter((c) => c.positive) : cands;
  pool.sort((a, b) => a.price - b.price || a.item.itemName.localeCompare(b.item.itemName));
  return { itemName: pool[0].item.itemName, price: pool[0].price };
}

export function disciplineToType(d: string | null | undefined): string | null {
  const x = (d || '').toUpperCase();
  if (x === 'P') return 'Plumbing';
  if (x === 'H') return 'HVAC';
  if (x === 'D') return 'Duct';
  return null;
}

/** Group Mike rows into Spec line seeds (size×thick×base). */
export function suggestSpecLinesFromMike(
  rows: MikeRollupRow[],
  helpers: HelperMapEntry[],
): Array<{
  type: string | null;
  systemName: string;
  insulation: string;
  size: number;
  thickness: number;
  weight: string | null;
  qtyEstimated: number;
}> {
  type Agg = {
    size: number;
    thickness: number;
    base: string;
    qty: number;
    systems: Map<string, number>;
    phrases: Map<string, number>;
    disciplines: Map<string, number>;
  };
  const groups = new Map<string, Agg>();

  for (const r of rows) {
    if (r.size == null || r.thickness == null) continue;
    const base = normalizeMaterialBase(r.materialBase, r.materialPhrase, helpers);
    if (!base) continue;
    const key = `${r.size}|${r.thickness}|${base}`;
    if (!groups.has(key)) {
      groups.set(key, {
        size: Number(r.size),
        thickness: Number(r.thickness),
        base,
        qty: 0,
        systems: new Map(),
        phrases: new Map(),
        disciplines: new Map(),
      });
    }
    const g = groups.get(key)!;
    g.qty += Number(r.quantity) || 0;
    if (r.systemName) g.systems.set(r.systemName, (g.systems.get(r.systemName) || 0) + 1);
    if (r.materialPhrase) {
      g.phrases.set(r.materialPhrase, (g.phrases.get(r.materialPhrase) || 0) + 1);
    }
    if (r.discipline) {
      g.disciplines.set(r.discipline, (g.disciplines.get(r.discipline) || 0) + 1);
    }
  }

  const defaultPhrase = (base: string) =>
    defaultSpecForBase(helpers, base) ||
    helpers.find((h) => (h.baseName || '').trim() === base)?.specPhrase ||
    base;
  const topKey = (m: Map<string, number>) => {
    let best = '';
    let n = -1;
    for (const [k, v] of m) {
      if (v > n) {
        n = v;
        best = k;
      }
    }
    return best;
  };

  return [...groups.values()]
    .filter((g) => g.qty > 0)
    .sort((a, b) => b.qty - a.qty)
    .map((g) => {
      const phrase = topKey(g.phrases) || g.base;
      const resolved = resolveMaterial(phrase, helpers);
      const insulation =
        resolved.baseName === g.base || !resolved.baseName
          ? resolved.specPhrase || defaultPhrase(g.base)
          : defaultPhrase(g.base);
      const finalRes = resolveMaterial(insulation, helpers);
      return {
        type: disciplineToType(topKey(g.disciplines)),
        systemName: topKey(g.systems) || '—',
        insulation: finalRes.specPhrase || insulation,
        size: g.size,
        thickness: g.thickness,
        weight: finalRes.weight || parseDensityWeight(phrase),
        qtyEstimated: g.qty,
      };
    });
}

export function enrichSpecLine(
  line: SpecLineInput,
  helpers: HelperMapEntry[],
  mikeRows: MikeRollupRow[],
  lookups: {
    systemCode: (name: string) => string | null;
    systemUnit: (name: string) => string | null;
    materialCode: (insulation: string) => string | null;
    areaCode: (area: string) => string | null;
  },
  lineItems: LineItemRow[],
  catalog: CatalogItem[],
) {
  const resolved = resolveMaterial(line.insulation, helpers);
  const materialBase = resolved.baseName;
  const keyword = resolved.keyword;
  const insulation = resolved.specPhrase || line.insulation;
  // Caller must pass Mike rows with materialBase already normalized (once).
  // Remapping here was O(lines × mike × helpers) and hung Specs load.
  const rollup = rollupMike(mikeRows, line.size, line.thickness, materialBase);
  const qtyReceived = sumQtyReceived(lineItems, line.size, line.thickness, keyword);
  const weight =
    cleanWeightFacing(line.weight, ['wt', 'weight']) ||
    resolved.weight ||
    parseDensityWeight(line.insulation);
  const facing =
    cleanWeightFacing(line.facing, ['facing']) ||
    (resolved.facing && !['plain'].includes(resolved.facing) ? resolved.facing : null);
  const struct = pickStructshareItem(catalog, line.size, line.thickness, keyword, {
    weight,
    facing,
    matchMode: resolved.matchMode,
  });
  return {
    code: lookups.systemCode(line.systemName),
    areaCode: line.areaName ? lookups.areaCode(line.areaName) : null,
    materialCode: lookups.materialCode(insulation),
    unit: lookups.systemUnit(line.systemName),
    materialBase,
    keyword,
    catalogMatchMode: resolved.matchMode,
    qtyEstimated: rollup.qtyEstimated,
    productionPerHour: rollup.productionPerHour,
    qtyReceived,
    qtyRemain: rollup.qtyEstimated - qtyReceived,
    structshareItem: struct?.itemName ?? null,
    structshareUnitPrice: struct?.price ?? null,
  };
}
