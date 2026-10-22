import { PF_COMPANIES, type PfJobRow, type PfJobStatus } from './project-financials.util';

/**
 * Server copy of the Job book "Full sheet" and BOM tables' click-to-sort (frontend `lib/sort.ts`
 * `sortRows`): blanks last in both directions, numbers numerically, booleans, then text A–Z ignoring
 * case with numbers in natural order. Column keys are the ones the tables use.
 */
type SortValue = string | number | boolean | null | undefined;

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
const isBlank = (v: SortValue) => v == null || v === '' || (typeof v === 'number' && Number.isNaN(v));

function compareValues(a: SortValue, b: SortValue): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
  return collator.compare(String(a ?? ''), String(b ?? ''));
}

function sortRows<T>(rows: readonly T[], value: (row: T) => SortValue, dir: 'asc' | 'desc'): T[] {
  return [...rows].sort((x, y) => {
    const a = value(x);
    const b = value(y);
    if (isBlank(a) || isBlank(b)) return isBlank(a) === isBlank(b) ? 0 : isBlank(a) ? 1 : -1;
    const c = compareValues(a, b);
    return dir === 'asc' ? c : -c;
  });
}

const STATUS_LABEL: Record<PfJobStatus, string> = {
  active: 'Active',
  inactive: 'Inactive',
  siteline_only: 'Siteline only',
  clearstory_only: 'Clearstory only',
};
const RECON_STATUS: Record<PfJobRow['recon']['sitelineClearstory'], string> = {
  ok: 'OK',
  fix: 'FIX',
  not_in_siteline: 'NOT IN SITELINE',
};

/** Job book "Full sheet" columns (header label → value it sorts by), as in `JobBookTable.tsx`. */
function jobSheetColumns(hideCost: boolean): Record<string, (j: PfJobRow) => SortValue> {
  const cost = (pick: (j: PfJobRow) => SortValue) => (j: PfJobRow) => (hideCost || !j.sources.foundation ? null : pick(j));
  return {
    'Job #': (j) => j.jobNumber,
    Name: (j) => j.name,
    Customer: (j) => j.customer,
    City: (j) => j.city,
    State: (j) => j.state,
    Company: (j) => j.company,
    PM: (j) => j.pm,
    Status: (j) => STATUS_LABEL[j.status],
    Contract: (j) => j.contract.amount,
    'Approved COs': (j) => j.contract.approvedCos,
    ATP: (j) => j.contract.atp,
    'In review': (j) => j.contract.inReview,
    Placeholder: (j) => j.contract.placeholder,
    Revised: (j) => j.contract.revised,
    'Siteline contract': (j) => j.contract.siteline,
    Difference: (j) => j.recon.difference ?? j.contract.difference,
    Alerts: (j) => j.recon.alerts.map((a) => a.label).join(', '),
    'Siteline / Clearstory': (j) => RECON_STATUS[j.recon.sitelineClearstory],
    'Over / under billings': (j) => j.recon.overUnderBillings,
    Billed: (j) => j.billing.billed,
    Retainage: (j) => j.billing.retainage,
    Backlog: (j) => j.billing.backlog,
    AR: (j) => j.billing.ar,
    '% billed': (j) => j.billing.pctBilled,
    '% complete': (j) => j.billing.percentComplete,
    'Retention only': (j) => (j.billing.retentionOnly ? 'Yes' : 'No'),
    ...(hideCost
      ? {}
      : {
          LAB: cost((j) => j.cost.lab),
          MAT: cost((j) => j.cost.mat),
          SUB: cost((j) => j.cost.sub),
          EQU: cost((j) => j.cost.equ),
          BUR: cost((j) => j.cost.bur),
          INS: cost((j) => j.cost.ins),
          OTH: cost((j) => j.cost.oth),
          DIS: cost((j) => j.cost.dis),
          'Total cost': cost((j) => j.cost.total),
          'Labor hours': cost((j) => j.cost.labHours),
          'Labor rate': cost((j) => j.cost.laborRate),
          'LAB + BUR': cost((j) => j.cost.laborWithBurden),
          'Cash flow': cost((j) => j.cost.cashFlow),
        }),
  };
}

/** BOM tracking columns (key → value it sorts by), as in `BomTable.tsx`. */
function bomColumns(hideTrimble: boolean): Record<string, (j: PfJobRow) => SortValue> {
  const trimbleOf = (j: PfJobRow) => (hideTrimble || !j.sources.trimble ? null : j.bom.trimble);
  const companyCell = (j: PfJobRow, entityId: number) => j.bom.companies.find((row) => row.entityId === entityId);
  return {
    job: (j) => j.jobNumber,
    ...Object.fromEntries(
      PF_COMPANIES.flatMap((c) => [
        [`mat-${c.entityId}`, (j: PfJobRow) => companyCell(j, c.entityId)?.materialCost ?? 0],
        [`hrs-${c.entityId}`, (j: PfJobRow) => companyCell(j, c.entityId)?.laborHours ?? 0],
      ]),
    ),
    matTotal: (j) => j.bom.totals.materialCost,
    hrsTotal: (j) => j.bom.totals.laborHours,
    csContract: (j) => j.bom.clearstory.contract,
    csCos: (j) => j.bom.clearstory.approvedCos,
    totalContract: (j) => j.bom.clearstory.totalContract,
    completion: (j) => j.bom.clearstory.completionPct,
    bomBudget: (j) => trimbleOf(j)?.bomBudget,
    bomBudgetPct: (j) => trimbleOf(j)?.bomBudgetPct,
    ordered: (j) => trimbleOf(j)?.ordered,
    received: (j) => trimbleOf(j)?.received,
    ordMinusRec: (j) => trimbleOf(j)?.orderedMinusReceived,
    actualCost: (j) => trimbleOf(j)?.actualCost,
    trimbleHrs: (j) => trimbleOf(j)?.laborHours,
    estHrs: (j) => trimbleOf(j)?.estLaborHours,
    remaining: (j) => trimbleOf(j)?.remaining,
    pctUsed: (j) => trimbleOf(j)?.pctUsed,
    matVsCompletion: (j) => j.bom.vsCompletion.materialVsCompletion,
    hrsVsCompletion: (j) => j.bom.vsCompletion.laborVsCompletion,
  };
}

export interface PfPageOpts {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

/**
 * Sort (when `sortBy` is a known column for this screen) and cut one page. Without a sort the rows
 * keep the job-number order `listJobs` already applied. Page is clamped; pageSize 1–200.
 */
export function pageJobs(
  jobs: PfJobRow[],
  screen: 'jobs' | 'bom',
  opts: PfPageOpts,
  hidden: { hideCost: boolean; hideTrimble: boolean },
) {
  const columns = screen === 'jobs' ? jobSheetColumns(hidden.hideCost) : bomColumns(hidden.hideTrimble);
  const value = opts.sortBy ? columns[opts.sortBy] : undefined;
  const sorted = value ? sortRows(jobs, value, opts.sortDir === 'desc' ? 'desc' : 'asc') : jobs;
  const pageSize = Math.min(200, Math.max(1, opts.pageSize ?? 50));
  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const page = Math.min(pages, Math.max(1, opts.page ?? 1));
  return {
    jobs: sorted.slice((page - 1) * pageSize, page * pageSize),
    total: sorted.length,
    page,
    pageSize,
    sortedOnServer: Boolean(value),
  };
}
