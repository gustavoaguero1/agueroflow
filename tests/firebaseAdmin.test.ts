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

test('FIREBASE_SERVICE_ACCOUNT wins over ADC on Cloud Run', async () => {
  const { generateKeyPairSync } = await import('node:crypto');
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({
    project_id: 'demo', client_email: 'sa@demo.iam.gserviceaccount.com',
    private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  });
  process.env.K_SERVICE = 'svc';
  delete process.env.FIREBASE_ADMIN_DISABLE_ADC;
  assert.deepEqual(adminStatus(), { enabled: true, reason: undefined, credential: 'service-account' });
});

test('malformed FIREBASE_SERVICE_ACCOUNT falls back to ADC', () => {
  process.env.FIREBASE_SERVICE_ACCOUNT = '{not json';
  process.env.K_SERVICE = 'svc';
  delete process.env.FIREBASE_ADMIN_DISABLE_ADC;
  assert.equal(adminStatus().credential, 'adc');
});
