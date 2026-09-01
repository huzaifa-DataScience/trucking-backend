/**
 * Pure Specs Plumb matching (Excel-parity).
 * Qty Estimated / Prod/Hr:
 *   pipe → size + thickness + material base (system NOT filtered)
 *   roll → thickness + insulation base + wt/facing (size/system/area ignored); PPH = Σqty/Σhours
 * Qty Received: Trimble name parse + keyword (pipe: size×thick; roll: thick only).
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
  /** Trimble / StructShare UoM (e.g. Roll, LF, SF) — from line-items export. */
  unit?: string | null;
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
  // helpermap seeds BaseName on faced rows first (Aluminum before ASJ) — pin the usual pipe Spec
  fiberglass: 'Fiberglass with ASJ',
  foamglas: 'Foamglas',
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
  const bl = base.toLowerCase();
  const withBase = helpers.filter((h) => (helperBase(h) || '').toLowerCase() === bl);
  // Prefer plain / no-facing Spec over first faced row (seed order is not canonical)
  const plain = withBase.find((h) => {
    const f = (h.keyword2 || '').trim().toLowerCase();
    return !f || f === 'plain';
  });
  return (plain || withBase[0])?.specPhrase ?? null;
}

export function parseFacingHint(phrase: string | null | undefined): string | null {
  const n = normKey(phrase || '');
  if (!n) return null;
  for (const f of FACING_TOKENS) {
    if (n.includes(f)) return f;
  }
  return null;
}

/** Map raw facing token → Spec dropdown value (FSK, ASJ, …). */
export function normalizeFacingOption(facing: string | null | undefined): string | null {
  if (!facing) return null;
  const hit = SPEC_FACING_OPTIONS.find((o) => o.value.toLowerCase() === facing.toLowerCase());
  return hit ? hit.value : null;
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
  // Mike duct board: "2 3# FSK" (thick + density + facing, no "ductwrap" token)
  if (isMikeDuctBoardFsk(n)) return 'Duct Wrap';
  if (n.includes('pipeandtankwrap') || n.includes('tankwrap')) return 'Pipe and Tank Wrap';
  for (const token of BASE_SEARCH_ORDER) {
    if (n.includes(normKey(token))) return token;
  }
  return null;
}

/** Density+# FSK / bare FSK board — not pipe covering / ASJ / Armaflex. */
function isMikeDuctBoardFsk(n: string): boolean {
  if (!n.includes('fsk')) return false;
  if (n.includes('asj') || n.includes('arma') || n.includes('pipecovering')) return false;
  // "2 3# FSK", "3#FSK", or FSK with duct token
  return /#fsk|\dfsk/.test(n) || n.includes('duct');
}

