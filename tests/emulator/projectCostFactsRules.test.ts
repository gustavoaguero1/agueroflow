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
    await setDoc(doc(db, 'projects', 'prj_a'), { orgId: 'org_a', code: 'OBRA-A', name: 'Obra A' });
    await setDoc(doc(db, 'projects', 'prj_b'), { orgId: 'org_b', code: 'OBRA-B', name: 'Obra B' });
  });
});

after(async () => {
  await env?.cleanup();
});

test('project_cost_facts enforces org/project ownership, append-only immutability, and explicit reversal flag for negative amounts', async () => {
  const supA = env.authenticatedContext('sup_a', { orgs: { org_a: 'Supervisor' } }).firestore();
  const opA = env.authenticatedContext('op_a', { orgs: { org_a: 'Operacional' } }).firestore();
  const adminB = env.authenticatedContext('admin_b', { orgs: { org_b: 'Admin' } }).firestore();

  const validFact = {
    id: 'cf_1',
    orgId: 'org_a',
    projectId: 'prj_a',
    source: 'field_expense',
    stage: 'realizado',
    sourceId: 'exp_1',
    idempotencyKey: 'org_a__field_expense__exp_1',
    occurredAt: '2026-11-25',
    description: 'Despesa de deslocamento obra A',
    amount: 450,
    createdByUid: 'sup_a',
    createdByName: 'Supervisor A',
    createdAt: '2026-11-25T10:00:00.000Z',
  };

  // Supervisor with Ops/Fin level 2 creates valid cost fact
  await assertSucceeds(setDoc(doc(supA, 'project_cost_facts', 'cf_1'), validFact));

  // Negative amount without isReversal: true is denied
  await assertFails(
    setDoc(doc(supA, 'project_cost_facts', 'cf_bad_neg'), {
      ...validFact,
      id: 'cf_bad_neg',
      amount: -100,
    }),
  );

  // Explicit reversal entry with negative amount succeeds
  await assertSucceeds(
    setDoc(doc(supA, 'project_cost_facts', 'cf_rev_1'), {
      ...validFact,
      id: 'cf_rev_1',
      amount: -100,
      isReversal: true,
      reversedFactId: 'cf_1',
    }),
  );

  // Cross-org project reference is denied
  await assertFails(
    setDoc(doc(supA, 'project_cost_facts', 'cf_cross_proj'), {
      ...validFact,
      id: 'cf_cross_proj',
      projectId: 'prj_b',
    }),
  );

  // Operacional can read own-org fact, cannot create
  await assertSucceeds(getDoc(doc(opA, 'project_cost_facts', 'cf_1')));
  await assertFails(
    setDoc(doc(opA, 'project_cost_facts', 'cf_op'), {
      ...validFact,
      id: 'cf_op',
      createdByUid: 'op_a',
    }),
  );

  // Cross-org Admin cannot read
  await assertFails(getDoc(doc(adminB, 'project_cost_facts', 'cf_1')));

  // Append-only: update and delete are always denied
  await assertFails(updateDoc(doc(supA, 'project_cost_facts', 'cf_1'), { amount: 999 }));
  await assertFails(deleteDoc(doc(supA, 'project_cost_facts', 'cf_1')));
});
