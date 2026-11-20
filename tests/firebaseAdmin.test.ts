import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { getAdmin, adminStatus, resetAdminForTests } from '../server/firebaseAdmin.ts';

const KEYS = ['GOOGLE_APPLICATION_CREDENTIALS', 'FIREBASE_SERVICE_ACCOUNT', 'K_SERVICE', 'FIRESTORE_EMULATOR_HOST', 'FIREBASE_ADMIN_DISABLE_ADC'];
let saved: Record<string, string | undefined>;
beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
  process.env.FIREBASE_ADMIN_DISABLE_ADC = '1';
  resetAdminForTests();
});
afterEach(() => {
  for (const k of KEYS) saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k]);
  resetAdminForTests();
});

test('disabled without credentials', () => {
  assert.equal(getAdmin(), null);
  assert.equal(adminStatus().enabled, false);
  assert.ok(adminStatus().reason);
});

test('malformed FIREBASE_SERVICE_ACCOUNT is disabled', () => {
  process.env.FIREBASE_SERVICE_ACCOUNT = '{not json';
  assert.equal(getAdmin(), null);
  assert.equal(adminStatus().enabled, false);
});
