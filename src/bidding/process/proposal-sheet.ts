/**
 * In-app proposal (Proposify mimic). No Proposify connection.
 * One sheet on the bid. Each copy is one recipient: the team picks
 * whether that copy shows quantities, and that copy's prices.
 */

export const PROPOSAL_BUCKETS = [
  'ductwork',
  'hvac_piping',
  'plumbing',
  'hvac_equipment',
  'plumbing_equipment',
] as const;

export type ProposalBucket = (typeof PROPOSAL_BUCKETS)[number];

export const PROPOSAL_BUCKET_LABELS: Record<ProposalBucket, string> = {
  ductwork: 'Ductwork',
  hvac_piping: 'HVAC Piping',
  plumbing: 'Plumbing',
  hvac_equipment: 'HVAC Equipment',
  plumbing_equipment: 'Plumbing Equipment',
};

/** Printed on every proposal. Not stored per bid. */
export const PROPOSAL_BOILERPLATE = [
  'Insulation Scope: Thermal insulation of New Systems as listed attached.',
  'All insulation will be installed per manufactures recommendations.',
  'No existing piping and ductwork/plenums is included. Pricing is contingent upon work being released with enough time to complete before walls and ceilings are closed up.',
  'Ladder Last or a similar policy is excluded. Add 4% to the price when ladders are not allowed.',
] as const;

/** Exception report rows. `included: null` means the team has not marked the X yet. */
export const PROPOSAL_EXCEPTIONS: Array<{ key: string; label: string }> = [
  { key: 'sound_lagging', label: 'Sound/Acoustical Lagging' },
  { key: 'fire_enclosures', label: 'Fire rated Enclosures' },
  { key: 'blank_panels', label: 'Blank of Panels' },
  { key: 'victaulic', label: 'Victaulic Fittings' },
  { key: 'underground', label: 'Underground Piping' },
  { key: 'pipe_supports', label: 'Pre-insulated Pipe Supports' },
  { key: 'calsil_inserts', label: '180 degree Calsil / Foamglass inserts' },
  { key: 'undersink', label: 'ADA Compliant Undersink protection' },
  { key: 'saddles', label: 'Saddles & Shields' },
  { key: 'heat_tracing', label: 'Heat Tracing' },
  { key: 'fire_stopping', label: 'Fire Stopping' },
  { key: 'color_coding', label: 'Color Coding' },
  { key: 'labeling', label: 'Labeling of Pipe of Duct' },
  { key: 'lined_duct', label: 'Lined Ductwork' },
  { key: 'existing_duct', label: 'Insulation of Existing Duct' },
  { key: 'flexible_duct', label: 'Flexible duct' },
  { key: 'existing_pipe', label: 'Insulation of Existing Pipe' },
  { key: 'pipe_prep', label: 'Pipe prepping or coating' },
  { key: 'painting', label: 'Pipe or Duct Painting' },
  { key: 'cleaning', label: 'Pipe of Duct cleaning prior to installation of insulation' },
  { key: 'chiller', label: 'Chiller Insulation' },
  { key: 'generator_exhaust', label: 'Generator Exhaust' },
  { key: 'overtime', label: 'Overtime / Shift Work' },
  { key: 'mockups', label: 'Pipe, Equipment, and Duct required for mock-ups is by others' },
  { key: 'demo', label: 'Insulation Demo or Removal' },
  { key: 'thermal_imaging', label: 'Thermal Imaging of Insulation' },
  { key: 'composite_cleanup', label: 'Composite Cleanup' },
  { key: 'damage_by_others', label: 'Damage to insulation by others' },
  { key: 'wood_block', label: 'Wood block for pipe supports' },
  { key: 'third_party', label: 'Third Party Testing' },
  { key: 'bonds', label: 'Bonds' },
  { key: 'trap_primer', label: 'Trap Primer Piping' },
  { key: 'sales_tax', label: 'Sales Tax' },
  { key: 'jacketing_paint', label: 'Jacketing paintability (FSK, ASJ, PSK)' },
  { key: 'ladders_last', label: 'Ladders Last — add 4% when ladders are not allowed' },
];

const MAX_COPIES = 40;
const MAX_ALTERNATES = 30;

export type ProposalLine = {
  bucket: ProposalBucket;
  systems: string | null;
  /** Free text (SF, LF, counts). Hidden on a copy when showQuantities is not true. */
  quantity: string | null;
  price: number | null;
};

export type ProposalAlternate = {
  description: string | null;
  quantity: string | null;
  price: number | null;
};

export type ProposalException = {
  key: string;
  included: boolean | null;
};

export type ProposalCopy = {
  id: string;
  toName: string | null;
  toCompany: string | null;
  toEmail: string | null;
  toPhone: string | null;
  toAddress: string | null;
  /** Team choice for this recipient. Null until they decide. */
  showQuantities: boolean | null;
  /** Override a bucket price for this recipient. Missing or null uses the sheet line price. */
  prices: Partial<Record<ProposalBucket, number | null>>;
  /** Same length as sheet.alternates. Null uses the alternate's own price. */
  alternatePrices: Array<number | null>;
};

export type ProposalSheet = {
  revision: string | null;
  proposalDate: string | null;
  drawings: string | null;
  specifications: string | null;
  wageScale: string | null;
  addenda: string | null;
  mechanicalDesigner: string | null;
  specialNotes: string | null;
  lines: ProposalLine[];
  alternates: ProposalAlternate[];
  exceptions: ProposalException[];
  copies: ProposalCopy[];
};

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

