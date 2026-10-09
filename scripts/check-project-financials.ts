/**
 * Self-check: Project Financials join math (contract / billing / PM rollup).
 * Usage: npx ts-node scripts/check-project-financials.ts
 */
import {
  emptyFoundationMaps,
  pickFoundationCost,
} from '../src/project-financials/foundation-job-cost';
import { jobNumbersEquivalent, sitelineContractMatchesJob } from '../src/common/job-number-match.util';
import {
  pfBilling,
  pfContract,
  pfBom,
  pfCost,
  pfRecon,
  pfJobKey,
  pfJobStatus,
  pickLatestPayApp,
  rollupSummary,
  sumSummary,
  withCashFlow,
  type PfJobRow,
} from '../src/project-financials/project-financials.util';

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

assert(pfJobKey('09920') === '9920', 'job key strips leading zeros');
assert(pfJobKey('12201 - 02') === '12201', 'job key uses leading digits');
assert(jobNumbersEquivalent('12201', '12201 - 02'), 'phase suffix is the same job');
assert(pfJobKey('21138a - M&T') === '21138a', 'lettered job stays');
assert(!jobNumbersEquivalent('21138', '21138a'), '21138 is not 21138a');
assert(
  sitelineContractMatchesJob(
    { projectName: '21138 - M&T', internalProjectNumber: '21138' },
    '21138',
  ),
  'base contract matches 21138',
);
assert(
  !sitelineContractMatchesJob(
    { projectName: '21138a - M&T', internalProjectNumber: '21138' },
    '21138',
  ),
  '21138a is not pulled into 21138',
);
assert(
  sitelineContractMatchesJob(
    { projectName: '21138a - M&T', internalProjectNumber: '21138' },
    '21138a',
  ),
  '21138a matches itself',
);

assert(pickLatestPayApp([{ number: 1 }, { number: 4 }, { number: 2 }])?.number === 4, 'latest pay app');
assert(pickLatestPayApp([]) === null, 'empty pay apps');

const contract = pfContract({
  amount: 100000,
  approvedCos: 5000,
  atp: 2000,
  inReview: 100,
  placeholder: 50,
  siteline: 104000,
});
assert(contract.revised === 105000, 'revised = contract + approved COs');
assert(contract.difference === 1000, 'difference = revised − siteline');

assert(pfRecon({ revised: 105000, siteline: 0, billed: 0, costTotal: null }).sitelineClearstory === 'not_in_siteline', 'Excel NOT IN SITELINE');
assert(pfRecon({ revised: 105000, siteline: 104000, billed: 0, costTotal: null }).sitelineClearstory === 'fix', 'Excel FIX');
assert(pfRecon({ revised: 105000, siteline: 105000, billed: 0, costTotal: null }).sitelineClearstory === 'ok', 'match ok');
assert(pfRecon({ revised: 105000, siteline: 104000, billed: 80000, costTotal: 55500 }).overUnderBillings === 24500, 'over/under = billed − cost');
assert(pfRecon({ revised: 105000, siteline: 104000, billed: 0, costTotal: null }).alerts[0]?.code === 'FIX', 'FIX alert');

const billing = pfBilling({
  billed: 80000,
  retainage: 4000,
  ar: 12000,
  percentComplete: 80,
  siteline: 104000,
  revised: 105000,
});
assert(billing.backlog === 24000, 'backlog = siteline − billed');
assert(billing.pctBilled === 0.77, 'pct billed 80000/104000');
assert(billing.retentionOnly === false, '80% is not retention-only');

const done = pfBilling({
  billed: 104000,
  retainage: 5000,
  ar: 5000,
  percentComplete: 100,
  siteline: 104000,
  revised: 105000,
});
assert(done.retentionOnly === true, '100% billed is retention-only');
assert(done.backlog === 0, 'fully billed backlog 0');

assert(pfJobStatus(true, true, true) === 'active', 'active');
assert(pfJobStatus(true, false, false) === 'siteline_only', 'siteline only');
assert(pfJobStatus(false, false, true) === 'clearstory_only', 'cs only');
assert(pfJobStatus(true, false, true) === 'inactive', 'inactive sl');

const cost = withCashFlow(
  pfCost({
    lab: 40000,
    mat: 8000,
    sub: 2000,
    equ: 1500,
    bur: 3000,
    ins: 500,
    oth: 400,
    dis: 100,
    labHours: 800,
  }),
  80000,
);
assert(cost.total === 55500, 'cost total');
assert(cost.equ === 1500, 'own+rent equipment already summed');
assert(cost.laborRate === 50, 'lab / hours');
assert(cost.laborWithBurden === 43000, 'LAB + BUR');
assert(cost.cashFlow === 24500, 'billed − cost');

const maps = emptyFoundationMaps();
maps.ok = true;
maps.byEntityJob.set('3:21038', cost);
maps.byJob.set('21038', [cost]);
assert(pickFoundationCost(maps, 3, '21038')?.total === 55500, 'pick by entity+job');
assert(pickFoundationCost(maps, 1, '21038')?.total === 55500, 'fallback to job when entity misses');

const bom = pfBom({
  companies: [
    { entityId: 1, company: 'GOEL', materialCost: 8000, laborHours: 800 },
    { entityId: 2, company: 'GOEL DC', materialCost: 0, laborHours: 0 },
    { entityId: 3, company: 'DCB', materialCost: 2000, laborHours: 100 },
  ],
  contractAmount: 100000,
  approvedCos: 5000,
  completionPct: 0.77,
  trimble: {
    projectIds: [1],
    itemCount: 10,
    ordered: 50,
    received: 40,
    orderedMinusReceived: 10,
    actualCost: 9000,
    laborHours: 200,
    estLaborHours: 400,
    bomBudget: 12000,
    remaining: 3000,
    pctUsed: 0.75,
  },
});
assert(bom.totals.materialCost === 10000, 'BOM material totals');
assert(bom.trimble?.orderedMinusReceived === 10, 'ordered − received');
assert(bom.clearstory.totalContract === 105000, 'BOM CS total contract');
assert(bom.vsCompletion.laborVsCompletion === -0.27, 'labor share 0.5 − completion 0.77');

const sample: PfJobRow = {
  jobNumber: '21038',
  name: 'Test',
  customer: 'GC',
  city: 'Baltimore',
  state: 'MD',
  entityId: 3,
  company: 'DCB',
  pm: 'Dave Rosowski',
  pmEmail: 'dave@example.com',
  status: 'active',
  contract,
  billing,
  cost,
  recon: pfRecon({ revised: contract.revised, siteline: contract.siteline, billed: 80000, costTotal: cost.total }),
  bom,
  sources: { siteline: true, clearstory: true, refJob: false, foundation: true, trimble: true },
};
const rows = rollupSummary([sample]);
assert(rows.length === 1 && rows[0].pm === 'Dave Rosowski', 'one PM row');
assert(rows[0].activeBillings === 80000, 'PM billings');
assert(rows[0].atp === 2000, 'PM ATP');
assert(rows[0].overhead === null, 'OH stays null — no Foundation OH table');
assert(rows[0].totalCost === 55500, 'PM Foundation cost');
assert(rows[0].cashFlow === 24500, 'PM cash flow = billed − cost');
assert(rows[0].fixCount === 1, 'PM FIX count');
assert(rows[0].notInSitelineCount === 0, 'PM not-in-siteline');

const totals = sumSummary(rows);
assert(totals.pm === 'Total' && totals.activeJobs === 1, 'totals');

console.log('check-project-financials: ok');
