import test, { after, before, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { encodeAreas, resolveAreas } from '../../src/permissions/areas.ts';
import type { UserRole } from '../../src/types/index.ts';

let env: RulesTestEnvironment;
const rules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');

const asUser = (uid: string, orgId: string, role: UserRole, areaOverrides?: Record<string, 0 | 1 | 2>) => {
  const levels = resolveAreas(role, undefined, areaOverrides as any);
  return env.authenticatedContext(uid, {
    orgs: { [orgId]: role },
    areas: { [orgId]: encodeAreas(levels) },
  }).firestore();
};

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'agueroflow-pr58-p1-econ-test',
    firestore: { host: '127.0.0.1', port: 8085, rules },
  });
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'lpu_tables/lpu_ct1_v1'), { id: 'lpu_ct1_v1', orgId: 'org_a', contractId: 'ct1', version: 1 });
    await setDoc(doc(db, 'purchasing_approval_rules/prule_1'), { id: 'prule_1', orgId: 'org_a', minAmount: 0, maxAmount: 5000 });
    await setDoc(doc(db, 'purchasing_approvals/poappr_1'), { id: 'poappr_1', orgId: 'org_a', purchaseOrderId: 'po1' });
  });
});

after(async () => {
  await env.cleanup();
});

test('lpu_tables, purchasing_approval_rules e purchasing_approvals respeitam orgId, áreas e escrita server-only', async () => {
  const com = asUser('u_com', 'org_a', 'Gerente', { comercial: 1, operacoes: 0, financeiro: 0, estoque: 0 });
  const stock = asUser('u_stock', 'org_a', 'Supervisor', { estoque: 1, financeiro: 0, operacoes: 0, comercial: 0 });
  const none = asUser('u_none', 'org_a', 'Supervisor', { comercial: 0, operacoes: 0, financeiro: 0, estoque: 0 });
  const otherOrg = asUser('u_other', 'org_b', 'Admin');
  const admin = asUser('u_admin', 'org_a', 'Admin');

  await assertSucceeds(getDoc(doc(com, 'lpu_tables/lpu_ct1_v1')));
  await assertFails(getDoc(doc(none, 'lpu_tables/lpu_ct1_v1')));
  await assertFails(getDoc(doc(otherOrg, 'lpu_tables/lpu_ct1_v1')));
  await assertFails(setDoc(doc(admin, 'lpu_tables/lpu_client'), { orgId: 'org_a', version: 2 }));

  await assertSucceeds(getDoc(doc(stock, 'purchasing_approval_rules/prule_1')));
  await assertSucceeds(getDoc(doc(stock, 'purchasing_approvals/poappr_1')));
  await assertFails(getDoc(doc(none, 'purchasing_approval_rules/prule_1')));
  await assertFails(getDoc(doc(otherOrg, 'purchasing_approvals/poappr_1')));
  await assertFails(setDoc(doc(admin, 'purchasing_approvals/poappr_client'), { orgId: 'org_a' }));
});
