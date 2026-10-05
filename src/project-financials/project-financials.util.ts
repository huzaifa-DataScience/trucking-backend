import { normalizeJobNumberKey } from '../common/job-number-match.util';

export const PF_COMPANY: Record<number, string> = {
  1: 'GOEL',
  2: 'GOEL DC',
  3: 'DCB',
};

export const PF_COMPANIES = (
  Object.entries(PF_COMPANY) as Array<[string, string]>
).map(([id, company]) => ({ entityId: Number(id), company }));

export type PfJobStatus = 'active' | 'inactive' | 'siteline_only' | 'clearstory_only';

export type PfContractBlock = {
  amount: number;
  approvedCos: number;
  atp: number;
  inReview: number;
  placeholder: number;
  revised: number;
  siteline: number | null;
  difference: number | null;
};

export type PfBillingBlock = {
  billed: number;
  retainage: number;
  backlog: number | null;
  ar: number;
  pctBilled: number | null;
  percentComplete: number | null;
  retentionOnly: boolean;
};

/** Foundation job_history cost_class_no: 1 LAB, 2 MAT, 3 SUB, 4+5 EQU, 6 BUR, 7 INS, 8 OTH, 9 DIS. */
export type PfCostBlock = {
  lab: number;
  mat: number;
  sub: number;
  equ: number;
  bur: number;
  ins: number;
  oth: number;
  dis: number;
  total: number;
  labHours: number;
  laborRate: number | null;
  laborWithBurden: number;
  cashFlow: number | null;
};

export type PfSitelineClearstory = 'ok' | 'fix' | 'not_in_siteline';
export type PfAlertCode = 'FIX' | 'NOT_IN_SITELINE';

export type PfAlert = {
  code: PfAlertCode;
  label: string;
};

export type PfRecon = {
  sitelineClearstory: PfSitelineClearstory;
  difference: number | null;
  overUnderBillings: number | null;
  alerts: PfAlert[];
};

export type PfJobRow = {
  jobNumber: string;
  name: string | null;
  customer: string | null;
  city: string | null;
  state: string | null;
  entityId: number | null;
  company: string | null;
  pm: string | null;
  pmEmail: string | null;
  status: PfJobStatus;
  contract: PfContractBlock;
  billing: PfBillingBlock;
  cost: PfCostBlock;
  recon: PfRecon;
  sources: { siteline: boolean; clearstory: boolean; refJob: boolean; foundation: boolean; trimble: boolean };
  bom: PfBom;
};

export type PfBomCompany = {
  entityId: number;
  company: string;
  materialCost: number;
  laborHours: number;
};

export type PfBom = {
  companies: PfBomCompany[];
  totals: { materialCost: number; laborHours: number };
  clearstory: {
    contract: number;
    approvedCos: number;
    totalContract: number;
    completionPct: number | null;
  };
  trimble: {
    projectIds: number[];
    itemCount: number;
    ordered: number;
    received: number;
    orderedMinusReceived: number;
    actualCost: number;
    laborHours: number;
    estLaborHours: number;
    bomBudget: number;
    remaining: number | null;
    pctUsed: number | null;
    bomBudgetPct: number | null;
  } | null;
  vsCompletion: {
    materialVsCompletion: number | null;
    laborVsCompletion: number | null;
  };
};

export type PfSummaryRow = {
  pm: string;
  activeBillings: number;
  backlog: number;
  ar: number;
  atp: number;
  atpPctOfBillings: number | null;
  openJobs: number;
  activeJobs: number;
  retentionOnly: number;
  totalCost: number;
  cashFlow: number | null;
  fixCount: number;
  notInSitelineCount: number;
  overhead: null;
  billingsVsExpense: null;
  net: null;
  pctNet: null;
  netWith75Atp: null;
};

export function pfJobKey(raw: string | null | undefined): string | null {
  return normalizeJobNumberKey(raw);
}

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export function centsToDollars(v: string | number | null | undefined): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? roundMoney(n / 100) : 0;
}

export function ratio(num: number, den: number): number | null {
  if (!(den > 0)) return null;
  return roundMoney(num / den);
}

export function pickLatestPayApp<T extends { number: number | null }>(apps: T[]): T | null {
  if (!apps.length) return null;
  return [...apps].sort((a, b) => (b.number ?? -1) - (a.number ?? -1))[0];
}

export function pfContract(input: {
  amount: number;
  approvedCos: number;
  atp: number;
  inReview: number;
  placeholder: number;
  siteline: number | null;
}): PfContractBlock {
  const revised = roundMoney(input.amount + input.approvedCos);
  return {
    amount: roundMoney(input.amount),
    approvedCos: roundMoney(input.approvedCos),
    atp: roundMoney(input.atp),
    inReview: roundMoney(input.inReview),
    placeholder: roundMoney(input.placeholder),
    revised,
    siteline: input.siteline,
    difference: input.siteline == null ? null : roundMoney(revised - input.siteline),
  };
}

