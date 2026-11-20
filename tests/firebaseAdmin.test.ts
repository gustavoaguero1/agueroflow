import test from 'node:test';
import assert from 'node:assert/strict';
import { getAdmin, adminStatus, resetAdminForTests } from '../server/firebaseAdmin.ts';

test('disabled without credentials', () => {
  for (const k of ['GOOGLE_APPLICATION_CREDENTIALS', 'FIREBASE_SERVICE_ACCOUNT', 'K_SERVICE', 'FIRESTORE_EMULATOR_HOST']) delete process.env[k];
  process.env.FIREBASE_ADMIN_DISABLE_ADC = '1';
  resetAdminForTests();
  assert.equal(getAdmin(), null);
  assert.equal(adminStatus().enabled, false);
  assert.ok(adminStatus().reason);
});
