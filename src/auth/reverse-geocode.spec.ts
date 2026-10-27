import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { shortAddress } from './reverse-geocode';

test('builds a short address from the parts, skipping repeats', () => {
  assert.equal(
    shortAddress({
      name: 'The Space Co-Working',
      address: { road: 'Araien Road', neighbourhood: 'Block G4', suburb: 'Johar Town', city: 'Lahore' },
    }),
    'The Space Co-Working, Araien Road, Block G4, Johar Town, Lahore',
  );
  assert.equal(shortAddress({ address: { road: 'Mayo Street', suburb: 'Johar Town', city: 'Lahore' } }), 'Mayo Street, Johar Town, Lahore');
});

test('falls back to the first parts of the full name, or null', () => {
  assert.equal(shortAddress({ display_name: 'A, B, C, D, E, F' }), 'A, B, C, D');
  assert.equal(shortAddress({}), null);
});
