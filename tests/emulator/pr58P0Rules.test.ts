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
    projectId: 'agueroflow-pr58-p0-test',
    firestore: { host: '127.0.0.1', port: 8085, rules },
  });
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'recurring_order_runs/recrun_org_a_r1_2026-11-25'), {
      id: 'recrun_org_a_r1_2026-11-25',
      orgId: 'org_a',
      recurringOrderId: 'r1',
      periodDate: '2026-11-25',
      status: 'generated',
    });
    await setDoc(doc(db, 'stock_reservations/sres_org_a_k1'), {
      id: 'sres_org_a_k1',
      orgId: 'org_a',
      unitId: 'u1',
      workOrderId: 'wo1',
      itemId: 'it1',
      reservedQty: 10,
      status: 'ativa',
    });
  });
});

after(async () => {
  await env.cleanup();
});

test('recurring_order_runs permite leitura apenas por Operações da mesma empresa e bloqueia escrita do cliente', async () => {
  const ops = asUser('u_ops', 'org_a', 'Operacional');
  const noOps = asUser('u_no_ops', 'org_a', 'Supervisor', { operacoes: 0 });
  const otherOrg = asUser('u_other', 'org_b', 'Admin');

  await assertSucceeds(getDoc(doc(ops, 'recurring_order_runs/recrun_org_a_r1_2026-11-25')));
  await assertFails(getDoc(doc(noOps, 'recurring_order_runs/recrun_org_a_r1_2026-11-25')));
  await assertFails(getDoc(doc(otherOrg, 'recurring_order_runs/recrun_org_a_r1_2026-11-25')));

  // Server-only writes
  const admin = asUser('u_admin', 'org_a', 'Admin');
  await assertFails(setDoc(doc(admin, 'recurring_order_runs/recrun_org_a_client'), { orgId: 'org_a', status: 'generated' }));
});

test('stock_reservations permite leitura por Estoque/Operações da mesma empresa e bloqueia escrita do cliente', async () => {
  const ops = asUser('u_ops', 'org_a', 'Operacional');
  const stockOnly = asUser('u_stock', 'org_a', 'Supervisor', { operacoes: 0, estoque: 1 });
  const neither = asUser('u_none', 'org_a', 'Supervisor', { operacoes: 0, estoque: 0 });
  const otherOrg = asUser('u_other', 'org_b', 'Admin');

  await assertSucceeds(getDoc(doc(ops, 'stock_reservations/sres_org_a_k1')));
  await assertSucceeds(getDoc(doc(stockOnly, 'stock_reservations/sres_org_a_k1')));
  await assertFails(getDoc(doc(neither, 'stock_reservations/sres_org_a_k1')));
  await assertFails(getDoc(doc(otherOrg, 'stock_reservations/sres_org_a_k1')));

  // Server-only writes
  const admin = asUser('u_admin', 'org_a', 'Admin');
  await assertFails(setDoc(doc(admin, 'stock_reservations/sres_org_a_client'), { orgId: 'org_a', reservedQty: 5 }));
});
