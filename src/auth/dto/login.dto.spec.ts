import 'reflect-metadata';
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { LoginDto } from './login.dto';

const errors = (body: object) =>
  validateSync(plainToInstance(LoginDto, body), { whitelist: true }).flatMap((e) => [
    ...Object.values(e.constraints ?? {}),
    ...(e.children ?? []).flatMap((c) => Object.values(c.constraints ?? {})),
  ]);

const base = { email: 'a@goelservices.com', password: 'secret1' };
const loc = { latitude: 38.9072, longitude: -77.0369, accuracy: 18, floor: '3' };

test('sign-in with location and floor passes', () => {
  assert.deepEqual(errors({ ...base, location: loc }), []);
});

test('sign-in without location is refused', () => {
  assert.ok(errors(base).includes('Your location is required to sign in'));
});

test('floor must be picked', () => {
  assert.ok(errors({ ...base, location: { ...loc, floor: '' } }).includes('Pick the floor you are on'));
});

test('coordinates out of range are refused', () => {
  assert.ok(errors({ ...base, location: { ...loc, latitude: 95 } }).length > 0);
  assert.ok(errors({ ...base, location: { ...loc, longitude: 'x' } }).length > 0);
});
