import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { distanceM, rankOffices } from './office-distance';

// The Space Co-Working (roughly) and the browser's guess from the screenshot, ~80 m apart.
const SPACE = { id: 1, name: 'The Space Co-Working', latitude: 31.47295, longitude: 74.27145 };
const FAR = { id: 2, name: 'DC office', latitude: 38.9072, longitude: -77.0369 };
const guess = { latitude: 31.47347, longitude: 74.27072 };

test('distance between two nearby points is in metres', () => {
  const d = distanceM(guess.latitude, guess.longitude, SPACE.latitude, SPACE.longitude);
  assert.ok(d > 60 && d < 110, String(d));
});

test('nearest office inside the accuracy circle is suggested', () => {
  const r = rankOffices([FAR, SPACE], { ...guess, accuracy: 500 });
  assert.deepEqual(r.offices.map((o) => o.id), [1, 2]);
  assert.equal(r.suggestedId, 1);
});

test('a very accurate reading still matches an office within 150 m', () => {
  assert.equal(rankOffices([SPACE], { ...guess, accuracy: 10 }).suggestedId, 1);
});

test('nothing is suggested when the nearest office is out of range', () => {
  assert.equal(rankOffices([FAR], { ...guess, accuracy: 500 }).suggestedId, null);
  assert.equal(rankOffices([], { ...guess, accuracy: 500 }).suggestedId, null);
});
