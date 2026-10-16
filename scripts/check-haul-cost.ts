/**
 * Same money cases as scripts/check-trucking-log.py. The workbook replay stays in Python.
 */
import {
  SENTINEL_DISPOSAL,
  SENTINEL_HAULER,
  SENTINEL_JOB,
  billableTons,
  disposalCost,
  disposalLabel,
  haulerLabel,
  totalCost,
  truckingCost,
} from '../src/operations/haul-cost';

function close(actual: number, expected: number, label: string) {
  if (Math.abs(actual - expected) > 0.02) {
    throw new Error(`${label}: ${actual} != ${expected}`);
  }
}

close(truckingCost(550, 0, null, SENTINEL_HAULER), 0, 'sentinel haul');
close(disposalCost(500, 0, 0, 0, 0, 10, SENTINEL_DISPOSAL), 0, 'sentinel disposal');
close(totalCost(0, 0), 0, 'sentinel total');

const haul = truckingCost(350, 0, null, 'JRL - Hauler - Baltimore');
const disp = disposalCost(300, 0, 0, 0, 0, null, 'JRL - Disposal - Brick/Concrete');
close(haul, 350, 'flat haul');
close(disp, 300, 'flat disposal');
close(totalCost(haul, disp), 650, 'flat total');

close(truckingCost(630, 0, null, 'McNair'), 630, 'cumberland haul');
close(disposalCost(0, 67, 0, 0, 0, 9.84, 'Cumberland asbestos'), 659.28, 'cumberland disposal');
close(totalCost(630, 659.28), 1289.28, 'cumberland total');

close(truckingCost(0, 85, 1, 'Hammer Head'), 85, 'hourly');
close(truckingCost(0, 85, 2.5, 'Hammer Head'), 212.5, 'hourly 2.5');
close(truckingCost(0, 0, null, 'Goel in house'), 0, 'in house');
close(disposalCost(0, 0, 0, 0, 0, 1.13, 'Joseph Smith non-ferrous'), 0, 'zero recycle');

if (disposalCost(0, 65, 0, 0, 5, 3, 'L&J') !== 0) throw new Error('included tons');
close(disposalCost(0, 65, 0, 0, 5, 10.59, 'L&J'), 65 * 5.59, 'tons over included');
close(disposalCost(740, 125, 0, 0, 0, 2, 'BRC'), 740 + 250, 'load plus ton');
close(disposalCost(0, 0, 20, 20, 0, 9, 'Wirtz'), 400, 'cy flat');
close(billableTons(3, 5), 0, 'under included');
close(billableTons(10.59, 5), 5.59, 'over included');

if (haulerLabel('', 'Hauler') !== 'Z') throw new Error('blank hauler label');
if (disposalLabel('', 'Recycle', 'Dirt') !== 'X') throw new Error('blank disposal label');
if (haulerLabel('A&S Refuse', 'Hauler  - 30 YD can C&D') !== 'A&S Refuse - Hauler  - 30 YD can C&D') {
  throw new Error('hauler label');
}
if (SENTINEL_JOB !== '---') throw new Error('job sentinel');

console.log('check-haul-cost: ok');