export function pfBilling(input: {
  billed: number;
  retainage: number;
  ar: number;
  percentComplete: number | null;
  siteline: number | null;
  revised: number;
}): PfBillingBlock {
  const billed = roundMoney(input.billed);
  const retainage = roundMoney(input.retainage);
  const contract = input.siteline ?? (input.revised > 0 ? input.revised : null);
  const backlog = contract == null ? null : roundMoney(contract - billed);
  const pctBilled = contract == null ? null : ratio(billed, contract);
  const nearDone =
    contract != null && billed >= contract * 0.99 && (backlog ?? 0) <= retainage + 1;
  const retentionOnly = (input.percentComplete != null && input.percentComplete >= 99) || nearDone;
  return {
    billed,
    retainage,
    backlog,
    ar: roundMoney(input.ar),
    pctBilled,
    percentComplete: input.percentComplete,
    retentionOnly,
  };
}

export function emptyCost(): PfCostBlock {
  return {
    lab: 0,
    mat: 0,
    sub: 0,
    equ: 0,
    bur: 0,
    ins: 0,
    oth: 0,
    dis: 0,
    total: 0,
    labHours: 0,
    laborRate: null,
    laborWithBurden: 0,
    cashFlow: null,
  };
}

export function pfCost(input: {
  lab: number;
  mat: number;
  sub: number;
  equ: number;
  bur: number;
  ins: number;
  oth: number;
  dis: number;
  labHours: number;
  billed?: number | null;
}): PfCostBlock {
  const lab = roundMoney(input.lab);
  const bur = roundMoney(input.bur);
  const total = roundMoney(
    lab + input.mat + input.sub + input.equ + bur + input.ins + input.oth + input.dis,
  );
  const labHours = roundMoney(input.labHours);
  return {
    lab,
    mat: roundMoney(input.mat),
    sub: roundMoney(input.sub),
    equ: roundMoney(input.equ),
    bur,
    ins: roundMoney(input.ins),
    oth: roundMoney(input.oth),
    dis: roundMoney(input.dis),
    total,
    labHours,
    laborRate: labHours > 0 ? roundMoney(lab / labHours) : null,
    laborWithBurden: roundMoney(lab + bur),
    cashFlow: input.billed == null ? null : roundMoney(input.billed - total),
  };
}

export function withCashFlow(cost: PfCostBlock, billed: number): PfCostBlock {
  return { ...cost, cashFlow: roundMoney(billed - cost.total) };
}

/** Excel Difference Error: Siteline 0 → NOT IN SITELINE; revised ≠ Siteline → FIX. */
export const PF_RECON_TOLERANCE = 0.01;

export function pfRecon(input: {
  revised: number;
  siteline: number | null;
  billed: number;
  costTotal: number | null;
}): PfRecon {
  const siteline = input.siteline;
  let sitelineClearstory: PfSitelineClearstory;
  if (siteline == null || siteline === 0) sitelineClearstory = 'not_in_siteline';
  else if (Math.abs(input.revised - siteline) > PF_RECON_TOLERANCE) sitelineClearstory = 'fix';
  else sitelineClearstory = 'ok';

  const alerts: PfAlert[] = [];
  if (sitelineClearstory === 'not_in_siteline') {
    alerts.push({ code: 'NOT_IN_SITELINE', label: 'NOT IN SITELINE' });
  } else if (sitelineClearstory === 'fix') {
    alerts.push({ code: 'FIX', label: 'FIX' });
  }

  return {
    sitelineClearstory,
    difference: siteline == null ? null : roundMoney(input.revised - siteline),
    overUnderBillings: input.costTotal == null ? null : roundMoney(input.billed - input.costTotal),
    alerts,
  };
}

export function alertCounts(jobs: PfJobRow[]): { fix: number; notInSiteline: number } {
  return {
    fix: jobs.filter((j) => j.recon.sitelineClearstory === 'fix').length,
    notInSiteline: jobs.filter((j) => j.recon.sitelineClearstory === 'not_in_siteline').length,
  };
}

export function foundationCompaniesForJob(
  byEntityJob: Map<string, PfCostBlock>,
  jobKey: string,
): PfBomCompany[] {
  return PF_COMPANIES.map(({ entityId, company }) => {
    const c = byEntityJob.get(`${entityId}:${jobKey}`);
    return {
      entityId,
      company,
      materialCost: c?.mat ?? 0,
      laborHours: c?.labHours ?? 0,
    };
  });
}

