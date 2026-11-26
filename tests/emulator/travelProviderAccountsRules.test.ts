import test, { after, before, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { assertFails, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { encodeAreas, resolveAreas } from '../../src/permissions/areas.ts';
import type { UserRole } from '../../src/types/index.ts';

let env: RulesTestEnvironment;
const rules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');

const asUser = (uid: string, orgId: string, role: UserRole) =>
  env.authenticatedContext(uid, { orgs: { [orgId]: role }, areas: { [orgId]: encodeAreas(resolveAreas(role)) } }).firestore();

before(async () => {
  env = await initializeTestEnvironment({ projectId: 'agueroflow-travel-accounts-test', firestore: { host: '127.0.0.1', port: 8085, rules } });
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'travel_provider_accounts/org_a__u_admin'), {
      orgId: 'org_a', uid: 'u_admin', provider: 'martravel', login: 'a@b.com', password: { iv: 'x', tag: 'y', data: 'z' },
    });
  });
});

after(async () => { await env.cleanup(); });

test('conta da Mar Travel: nem o próprio dono lê ou grava pelo navegador (só o servidor)', async () => {
  const dono = asUser('u_admin', 'org_a', 'Admin');
  await assertFails(getDoc(doc(dono, 'travel_provider_accounts/org_a__u_admin')));
  await assertFails(setDoc(doc(dono, 'travel_provider_accounts/org_a__u_admin'), { orgId: 'org_a', login: 'outro' }));
  await assertFails(deleteDoc(doc(dono, 'travel_provider_accounts/org_a__u_admin')));
  await assertFails(getDoc(doc(asUser('u_x', 'org_b', 'Admin'), 'travel_provider_accounts/org_a__u_admin')));
});