function num(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function flag(v: unknown): boolean | null {
  if (v === true || v === false) return v;
  if (v == null || v === '') return null;
  const s = String(v).trim().toLowerCase();
  if (s === 'true' || s === 'yes' || s === '1') return true;
  if (s === 'false' || s === 'no' || s === '0') return false;
  return null;
}

function bucketOf(v: unknown): ProposalBucket | null {
  return (PROPOSAL_BUCKETS as readonly string[]).includes(v as string) ? (v as ProposalBucket) : null;
}

export function emptyProposalSheet(): ProposalSheet {
  return {
    revision: null,
    proposalDate: null,
    drawings: null,
    specifications: null,
    wageScale: null,
    addenda: null,
    mechanicalDesigner: null,
    specialNotes: null,
    lines: PROPOSAL_BUCKETS.map((bucket) => ({
      bucket,
      systems: null,
      quantity: null,
      price: null,
    })),
    alternates: [],
    exceptions: PROPOSAL_EXCEPTIONS.map((row) => ({ key: row.key, included: null })),
    copies: [],
  };
}

/** Price printed for one bucket on one copy. */
export function proposalCopyPrice(
  sheet: ProposalSheet,
  copy: ProposalCopy | null,
  bucket: ProposalBucket,
): number | null {
  const override = copy?.prices?.[bucket];
  if (override != null) return override;
  return sheet.lines.find((line) => line.bucket === bucket)?.price ?? null;
}

/** Lump total. Alternates stay out of this number. */
export function proposalCopyTotal(sheet: ProposalSheet, copy: ProposalCopy | null): number {
  return PROPOSAL_BUCKETS.reduce((sum, bucket) => sum + (proposalCopyPrice(sheet, copy, bucket) ?? 0), 0);
}

export function normalizeProposalSheet(raw: unknown): ProposalSheet {
  const blank = emptyProposalSheet();
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Partial<ProposalSheet>) : {};
  const byBucket = new Map<ProposalBucket, ProposalLine>();
  for (const line of Array.isArray(src.lines) ? src.lines : []) {
    const bucket = bucketOf(line?.bucket);
    if (!bucket || byBucket.has(bucket)) continue;
    byBucket.set(bucket, {
      bucket,
      systems: str(line?.systems),
      quantity: str(line?.quantity),
      price: num(line?.price),
    });
  }
  const lines = PROPOSAL_BUCKETS.map((bucket) => byBucket.get(bucket) ?? blank.lines.find((l) => l.bucket === bucket)!);

  const alternates = (Array.isArray(src.alternates) ? src.alternates : []).slice(0, MAX_ALTERNATES).map((row) => ({
    description: str(row?.description),
    quantity: str(row?.quantity),
    price: num(row?.price),
  }));

  const marked = new Map<string, boolean | null>();
  for (const row of Array.isArray(src.exceptions) ? src.exceptions : []) {
    const key = str(row?.key);
    if (!key || marked.has(key)) continue;
    marked.set(key, flag(row?.included));
  }
  const known = new Set(PROPOSAL_EXCEPTIONS.map((row) => row.key));
  const exceptions = PROPOSAL_EXCEPTIONS.map((row) => ({
    key: row.key,
    included: marked.has(row.key) ? marked.get(row.key)! : null,
  })).filter((row) => known.has(row.key));

  const copies = (Array.isArray(src.copies) ? src.copies : []).slice(0, MAX_COPIES).map((row, i) => {
    const prices: ProposalCopy['prices'] = {};
    const rawPrices = row?.prices && typeof row.prices === 'object' ? row.prices : {};
    for (const bucket of PROPOSAL_BUCKETS) {
      if (bucket in rawPrices) prices[bucket] = num(rawPrices[bucket]);
    }
    const altRaw = Array.isArray(row?.alternatePrices) ? row.alternatePrices : [];
    return {
      id: str(row?.id)?.slice(0, 40) || `c${i + 1}`,
      toName: str(row?.toName),
      toCompany: str(row?.toCompany),
      toEmail: str(row?.toEmail),
      toPhone: str(row?.toPhone),
      toAddress: str(row?.toAddress),
      showQuantities: flag(row?.showQuantities),
      prices,
      alternatePrices: alternates.map((_, n) => (n < altRaw.length ? num(altRaw[n]) : null)),
    };
  });

  return {
    revision: str(src.revision),
    proposalDate: str(src.proposalDate),
    drawings: str(src.drawings),
    specifications: str(src.specifications),
    wageScale: str(src.wageScale),
    addenda: str(src.addenda),
    mechanicalDesigner: str(src.mechanicalDesigner),
    specialNotes: str(src.specialNotes),
    lines,
    alternates,
    exceptions,
    copies,
  };
}

export function proposalSheetError(sheet: ProposalSheet): string | null {
  if (sheet.copies.length > MAX_COPIES) return `process.proposalSheet.copies max ${MAX_COPIES}`;
  if (sheet.alternates.length > MAX_ALTERNATES) return `process.proposalSheet.alternates max ${MAX_ALTERNATES}`;
  if (sheet.specialNotes && sheet.specialNotes.length > 8000) {
    return 'process.proposalSheet.specialNotes exceeds 8000 characters';
  }
  return null;
}
