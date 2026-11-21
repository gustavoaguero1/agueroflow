import test, { before, after } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { ref, uploadBytes, getBytes } from 'firebase/storage';

let env: RulesTestEnvironment;
const jpg = new Uint8Array([1, 2, 3]);

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-agueroflow',
    storage: { rules: readFileSync('storage.rules', 'utf8'), host: 'localhost', port: 9199 },
  });
});
after(async () => { await env?.cleanup(); });

const st = (claims?: Record<string, unknown>) =>
  (claims ? env.authenticatedContext('u1', claims) : env.unauthenticatedContext()).storage();

test('org member writes/reads own org photos only', async () => {
  const s = st({ orgs: { org_a: 'Operacional' } });
  await assertSucceeds(uploadBytes(ref(s, 'work-orders/org_a/wo1/antes_1.jpg'), jpg, { contentType: 'image/jpeg' }));
  await assertSucceeds(getBytes(ref(s, 'work-orders/org_a/wo1/antes_1.jpg')));
  await assertFails(uploadBytes(ref(s, 'work-orders/org_b/wo1/antes_1.jpg'), jpg, { contentType: 'image/jpeg' }));
  await assertFails(getBytes(ref(st({ orgs: { org_b: 'Admin' } }), 'work-orders/org_a/wo1/antes_1.jpg')));
});

test('non-image, anonymous and other paths are denied; master allowed', async () => {
  const s = st({ orgs: { org_a: 'Admin' } });
  await assertFails(uploadBytes(ref(s, 'work-orders/org_a/wo1/x.svg'), jpg, { contentType: 'image/svg+xml' }));
  await assertFails(uploadBytes(ref(s, 'work-orders/org_a/wo1/x.pdf'), jpg, { contentType: 'application/pdf' }));
  await assertFails(uploadBytes(ref(s, 'other/org_a/x.jpg'), jpg, { contentType: 'image/jpeg' }));
  await assertFails(uploadBytes(ref(st(), 'work-orders/org_a/wo1/x.jpg'), jpg, { contentType: 'image/jpeg' }));
  await assertSucceeds(uploadBytes(ref(st({ master: true }), 'work-orders/org_z/wo1/x.jpg'), jpg, { contentType: 'image/jpeg' }));
});