/** Map common Mike material phrases onto List / helpermap Spec phrases. */
function mikePhraseToListSpec(phrase: string): string | null {
  const n = normKey(phrase);
  if (!n) return null;
  // Foamglas before ASJ→Fiberglass — Mike "FoamGlas w/ ASJ" is NOT fiberglass
  if (n.includes('foamglas') || n.includes('foamglass')) {
    if (n.includes('pvc') && n.includes('vic')) return 'Foamglas  w/VIC/ PVC';
    if (n.includes('pvc')) return 'Foamglas  w/ PVC';
    if (n.includes('alum') || n.includes('aluminum')) return 'Foamglas w/ Aluminum';
    if (n.includes('canvas')) return 'Foamglas w/ Canvas';
    if (n.includes('stainless')) return 'Foamglas w/ Stainless';
    if (n.includes('vic')) return 'Foamglas w/VIC';
    // ASJ / bare FoamGlas — List has no Foamglas+ASJ row; keep family via keyword/infer
    return null;
  }
  if (n.includes('pipeandtankwrap') || n.includes('tankwrap')) return 'Pipe and Tank Wrap';
  if (n.includes('firemaster') || n.includes('fyrewrap') || n.includes('greaseduct')) {
    return 'Grease Duct Wrap';
  }
  // Prefer canonical roll Spec (not "DUCT WRAP ON FTGS" via fuzzy keyword)
  if (n.includes('ductwrap')) return 'FIBERGLASS DUCT WRAP';
  if (n.includes('polyiso') || n.includes('urethane') || n.includes('polyurethane')) {
    return null; // not in seeded List — leave unmapped
  }
  if ((n.includes('fsk') || n.includes('asj')) && (n.includes('alum') || n.includes('aluminum'))) {
    return 'Fiberglass w/ Aluminum';
  }
  if (n.includes('asj')) return 'Fiberglass with ASJ';
  // Was: only when phrase also contains "duct" — Mike uses bare "2 3# FSK"
  if (isMikeDuctBoardFsk(n)) return 'FIBERGLASS DUCT WRAP';
  // Mike plumbing often exports bare "Fiberglass" (ASJ is implied / on Spec facing)
  if (n === 'fiberglass') return 'Fiberglass with ASJ';
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
  opts?: { facingHint?: string | null },
): MaterialResolution {
  // Mike CSV sometimes leaves a trailing quote on the Spec phrase cell
  const raw = (text || '').trim().replace(/^["']+|["']+$/g, '').trim();
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
  const hintFace = (() => {
    const h = (opts?.facingHint || '').trim().toLowerCase();
    if (!h || h === 'plain') return null;
    return parseFacingHint(h) || h;
  })();

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
  const phraseFacing = parseFacingHint(raw) || hintFace;
  let bestKw: HelperMapEntry | null = null;
  let bestLen = 0;
  for (const h of helpers) {
    const kw = (h.keyword || '').trim();
    if (!kw) continue;
    const kn = normKey(kw);
    if (kn.length < 3 || !hay.includes(kn)) continue;
    const facing = (h.keyword2 || '').trim().toLowerCase();
    const facingOk = !facing || hay.includes(normKey(facing)) || facing === phraseFacing;
    // Bare family name: prefer helpers without a facing lock (don't crown Aluminum first)
    const bareBonus = !phraseFacing && !facing ? 5 : 0;
    const faceBonus = facingOk && facing && (hay.includes(normKey(facing)) || facing === phraseFacing) ? 10 : 0;
    const score = kn.length + faceBonus + bareBonus;
    if (score > bestLen) {
      bestLen = score;
      bestKw = h;
    }
  }
  if (bestKw) {
    let base = helperBase(bestKw);
    if (!base) base = inferBaseFromText(raw);
    // Prefer canonical Spec for the family when phrase is generic (no facing cue)
    const facing = phraseFacing;
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
    base = helperBase(hit) || base || inferBaseFromText(hit.specPhrase);
    return {
      specPhrase: hit.specPhrase,
      keyword: hit.keyword?.trim() || bestKw.keyword?.trim() || null,
      baseName: base,
      matchMode: matchModeForBase(base),
      weight: parseDensityWeight(raw),
      // Prefer phrase/line facing; else the chosen Spec's keyword2 (e.g. ASJ default)
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
  const text = (phrase || base || '').trim().replace(/^["']+|["']+$/g, '').trim();
  if (!text) return null;
  if (helpers?.length) {
    const res = resolveMaterial(text, helpers);
    if (res.baseName) return res.baseName;
  }
  const inferred = inferBaseFromText(text);
  if (inferred) return inferred;
  const baseClean = (base || '').trim().replace(/^["']+|["']+$/g, '').trim();
  // Don't keep unresolved density+#FSK board phrases as a fake pipe base
  if (baseClean && isMikeDuctBoardFsk(normKey(baseClean))) return 'Duct Wrap';
  return baseClean || null;
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

export type RollDims = {
  thickIn: number | null;
  widthIn: number | null;
  lengthFt: number | null;
  /** widthIn/12 × lengthFt — vendor (300SF/RL) ignored when dims parse. */
  sfPerRoll: number | null;
};

/**
 * Roll catalog/Trimble names: `01-1/2" X 48" X 100'` or `02" X 48" X75'`.
 * SF = width(ft) × length(ft). Do not trust parenthetical SF/RL when dims exist.
 */
export function parseRollDims(name: string): RollDims {
  const empty: RollDims = { thickIn: null, widthIn: null, lengthFt: null, sfPerRoll: null };
  const s = String(name || '').trim();
  if (!s) return empty;
  // thick" X width" X length'
  const m = s.match(
    /(\d+(?:-\d+\/\d+|\.\d+|\/\d+)?)\s*"\s*X\s*(\d+(?:\.\d+)?)\s*"\s*X\s*(\d+(?:\.\d+)?)\s*'/i,
  );
  if (!m) return empty;
  const thickIn = parseFraction(m[1]);
  const widthIn = Number(m[2]);
  const lengthFt = Number(m[3]);
  if (!Number.isFinite(widthIn) || !Number.isFinite(lengthFt) || widthIn <= 0 || lengthFt <= 0) {
    return { thickIn, widthIn: null, lengthFt: null, sfPerRoll: null };
  }
  const sfPerRoll = (widthIn / 12) * lengthFt;
  return { thickIn, widthIn, lengthFt, sfPerRoll };
}

function keywordHit(nameLc: string, keyword: string | null): boolean {
  if (!keyword) return false;
  const kw = keyword.toLowerCase();
  if (nameLc.includes(kw)) return true;
  if (kw === 'armaflex' && nameLc.includes('armacell')) return true;
  return false;
}

/**
 * Strip manufacturer / vendor branding from a catalog/Trimble item name for Structshare display.
 * Vendor is not a separate field — it rides inside the string (e.g. JOHNS MANVILLE (JM)).
 */
export function stripVendorFromItemName(name: string): string {
  let s = String(name || '');
  const patterns: RegExp[] = [
    /\bjohns?\s*manville\b(\s*\(\s*jm\s*\))?/gi,
    /\bowens\s*corning\b(\s*\(\s*oc\s*\))?/gi,
    /\bknauf(\s+insulation)?\b/gi,
    /\bcertainteed\b/gi,
    /\barmacell\b/gi,
    /\brockwool\b/gi,
    /\bmanson\s*(insulation)?\b/gi,
    /\bjohn\s*manville\b/gi,
    /\(\s*jm\s*\)/gi,
    /\(\s*oc\s*\)/gi,
    /\brs\s*means\b/gi,
  ];
  for (const p of patterns) s = s.replace(p, ' ');
  return s.replace(/\s{2,}/g, ' ').replace(/\s+([,)\]])/g, '$1').trim();
}

export type SearchAttrOpts = {
  matchMode?: CatalogMatchMode;
  weight?: string | null;
  facing?: string | null;
};

/** Prefer wt+facing, then drop facing, then drop weight, then keyword+dims only. */
function attrFallbackSteps(
  weight?: string | null,
  facing?: string | null,
): Array<{ useWeight: boolean; useFacing: boolean }> {
  const hasW = !!(weight && String(weight).trim());
  const hasF = !!(facing && String(facing).trim());
  const steps: Array<{ useWeight: boolean; useFacing: boolean }> = [];
  const push = (useWeight: boolean, useFacing: boolean) => {
    if (steps.some((s) => s.useWeight === useWeight && s.useFacing === useFacing)) return;
    steps.push({ useWeight, useFacing });
  };
  if (hasW && hasF) push(true, true);
  if (hasW) push(true, false);
  if (hasF) push(false, true);
  push(false, false);
  return steps;
}

function attrsPass(
  nameLc: string,
  keyword: string,
  opts: { weight?: string | null; facing?: string | null; useWeight: boolean; useFacing: boolean },
): boolean {
  if (!keywordHit(nameLc, keyword)) return false;
  if (opts.useWeight && !weightMask(nameLc, opts.weight)) return false;
  if (opts.useFacing) {
    const f = (opts.facing || '').trim().toLowerCase();
    if (f && !nameLc.includes(f)) return false;
  }
  return true;
}

function lineItemDimsOk(
  itemName: string,
  size: number,
  thickness: number,
  mode: CatalogMatchMode,
): boolean {
  if (mode === 'roll') {
    const dims = parseRollDims(itemName);
    const thick = dims.thickIn ?? parseLineItemName(itemName).sizeNum;
    return numEq(thick, thickness);
  }
  const { sizeNum, thickNum } = parseLineItemName(itemName);
  return numEq(sizeNum, size) && numEq(thickNum, thickness);
}

/** Trimble rows in the shared attribute search pool (with wt/facing fallback). */
export function filterLineItemsForSearch(
  lineItems: LineItemRow[],
  size: number,
  thickness: number,
  keyword: string | null,
  opts?: SearchAttrOpts,
): LineItemRow[] {
  if (!keyword) return [];
  const mode = opts?.matchMode || 'pipe';
  for (const step of attrFallbackSteps(opts?.weight, opts?.facing)) {
    const hits = lineItems.filter((li) => {
      if (!lineItemDimsOk(li.itemName, size, thickness, mode)) return false;
      return attrsPass(li.itemName.toLowerCase(), keyword, {
        weight: opts?.weight,
        facing: opts?.facing,
        ...step,
      });
    });
    if (hits.length) return hits;
  }
  return [];
}

/** Normalize density labels so 0.75 / .75 / 3/4# stack together. */
export function normalizeWeightKey(weight: string | null | undefined): string {
  const t = String(weight || '')
    .trim()
    .toLowerCase()
    .replace(/#/g, '')
    .replace(/\s+/g, '');
  if (!t) return '';
  if (t === '3/4' || t === '.75') return '0.75';
  if (t.startsWith('.')) return `0${t}`;
  return t;
}

function facingKey(facing: string | null | undefined): string {
  return (normalizeFacingOption(facing) || parseFacingHint(facing) || '').toLowerCase();
}

/** Weight/facing keys from a Mike phrase (for roll stacking). */
export function materialKeysFromPhrase(phrase: string | null | undefined): {
  weightKey: string;
  facingKey: string;
} {
  return {
    weightKey: normalizeWeightKey(parseDensityWeight(phrase)),
    facingKey: facingKey(parseFacingHint(phrase)),
  };
}

/**
 * Sum Mike qty/hours for a Spec line.
 * - pipe: size × thickness × materialBase
 * - roll: thickness × materialBase × wt/facing only (size ignored); PPH = Σqty/Σhours
 */
export function rollupMike(
  rows: MikeRollupRow[],
  size: number,
  thickness: number,
  materialBase: string | null,
  opts?: {
    matchMode?: CatalogMatchMode;
    weight?: string | null;
    facing?: string | null;
  },
): { qtyEstimated: number; hours: number; productionPerHour: number | null } {
  if (!materialBase) {
    return { qtyEstimated: 0, hours: 0, productionPerHour: null };
  }
  const mode = opts?.matchMode || 'pipe';
  const wantWt = normalizeWeightKey(opts?.weight);
  const wantFace = facingKey(opts?.facing);
  let qty = 0;
  let hours = 0;
  for (const r of rows) {
    if (!numEq(r.thickness, thickness)) continue;
    if ((r.materialBase || '').trim() !== materialBase.trim()) continue;
    if (mode === 'roll') {
      const keys = materialKeysFromPhrase(r.materialPhrase);
      if (wantWt && keys.weightKey && wantWt !== keys.weightKey) continue;
      if (wantFace && keys.facingKey && wantFace !== keys.facingKey) continue;
      // Empty Spec wt/facing still matches rows; differing size is ignored.
    } else if (!numEq(r.size, size)) {
      continue;
    }
    qty += Number(r.quantity) || 0;
    hours += Number(r.hours) || 0;
  }
  return {
    qtyEstimated: qty,
    hours,
    productionPerHour: hours > 0 ? qty / hours : null,
  };
}

/**
 * Excel Specs Qty Received — shared attribute search pool (not vendor/price).
 * - pipe: Spec size + thickness vs parsed name dims
 * - roll: Spec thickness only vs first name dim; all hits summed
 * Optional weight/facing preferred; soft fallback if no hits.
 */
export function sumQtyReceived(
  lineItems: LineItemRow[],
  size: number,
  thickness: number,
  keyword: string | null,
  opts?: SearchAttrOpts,
): number {
  return filterLineItemsForSearch(lineItems, size, thickness, keyword, opts).reduce(
    (s, li) => s + (Number(li.received) || 0),
    0,
  );
}

/**
 * Roll Recv in SF: same search pool as sumQtyReceived(roll); each row × (width/12 × length).
 */
export function sumQtyReceivedSf(
  lineItems: LineItemRow[],
  thickness: number,
  keyword: string | null,
  opts?: SearchAttrOpts,
): number {
  const pool = filterLineItemsForSearch(lineItems, 0, thickness, keyword, {
    ...opts,
    matchMode: 'roll',
  });
  let sum = 0;
  for (const li of pool) {
    const dims = parseRollDims(li.itemName);
    if (dims.sfPerRoll == null) continue;
    sum += (Number(li.received) || 0) * dims.sfPerRoll;
  }
  return sum;
}

/**
 * Human summary for roll Recv from the shared search pool.
 * e.g. `3 rolls of 400 sq ft`. Mixed lengths: `2 rolls of 400 sq ft + 1 roll of 300 sq ft`.
 */
export function buildQtyReceivedSummary(
  lineItems: LineItemRow[],
  thickness: number,
  keyword: string | null,
  opts?: SearchAttrOpts & { trimbleUnit?: string | null },
): string | null {
  const pool = filterLineItemsForSearch(lineItems, 0, thickness, keyword, {
    ...opts,
    matchMode: 'roll',
  });
  const bySf = new Map<number, number>();
  let totalRolls = 0;
  for (const li of pool) {
    const dims = parseRollDims(li.itemName);
    if (dims.sfPerRoll == null) continue;
    const recv = Number(li.received) || 0;
    if (recv <= 0) continue;
    totalRolls += recv;
    bySf.set(dims.sfPerRoll, (bySf.get(dims.sfPerRoll) || 0) + recv);
  }
  if (totalRolls <= 0 || !bySf.size) return null;

  const unitRaw = (opts?.trimbleUnit || 'roll').trim() || 'roll';
  const unitWord = unitRaw.toLowerCase();
  const plural = (n: number) => (n === 1 ? unitWord.replace(/s$/i, '') || unitWord : unitWord.endsWith('s') ? unitWord : `${unitWord}s`);
  const fmtSf = (sf: number) =>
    Number.isInteger(sf) ? String(sf) : sf.toLocaleString(undefined, { maximumFractionDigits: 2 });

  const parts = [...bySf.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([sf, n]) => `${n} ${plural(n)} of ${fmtSf(sf)} sq ft`);
  return parts.join(' + ');
}

/** Modal SF/roll from the search pool (most common among hits), not cheapest catalog pick. */
export function sfPerRollFromSearchPool(
  lineItems: LineItemRow[],
  catalogNames: string[],
  thickness: number,
  keyword: string | null,
  opts?: SearchAttrOpts,
): number | null {
  const counts = new Map<number, number>();
  const bump = (sf: number | null | undefined) => {
    if (sf == null || !Number.isFinite(sf) || sf <= 0) return;
    counts.set(sf, (counts.get(sf) || 0) + 1);
  };
  for (const li of filterLineItemsForSearch(lineItems, 0, thickness, keyword, {
    ...opts,
    matchMode: 'roll',
  })) {
    bump(parseRollDims(li.itemName).sfPerRoll);
  }
  for (const name of catalogNames) bump(parseRollDims(name).sfPerRoll);
  let best: number | null = null;
  let n = -1;
  for (const [sf, c] of counts) {
    if (c > n) {
      n = c;
      best = sf;
    }
  }
  return best;
}

/** Earned / projected hours from quantity ÷ production per hour. */
export function hoursFromQuantity(
  qty: number,
  productionPerHour: number | null | undefined,
): number | null {
  const pph = Number(productionPerHour);
  if (!Number.isFinite(pph) || pph <= 0) return null;
  const q = Number(qty) || 0;
  return q / pph;
}

/** Commodity identity for production BOM (system/area ignored). */
export function commodityKey(input: {
  catalogMatchMode?: string | null;
  materialBase?: string | null;
  insulation?: string | null;
  size: number;
  thickness: number;
  weight?: string | null;
  facing?: string | null;
}): string {
  const mode = (input.catalogMatchMode || 'pipe').toLowerCase();
  const base = String(input.materialBase || input.insulation || '')
    .trim()
    .toLowerCase();
  const sizePart = mode === 'roll' ? '0' : String(Number(input.size) || 0);
  const thick = String(Number(input.thickness) || 0);
  const wt = String(input.weight ?? '')
    .trim()
    .toLowerCase();
  const facing = String(input.facing ?? '')
    .trim()
    .toLowerCase();
  return `${mode}|${base}|${sizePart}|${thick}|${wt}|${facing}`;
}

export type ProductionReportLineInput = {
  id?: number;
  type?: string | null;
  insulation: string;
  size: number;
  thickness: number;
  materialBase?: string | null;
  catalogMatchMode?: string | null;
  weight?: string | null;
  facing?: string | null;
  qtyEstimated: number;
  hoursEstimated: number;
  productionPerHour: number | null;
  qtyReceived: number;
  qtyReceivedSf?: number | null;
  hoursEstimatedFromReceived: number | null;
};

export type ProductionReportLine = {
  commodityKey: string;
  type: string | null;
  insulation: string;
  materialBase: string | null;
  catalogMatchMode: string;
  size: number;
  thickness: number;
  weight: string | null;
  facing: string | null;
  qtyEstimated: number;
  hoursEstimated: number;
  productionPerHour: number | null;
  qtyReceived: number;
  qtyReceivedSf: number | null;
  hoursEstimatedFromReceived: number | null;
  qtyRemain: number;
  specLineIds: number[];
};

/**
 * Dedupe Spec lines into commodity BOM rows (same recv/qty must not be summed N times).
 * One Spec commodity stack → one production line.
 */
export function buildProductionReportLines(
  lines: ProductionReportLineInput[],
): ProductionReportLine[] {
  const byKey = new Map<string, ProductionReportLine>();
  for (const line of lines) {
    const key = commodityKey(line);
    const existing = byKey.get(key);
    if (existing) {
      if (line.id != null) existing.specLineIds.push(line.id);
      if (!existing.type && line.type) existing.type = line.type;
      continue;
    }
    const mode = (line.catalogMatchMode || 'pipe').toLowerCase();
    byKey.set(key, {
      commodityKey: key,
      type: line.type ?? null,
      insulation: line.insulation,
      materialBase: line.materialBase ?? null,
      catalogMatchMode: mode,
      size: mode === 'roll' ? 0 : Number(line.size) || 0,
      thickness: Number(line.thickness) || 0,
      weight: line.weight ?? null,
      facing: line.facing ?? null,
      qtyEstimated: Number(line.qtyEstimated) || 0,
      hoursEstimated: Number(line.hoursEstimated) || 0,
      productionPerHour: line.productionPerHour,
      qtyReceived: Number(line.qtyReceived) || 0,
      qtyReceivedSf: line.qtyReceivedSf ?? null,
      hoursEstimatedFromReceived: line.hoursEstimatedFromReceived,
      qtyRemain: (Number(line.qtyEstimated) || 0) - (Number(line.qtyReceived) || 0),
      specLineIds: line.id != null ? [line.id] : [],
    });
  }
  return [...byKey.values()].sort((a, b) => {
    const t = compareBySpecType(a, b);
    if (t) return t;
    const ai = a.insulation.localeCompare(b.insulation);
    if (ai) return ai;
    if (a.thickness !== b.thickness) return a.thickness - b.thickness;
    return a.size - b.size;
  });
}

export function sumProductionHours(lines: ProductionReportLine[]): {
  hoursEstimated: number;
  hoursEstimatedFromReceived: number;
} {
  let hoursEstimated = 0;
  let hoursEstimatedFromReceived = 0;
  for (const l of lines) {
    hoursEstimated += Number(l.hoursEstimated) || 0;
    hoursEstimatedFromReceived += Number(l.hoursEstimatedFromReceived) || 0;
  }
  return { hoursEstimated, hoursEstimatedFromReceived };
}

/** green = actual labor ≤ earned hours from received material. */
export function productionStatus(
  hoursEstimatedFromReceived: number,
  actualHours: number | null,
): 'green' | 'red' | 'unknown' {
  if (actualHours == null || !Number.isFinite(actualHours)) return 'unknown';
  if (hoursEstimatedFromReceived <= 0 && actualHours <= 0) return 'unknown';
  return actualHours <= hoursEstimatedFromReceived ? 'green' : 'red';
}

/**
 * Dominant Trimble Unit among the shared search pool (same as Recv).
 */
export function resolveTrimbleUnit(
  lineItems: LineItemRow[],
  size: number,
  thickness: number,
  keyword: string | null,
  opts?: SearchAttrOpts,
): string | null {
  const counts = new Map<string, number>();
  for (const li of filterLineItemsForSearch(lineItems, size, thickness, keyword, opts)) {
    const u = String(li.unit || '').trim();
    if (!u) continue;
    counts.set(u, (counts.get(u) || 0) + 1);
  }
  let best: string | null = null;
  let n = -1;
  for (const [u, c] of counts) {
    if (c > n) {
      n = c;
      best = u;
    }
  }
  return best;
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

/** Catalog match for Structshare list — `itemName` is vendor-stripped display text. */
export type StructshareOption = { itemName: string; price: number | null };

/**
 * Collective catalog matches for a Spec (shared attr search). Not cheapest-vendor pick.
 * Display names have vendor branding stripped. Sorted by item name.
 */
export function listStructshareOptions(
  catalog: CatalogItem[],
  size: number,
  thickness: number,
  keyword: string | null,
  opts?: SearchAttrOpts & {
    /** Cap list size for API payload (default 100). */
    limit?: number;
  },
): StructshareOption[] {
  if (!keyword) return [];
  const mode = opts?.matchMode || 'pipe';
  const limit = Math.min(Math.max(opts?.limit ?? 100, 1), 500);

  const dimOk = (it: CatalogItem) =>
    mode === 'roll'
      ? numEq(it.size1, thickness)
      : numEq(it.size1, size) && numEq(it.size2, thickness);

  let rawHits: CatalogItem[] = [];
  for (const step of attrFallbackSteps(opts?.weight, opts?.facing)) {
    rawHits = catalog.filter((it) => {
      if (!dimOk(it)) return false;
      const lc = it.nameLc || it.itemName.toLowerCase();
      if (lc.includes('elbow') || lc.includes('radius')) return false;
      return attrsPass(lc, keyword, {
        weight: opts?.weight,
        facing: opts?.facing,
        ...step,
      });
    });
    if (rawHits.length) break;
  }
  if (!rawHits.length) return [];

  const seen = new Set<string>();
  const out: StructshareOption[] = [];
  const prepared = rawHits
    .map((it) => {
      const display = stripVendorFromItemName(it.itemName);
      const raw = it.price == null ? null : Number(it.price);
      return {
        itemName: display,
        price: raw != null && Number.isFinite(raw) ? raw : null,
      };
    })
    .filter((o) => o.itemName)
    .sort((a, b) => a.itemName.localeCompare(b.itemName));
  for (const o of prepared) {
    const key = o.itemName.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(o);
    if (out.length >= limit) break;
  }
  return out;
}

/** @deprecated First list entry only — not a cheapest pick. Prefer {@link listStructshareOptions}. */
export function pickStructshareItem(
  catalog: CatalogItem[],
  size: number,
  thickness: number,
  keyword: string | null,
  opts?: SearchAttrOpts,
): StructshareOption | null {
  return listStructshareOptions(catalog, size, thickness, keyword, opts)[0] ?? null;
}

export function disciplineToType(d: string | null | undefined): string | null {
  const x = (d || '').toUpperCase();
  if (x === 'P') return 'Plumbing';
  if (x === 'H') return 'HVAC';
  if (x === 'D') return 'Duct';
  return null;
}

/** Specs / Production list order: Duct → HVAC → Plumbing → other → null. */
const SPEC_TYPE_RANK: Record<string, number> = {
  duct: 0,
  hvac: 1,
  plumbing: 2,
};

export function specTypeRank(type: string | null | undefined): number {
  if (!type?.trim()) return 99;
  const r = SPEC_TYPE_RANK[type.trim().toLowerCase()];
  return r == null ? 50 : r;
}

export function compareBySpecType(
  a: { type?: string | null },
  b: { type?: string | null },
): number {
  return specTypeRank(a.type) - specTypeRank(b.type);
}

/**
 * Group Mike rows into Spec line seeds.
 * - pipe: size × thick × base
 * - roll: thick × base × wt × facing (size/system ignored when stacking qty)
 */
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
  facing: string | null;
  qtyEstimated: number;
}> {
  type Agg = {
    mode: CatalogMatchMode;
    size: number;
    thickness: number;
    base: string;
    weightKey: string;
    facingKey: string;
    qty: number;
    hours: number;
    systems: Map<string, number>;
    phrases: Map<string, number>;
    disciplines: Map<string, number>;
    weights: Map<string, number>;
    facings: Map<string, number>;
  };
  const groups = new Map<string, Agg>();

  for (const r of rows) {
    if (r.thickness == null) continue;
    const base = normalizeMaterialBase(r.materialBase, r.materialPhrase, helpers);
    if (!base) continue;
    const mode = matchModeForBase(base);
    if (mode === 'pipe' && r.size == null) continue;

    const keys = materialKeysFromPhrase(r.materialPhrase);
    const key =
      mode === 'roll'
        ? `roll|${r.thickness}|${base}|${keys.weightKey}|${keys.facingKey}`
        : `pipe|${r.size}|${r.thickness}|${base}`;

    if (!groups.has(key)) {
      groups.set(key, {
        mode,
        // Roll Spec size is not a stack key — store thickness so DB has a number.
        size: mode === 'roll' ? Number(r.thickness) : Number(r.size),
        thickness: Number(r.thickness),
        base,
        weightKey: keys.weightKey,
        facingKey: keys.facingKey,
        qty: 0,
        hours: 0,
        systems: new Map(),
        phrases: new Map(),
        disciplines: new Map(),
        weights: new Map(),
        facings: new Map(),
      });
    }
    const g = groups.get(key)!;
    g.qty += Number(r.quantity) || 0;
    g.hours += Number(r.hours) || 0;
    if (r.systemName) g.systems.set(r.systemName, (g.systems.get(r.systemName) || 0) + 1);
    if (r.materialPhrase) {
      g.phrases.set(r.materialPhrase, (g.phrases.get(r.materialPhrase) || 0) + 1);
    }
    if (r.discipline) {
      g.disciplines.set(r.discipline, (g.disciplines.get(r.discipline) || 0) + 1);
    }
    if (keys.weightKey) g.weights.set(keys.weightKey, (g.weights.get(keys.weightKey) || 0) + 1);
    if (keys.facingKey) g.facings.set(keys.facingKey, (g.facings.get(keys.facingKey) || 0) + 1);
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
    .map((g) => {
      const phrase = topKey(g.phrases) || g.base;
      const resolved = resolveMaterial(phrase, helpers);
      const insulation =
        resolved.baseName === g.base || !resolved.baseName
          ? resolved.specPhrase || defaultPhrase(g.base)
          : defaultPhrase(g.base);
      const finalRes = resolveMaterial(insulation, helpers);
      const weight =
        finalRes.weight ||
        parseDensityWeight(phrase) ||
        (topKey(g.weights) || null);
      const facing = normalizeFacingOption(
        finalRes.facing && finalRes.facing !== 'plain'
          ? finalRes.facing
          : topKey(g.facings) || parseFacingHint(phrase),
      );
      return {
        type: disciplineToType(topKey(g.disciplines)),
        systemName: topKey(g.systems) || '—',
        insulation: finalRes.specPhrase || insulation,
        size: g.size,
        thickness: g.thickness,
        weight,
        facing,
        qtyEstimated: g.qty,
      };
    })
    .sort((a, b) => {
      const t = compareBySpecType(a, b);
      if (t) return t;
      return b.qtyEstimated - a.qtyEstimated;
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
  const resolved = resolveMaterial(line.insulation, helpers, {
    facingHint: line.facing,
  });
  const materialBase = resolved.baseName;
  const keyword = resolved.keyword;
  const insulation = resolved.specPhrase || line.insulation;
  const weight =
    cleanWeightFacing(line.weight, ['wt', 'weight']) ||
    resolved.weight ||
    parseDensityWeight(line.insulation);
  let facing =
    cleanWeightFacing(line.facing, ['facing']) ||
    (resolved.facing && !['plain'].includes(resolved.facing) ? resolved.facing : null);
  // Caller must pass Mike rows with materialBase already normalized (once).
  // Remapping here was O(lines × mike × helpers) and hung Specs load.
  const rollup = rollupMike(mikeRows, line.size, line.thickness, materialBase, {
    matchMode: resolved.matchMode,
    weight,
    facing,
  });
  const searchOpts: SearchAttrOpts = {
    weight,
    facing,
    matchMode: resolved.matchMode,
  };
  const qtyReceived = sumQtyReceived(
    lineItems,
    line.size,
    line.thickness,
    keyword,
    searchOpts,
  );
  const structshareOptions = listStructshareOptions(
    catalog,
    line.size,
    line.thickness,
    keyword,
    searchOpts,
  );
  // Facing hint from raw catalog/Trimble names in the pool (before vendor strip).
  if (!facing) {
    for (const li of filterLineItemsForSearch(
      lineItems,
      line.size,
      line.thickness,
      keyword,
      searchOpts,
    )) {
      const hint = parseFacingHint(li.itemName);
      if (hint) {
        facing = hint;
        break;
      }
    }
    if (!facing) {
      for (const it of catalog) {
        const lc = it.nameLc || it.itemName.toLowerCase();
        if (!keywordHit(lc, keyword || '')) continue;
        const hint = parseFacingHint(it.itemName);
        if (hint) {
          facing = hint;
          break;
        }
      }
    }
  }
  const isRoll = resolved.matchMode === 'roll';
  const qtyReceivedSf = isRoll
    ? sumQtyReceivedSf(lineItems, line.thickness, keyword, searchOpts)
    : null;
  const trimbleUnit = resolveTrimbleUnit(
    lineItems,
    line.size,
    line.thickness,
    keyword,
    searchOpts,
  );
  const qtyReceivedSummary = isRoll
    ? buildQtyReceivedSummary(lineItems, line.thickness, keyword, {
        ...searchOpts,
        trimbleUnit,
      })
    : null;
  const structshareSfPerRoll = isRoll
    ? sfPerRollFromSearchPool(
        lineItems,
        // Use raw catalog names that match dims+keyword (vendor strip only for display list)
        catalog
          .filter((it) => {
            if (!numEq(it.size1, line.thickness)) return false;
            return keywordHit(it.nameLc || it.itemName.toLowerCase(), keyword);
          })
          .map((it) => it.itemName),
        line.thickness,
        keyword,
        searchOpts,
      )
    : null;
  /** Roll: earned hours use SF recv (Mike PPH is SF/hr). Pipe: Trimble qty unit matches Mike. */
  const qtyForEarnedHours = isRoll && qtyReceivedSf != null ? qtyReceivedSf : qtyReceived;
  const hoursEstimatedFromReceived = hoursFromQuantity(qtyForEarnedHours, rollup.productionPerHour);
  return {
    code: lookups.systemCode(line.systemName),
    areaCode: line.areaName ? lookups.areaCode(line.areaName) : null,
    materialCode: lookups.materialCode(insulation),
    /** Spec/List system unit (Est context: LF/SF). */
    unit: lookups.systemUnit(line.systemName),
    /** Trimble line-item Unit for matched Recv pool (e.g. Roll). */
    trimbleUnit,
    materialBase,
    keyword,
    catalogMatchMode: resolved.matchMode,
    weight,
    facing: normalizeFacingOption(facing),
    qtyEstimated: rollup.qtyEstimated,
    hoursEstimated: rollup.hours,
    productionPerHour: rollup.productionPerHour,
    qtyReceived,
    hoursEstimatedFromReceived,
    qtyRemain: rollup.qtyEstimated - qtyReceived,
    /** No single vendor/cheapest pick — use structshareOptions. */
    structshareItem: null,
    structshareUnitPrice: null,
    /** Collective catalog matches; itemName has vendor branding stripped. */
    structshareOptions,
    /** Roll only: modal SF/roll from search pool (not cheapest SKU). */
    structshareSfPerRoll,
    qtyReceivedSf,
    qtyReceivedSummary,
  };
}
