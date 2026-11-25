import test, { after, before, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';

let env: RulesTestEnvironment;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-agueroflow',
    firestore: {
      rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8'),
      host: '127.0.0.1',
      port: 8085,
    },
  });
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'measurement_bulletins', 'bm_a'), {
      id: 'bm_a',
      orgId: 'org_a',
      code: 'BM-2026-001',
      status: 'rascunho',
    });
    await setDoc(doc(db, 'measurement_events', 'bmevt_a'), {
      id: 'bmevt_a',
      orgId: 'org_a',
      bulletinId: 'bm_a',
      eventType: 'created',
    });
  });
});

after(async () => {
  await env?.cleanup();
});

test('measurement_bulletins and measurement_events enforce tenant/area reads and server-only writes', async () => {
  const opsA = env.authenticatedContext('ops_a', { orgs: { org_a: 'Operacional' } }).firestore();
  const adminA = env.authenticatedContext('admin_a', { orgs: { org_a: 'Admin' } }).firestore();
  const adminB = env.authenticatedContext('admin_b', { orgs: { org_b: 'Admin' } }).firestore();

  // Same-org authorized readers can read
  await assertSucceeds(getDoc(doc(opsA, 'measurement_bulletins', 'bm_a')));
  await assertSucceeds(getDoc(doc(opsA, 'measurement_events', 'bmevt_a')));

  // Cross-org Admin cannot read
  await assertFails(getDoc(doc(adminB, 'measurement_bulletins', 'bm_a')));
  await assertFails(getDoc(doc(adminB, 'measurement_events', 'bmevt_a')));

  // All client writes (create, update, delete) are denied even for same-org Admin (server-only via /api/measurements)
  await assertFails(
    setDoc(doc(adminA, 'measurement_bulletins', 'bm_client'), {
      id: 'bm_client',
      orgId: 'org_a',
      status: 'aprovado',
    }),
  );
  await assertFails(updateDoc(doc(adminA, 'measurement_bulletins', 'bm_a'), { status: 'aprovado' }));
  await assertFails(deleteDoc(doc(adminA, 'measurement_bulletins', 'bm_a')));
  await assertFails(
    setDoc(doc(adminA, 'measurement_events', 'bmevt_client'), {
      id: 'bmevt_client',
      orgId: 'org_a',
      bulletinId: 'bm_a',
    }),
  );
});
