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

test('service account accepted in pasted formats (base64, raw newlines, wrapping quotes)', async () => {
  const { parseServiceAccount } = await import('../server/firebaseAdmin.ts');
  const { generateKeyPairSync } = await import('node:crypto');
  const pem = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
  const sa = { project_id: 'demo', client_email: 'sa@demo.iam.gserviceaccount.com', private_key: pem };
  const json = JSON.stringify(sa);
  const ok = (raw: string) => assert.equal(parseServiceAccount(raw).private_key, pem, raw.slice(0, 30));
  ok(json);
  ok(Buffer.from(json).toString('base64'));
  ok(JSON.stringify(sa, null, 2).replace(/\\n/g, '\n')); // editor turned \n escapes into real line breaks
  ok(`'${json}'`);
  ok(`"${json.replace(/"/g, '\\"')}"`);
  assert.throws(() => parseServiceAccount('{not json'));
});

test('secretShape describes a value without revealing it', async () => {
  const { secretShape } = await import('../server/firebaseAdmin.ts');
  const s = secretShape('{"type":"service_account","private_key":"SECRETVALUE"}');
  assert.match(s, /tamanho 54/);
  assert.match(s, /começa com '\{'/);
  assert.match(s, /private_key: sim/);
  assert.doesNotMatch(s, /SECRETVALUE/);
});

test('split FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY (\\n escaped) is used', async () => {
  const { generateKeyPairSync } = await import('node:crypto');
  const pem = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
  delete process.env.FIREBASE_SERVICE_ACCOUNT;
  process.env.FIREBASE_CLIENT_EMAIL = 'sa@demo.iam.gserviceaccount.com';
  process.env.FIREBASE_PRIVATE_KEY = pem.replace(/\n/g, '\\n');
  process.env.K_SERVICE = 'svc';
  try {
    assert.equal(adminStatus().credential, 'service-account');
  } finally { delete process.env.FIREBASE_CLIENT_EMAIL; delete process.env.FIREBASE_PRIVATE_KEY; }
});
