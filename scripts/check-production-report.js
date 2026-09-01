/**
 * Self-check: production report helpers (earned hours + commodity dedupe + status).
 * Usage: node scripts/check-production-report.js
 * Requires: npm run build (dist/bidding/specs/specs-engine.js)
 */
const {
  hoursFromQuantity,
  commodityKey,
  buildProductionReportLines,
  sumProductionHours,
  productionStatus,
} = require('../dist/bidding/specs/specs-engine');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// PJ example: 40,000 SF / 25.34 ≈ 1578.53 hours
const earned = hoursFromQuantity(40000, 25.34);
assert(earned != null && Math.abs(earned - 40000 / 25.34) < 1e-9, `earned hours got ${earned}`);
assert(hoursFromQuantity(100, null) == null, 'null PPH → null hours');
assert(hoursFromQuantity(100, 0) == null, 'zero PPH → null hours');

const keyRoll = commodityKey({
  catalogMatchMode: 'roll',
  materialBase: 'Duct Wrap',
  size: 48,
  thickness: 2,
  weight: '0.75',
  facing: 'FSK',
});
const keyRollOtherSize = commodityKey({
  catalogMatchMode: 'roll',
  materialBase: 'Duct Wrap',
  size: 12,
  thickness: 2,
  weight: '0.75',
  facing: 'FSK',
});
assert(keyRoll === keyRollOtherSize, 'roll commodity ignores size');

const lines = buildProductionReportLines([
  {
    id: 1,
    type: 'Duct',
    insulation: 'FIBERGLASS DUCT WRAP',
    size: 48,
    thickness: 2,
    materialBase: 'Duct Wrap',
    catalogMatchMode: 'roll',
    weight: '0.75',
    facing: 'FSK',
    qtyEstimated: 81873,
    hoursEstimated: 3231,
    productionPerHour: 25.34,
    qtyReceived: 100,
    qtyReceivedSf: 40000,
    hoursEstimatedFromReceived: earned,
  },
  {
    id: 2,
    type: 'Duct',
    insulation: 'FIBERGLASS DUCT WRAP',
    size: 12,
    thickness: 2,
    materialBase: 'Duct Wrap',
    catalogMatchMode: 'roll',
    weight: '0.75',
    facing: 'FSK',
    qtyEstimated: 81873,
    hoursEstimated: 3231,
    productionPerHour: 25.34,
    qtyReceived: 100,
    qtyReceivedSf: 40000,
    hoursEstimatedFromReceived: earned,
  },
]);
assert(lines.length === 1, `expected 1 commodity, got ${lines.length}`);
assert(lines[0].specLineIds.length === 2, 'both Spec line ids kept');
assert(lines[0].size === 0, 'roll size normalized to 0');

const totals = sumProductionHours(lines);
assert(
  Math.abs(totals.hoursEstimatedFromReceived - earned) < 0.01,
  'dedupe must not double-count earned hours',
);

assert(productionStatus(1578, 5000) === 'red', 'over labor → red');
assert(productionStatus(6000, 5000) === 'green', 'under labor → green');
assert(productionStatus(100, null) === 'unknown', 'no actual → unknown');

console.log('check-production-report: ok');
