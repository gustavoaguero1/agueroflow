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
    projectId: 'agueroflow-pr58-p2-mfg-cmms-test',
    firestore: { host: '127.0.0.1', port: 8085, rules },
  });
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'fabrication_orders/of_1'), { id: 'of_1', orgId: 'org_a', code: 'OF-1' });
    await setDoc(doc(db, 'cmms_plans/cmms_1'), { id: 'cmms_1', orgId: 'org_a', title: 'Preventiva' });
    await setDoc(doc(db, 'cmms_records/rec_1'), { id: 'rec_1', orgId: 'org_a', type: 'corretiva' });
  });
});

after(async () => {
  await env.cleanup();
});

test('fabrication_orders, cmms_plans e cmms_records exigem Operações da mesma empresa e escrita server-only', async () => {
  const ops = asUser('u_ops', 'org_a', 'Operacional');
  const noOps = asUser('u_no_ops', 'org_a', 'Supervisor', { operacoes: 0 });
  const otherOrg = asUser('u_other', 'org_b', 'Admin');
  const admin = asUser('u_admin', 'org_a', 'Admin');

  for (const path of ['fabrication_orders/of_1', 'cmms_plans/cmms_1', 'cmms_records/rec_1']) {
    await assertSucceeds(getDoc(doc(ops, path)));
    await assertFails(getDoc(doc(noOps, path)));
    await assertFails(getDoc(doc(otherOrg, path)));
    await assertFails(setDoc(doc(admin, `${path}_client`), { orgId: 'org_a' }));
  }
});