export function pfBom(input: {
  companies: PfBomCompany[];
  contractAmount: number;
  approvedCos: number;
  completionPct: number | null;
  trimble: {
    projectIds: number[];
    itemCount: number;
    ordered: number;
    received: number;
    orderedMinusReceived: number;
    actualCost: number;
    laborHours: number;
    estLaborHours: number;
    bomBudget: number;
    remaining: number | null;
    pctUsed: number | null;
  } | null;
}): PfBom {
  const totals = {
    materialCost: roundMoney(input.companies.reduce((s, c) => s + c.materialCost, 0)),
    laborHours: roundMoney(input.companies.reduce((s, c) => s + c.laborHours, 0)),
  };
  const totalContract = roundMoney(input.contractAmount + input.approvedCos);
  const completionPct = input.completionPct;
  const materialShare = ratio(totals.materialCost, totalContract);
  const laborShare =
    input.trimble && input.trimble.estLaborHours > 0
      ? ratio(input.trimble.laborHours, input.trimble.estLaborHours)
      : null;
  const trimble = input.trimble
    ? {
        ...input.trimble,
        bomBudgetPct: ratio(input.trimble.actualCost, input.trimble.bomBudget),
      }
    : null;
  return {
    companies: input.companies,
    totals,
    clearstory: {
      contract: roundMoney(input.contractAmount),
      approvedCos: roundMoney(input.approvedCos),
      totalContract,
      completionPct,
    },
    trimble,
    vsCompletion: {
      materialVsCompletion:
        materialShare == null || completionPct == null ? null : roundMoney(materialShare - completionPct),
      laborVsCompletion:
        laborShare == null || completionPct == null ? null : roundMoney(laborShare - completionPct),
    },
  };
}

export function emptyBom(): PfBom {
  return pfBom({
    companies: PF_COMPANIES.map(({ entityId, company }) => ({
      entityId,
      company,
      materialCost: 0,
      laborHours: 0,
    })),
    contractAmount: 0,
    approvedCos: 0,
    completionPct: null,
    trimble: null,
  });
}

export function pfJobStatus(hasSl: boolean, slActive: boolean, hasCs: boolean): PfJobStatus {
  if (hasSl && slActive) return 'active';
  if (hasSl && !hasCs) return 'siteline_only';
  if (!hasSl && hasCs) return 'clearstory_only';
  return 'inactive';
}

export function rollupSummary(jobs: PfJobRow[]): PfSummaryRow[] {
  const byPm = new Map<string, PfJobRow[]>();
  for (const job of jobs) {
    const pm = job.pm?.trim() || '(unassigned)';
    const list = byPm.get(pm) ?? [];
    list.push(job);
    byPm.set(pm, list);
  }

  const rows = [...byPm.entries()].map(([pm, list]) => {
    const active = list.filter((j) => j.status === 'active');
    const money = active.length ? active : list;
    const activeBillings = roundMoney(money.reduce((s, j) => s + j.billing.billed, 0));
    const backlog = roundMoney(money.reduce((s, j) => s + (j.billing.backlog ?? 0), 0));
    const ar = roundMoney(money.reduce((s, j) => s + j.billing.ar, 0));
    const atp = roundMoney(money.reduce((s, j) => s + j.contract.atp, 0));
    const withCost = money.filter((j) => j.sources.foundation);
    const totalCost = roundMoney(withCost.reduce((s, j) => s + j.cost.total, 0));
    const cashFlow = withCost.length
      ? roundMoney(withCost.reduce((s, j) => s + (j.cost.cashFlow ?? 0), 0))
      : null;
    return {
      pm,
      activeBillings,
      backlog,
      ar,
      atp,
      atpPctOfBillings: ratio(atp, activeBillings),
      openJobs: list.length,
      activeJobs: active.length,
      retentionOnly: list.filter((j) => j.billing.retentionOnly).length,
      totalCost,
      cashFlow,
      fixCount: list.filter((j) => j.recon.sitelineClearstory === 'fix').length,
      notInSitelineCount: list.filter((j) => j.recon.sitelineClearstory === 'not_in_siteline').length,
      overhead: null,
      billingsVsExpense: null,
      net: null,
      pctNet: null,
      netWith75Atp: null,
    } satisfies PfSummaryRow;
  });

  rows.sort((a, b) => a.pm.localeCompare(b.pm));
  return rows;
}

export function sumSummary(rows: PfSummaryRow[]): PfSummaryRow {
  const activeBillings = roundMoney(rows.reduce((s, r) => s + r.activeBillings, 0));
  const atp = roundMoney(rows.reduce((s, r) => s + r.atp, 0));
  return {
    pm: 'Total',
    activeBillings,
    backlog: roundMoney(rows.reduce((s, r) => s + r.backlog, 0)),
    ar: roundMoney(rows.reduce((s, r) => s + r.ar, 0)),
    atp,
    atpPctOfBillings: ratio(atp, activeBillings),
    openJobs: rows.reduce((s, r) => s + r.openJobs, 0),
    activeJobs: rows.reduce((s, r) => s + r.activeJobs, 0),
    retentionOnly: rows.reduce((s, r) => s + r.retentionOnly, 0),
    totalCost: roundMoney(rows.reduce((s, r) => s + r.totalCost, 0)),
    cashFlow: rows.some((r) => r.cashFlow != null)
      ? roundMoney(rows.reduce((s, r) => s + (r.cashFlow ?? 0), 0))
      : null,
    fixCount: rows.reduce((s, r) => s + r.fixCount, 0),
    notInSitelineCount: rows.reduce((s, r) => s + r.notInSitelineCount, 0),
    overhead: null,
    billingsVsExpense: null,
    net: null,
    pctNet: null,
    netWith75Atp: null,
  };
}

export const PF_NOT_WIRED = [
  'excel_pm_contacts',
  'five_week_manpower',
  'startup_budgets',
] as const;
