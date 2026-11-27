import test, { after, before, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { encodeAreas, resolveAreas } from '../../src/permissions/areas.ts';
import type { UserRole } from '../../src/types/index.ts';

let env: RulesTestEnvironment;
const rules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
const asUser = (uid: string, orgId: string, role: UserRole) =>
  env.authenticatedContext(uid, { orgs: { [orgId]: role }, areas: { [orgId]: encodeAreas(resolveAreas(role)) } }).firestore();

const PRIVADOS = [
  'ponto_marcacoes/e1__000000001', 'ponto_eventos/e1__000000002', 'ponto_estab_state/e1', 'ponto_clientids/org_a__c1',
  'ponto_pessoas/org_a__r1', 'ponto_devices/d1', 'ponto_pairings/ABCD2345', 'ponto_ajustes/a1', 'ponto_estabelecimentos/e1',
];

before(async () => {
  env = await initializeTestEnvironment({ projectId: 'agueroflow-ponto-rules-test', firestore: { host: '127.0.0.1', port: 8085, rules } });
});
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    for (const p of PRIVADOS) await setDoc(doc(ctx.firestore(), p), { orgId: 'org_a' });
    await setDoc(doc(ctx.firestore(), 'ops_orgs/org_a/ponto_dia/2026-11-25'), { linhas: {} });
  });
});
after(async () => { await env.cleanup(); });

test('coleções do ponto: nem Admin lê ou grava pelo navegador', async () => {
  const admin = asUser('u_admin', 'org_a', 'Admin');
  for (const p of PRIVADOS) {
    await assertFails(getDoc(doc(admin, p)));
    await assertFails(setDoc(doc(admin, p), { orgId: 'org_a' }));
  }
});

test('ponto_dia: Operações lê, ninguém grava pelo navegador', async () => {
  const ops = asUser('u_ops', 'org_a', 'Operacional');
  await assertSucceeds(getDoc(doc(ops, 'ops_orgs/org_a/ponto_dia/2026-11-25')));
  await assertFails(setDoc(doc(ops, 'ops_orgs/org_a/ponto_dia/2026-11-25'), { linhas: {} }));
  await assertFails(setDoc(doc(asUser('u_admin', 'org_a', 'Admin'), 'ops_orgs/org_a/ponto_dia/2026-11-26'), { linhas: {} }));
  await assertFails(getDoc(doc(asUser('u_x', 'org_b', 'Admin'), 'ops_orgs/org_a/ponto_dia/2026-11-25')));
});
