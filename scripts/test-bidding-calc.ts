/**
 * Golden test for the bidding calc engine against estimate IDC6098.
 * Expected (from BiddingSheet.xlsx Base Bid): MIKE = 43,837.68, PJ = 47,600.
 * No DB needed. Usage: npm run test-bidding-calc
 */
import { runBidCalc, BidCalcContext } from '../src/bidding/bidding-calc';

const ctx: BidCalcContext = {
  baseBid: {
    marginPercent: 0.25,
    projectState: 'DC',
    salesTaxApplicable: true,
    stateSalesTaxRate: 0.06,
    hoursPerDay: 8,
    daysPerWeek: 5,
    durationMonths: 2,
    startInMonths: 6,
    bidDate: '2026-04-29',
    parking: true,
    parkingCostPerDay: 25,
    liftsNeeded: false,
    liftPercentage: 1,
    liftCostPer4Weeks: 550,
    materialEscalationPerYear: 0.04,
    laborRateCompositePerHour: 51.7,
    wageRateLabel: 'NON-SCALE',
  },
  systems: [
    { key: 'duct1', used: true, materials: 3268.95, laborHours: 228.52, mikeTotalPrice: 19515.92, quantity: 5455.98 },
    { key: 'hydronic1', used: true, materials: 5187.54, laborHours: 259.07, mikeTotalPrice: 24321.76, quantity: 1129.84 },
  ],
};

const result = runBidCalc(ctx);
const mike = Number(result.computed['baseBid.mikeEstimate']);
const pj = Number(result.computed['baseBid.pjEstimate']);

const expectMike = 43837.68;
const expectPj = 47600;
const okMike = Math.abs(mike - expectMike) < 0.01;
const okPj = Math.abs(pj - expectPj) < 0.01;

console.log('Calc version :', result.version);
console.log('computed     :', JSON.stringify(result.computed, null, 2));
console.log(`MIKE estimate: ${mike}  (expected ${expectMike})  ${okMike ? 'PASS' : 'FAIL'}`);
console.log(`PJ estimate  : ${pj}  (expected ${expectPj})  ${okPj ? 'PASS' : 'FAIL'}`);
if (result.warnings.length) console.log('warnings:', result.warnings);
if (result.errors.length) console.log('errors:', result.errors);

if (!okMike || !okPj) {
  console.error('\nGOLDEN TEST FAILED');
  process.exit(1);
}
console.log('\nGOLDEN TEST PASSED ✓');
