import test, { before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, query, where } from 'firebase/firestore';
import { encodeAreas, resolveAreas } from '../../src/permissions/areas.ts';

// Acesso por área nas regras (ver src/permissions/areas.ts).
let env: RulesTestEnvironment;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-agueroflow',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: 'localhost', port: 8085 },
  });
});
after(async () => { await env?.cleanup(); });

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'rh_employees/e1'), { orgId: 'org_a', name: 'Ana', baseSalaryCarteira: 3000, unitId: null });
    await setDoc(doc(db, 'rh_directory/e1'), { orgId: 'org_a', name: 'Ana', unitId: null });
    await setDoc(doc(db, 'commercial_proposals/p1'), { organizationId: 'org_a', status: 'enviada' });
    await setDoc(doc(db, 'finance_payables/f1'), { orgId: 'org_a', status: 'aberto' });
    await setDoc(doc(db, 'organizations/org_a'), { name: 'A' });
    await setDoc(doc(db, 'org_members/m1'), { orgId: 'org_a', role: 'Supervisor', userId: 'member_m1', active: true });
  });
});

const as = (uid: string, role: string, areas?: string) =>
  env.authenticatedContext(uid, { master: false, orgs: { org_a: role }, ...(areas ? { areas: { org_a: areas } } : {}) }).firestore();
const withArea = (role: 'Supervisor' | 'Operacional', patch: Record<string, 0 | 1 | 2>) =>
  encodeAreas({ ...resolveAreas(role), ...patch });

test('RH: sem acesso não lê o cadastro com salários; o diretório sim (via Operações)', async () => {
  const op = as('member_op', 'Operacional');
  await assertFails(getDoc(doc(op, 'rh_employees/e1')));
  await assertSucceeds(getDoc(doc(op, 'rh_directory/e1')));
});

test('RH: Gerente vê e não edita; Admin edita', async () => {
  await assertSucceeds(getDoc(doc(as('member_g', 'Gerente'), 'rh_employees/e1')));
  await assertFails(updateDoc(doc(as('member_g', 'Gerente'), 'rh_employees/e1'), { name: 'X' }));
  await assertSucceeds(updateDoc(doc(as('member_a', 'Admin'), 'rh_employees/e1'), { name: 'X' }));
});

test('RH liberado para uma pessoa: Supervisor com RH "ver" lê o cadastro', async () => {
  await assertFails(getDoc(doc(as('member_s', 'Supervisor'), 'rh_employees/e1')));
  await assertSucceeds(getDoc(doc(as('member_s', 'Supervisor', withArea('Supervisor', { rh: 1 })), 'rh_employees/e1')));
});

test('Operações aloca em obra mudando só obra/código no RH', async () => {
  const op = as('member_op', 'Operacional');
  await assertSucceeds(updateDoc(doc(op, 'rh_employees/e1'), { unitId: 'u1', codigoObra: '198', updatedAt: 'x' }));
  await assertFails(updateDoc(doc(op, 'rh_employees/e1'), { baseSalaryCarteira: 9999 }));
  await assertSucceeds(updateDoc(doc(op, 'rh_directory/e1'), { unitId: 'u1', codigoObra: '198', updatedAt: 'x' }));
  await assertFails(updateDoc(doc(op, 'rh_directory/e1'), { name: 'Outro' }));
  await assertFails(deleteDoc(doc(op, 'rh_directory/e1')));
});

test('Comercial: Operacional sem acesso não lê; Supervisor vê e não edita', async () => {
  await assertFails(getDoc(doc(as('member_op', 'Operacional'), 'commercial_proposals/p1')));
  await assertSucceeds(getDoc(doc(as('member_s', 'Supervisor'), 'commercial_proposals/p1')));
  await assertFails(updateDoc(doc(as('member_s', 'Supervisor'), 'commercial_proposals/p1'), { status: 'ganha' }));
});

test('Financeiro: Operacional não lê; liberado em "ver" lê', async () => {
  await assertFails(getDoc(doc(as('member_op', 'Operacional'), 'finance_payables/f1')));
  await assertSucceeds(getDoc(doc(as('member_op', 'Operacional', withArea('Operacional', { financeiro: 1 })), 'finance_payables/f1')));
});

test('Operações em "ver" lê e não grava a base de Operações', async () => {
  const vis = as('member_v', 'Visualizador');
  await env.withSecurityRulesDisabled(async (ctx) => { await setDoc(doc(ctx.firestore(), 'ops_orgs/org_a/obras/o1'), { nome: 'A' }); });
  await assertSucceeds(getDoc(doc(vis, 'ops_orgs/org_a/obras/o1')));
  await assertFails(setDoc(doc(vis, 'ops_orgs/org_a/obras/o2'), { nome: 'B' }));
  // Supervisor sem Operações não lê
  await assertFails(getDoc(doc(as('member_s', 'Supervisor', withArea('Supervisor', { operacoes: 0 })), 'ops_orgs/org_a/obras/o1')));
});

test('acesso por área só muda pelo servidor', async () => {
  const admin = as('member_a', 'Admin');
  await assertFails(updateDoc(doc(admin, 'organizations/org_a'), { areaDefaults: { Supervisor: { rh: 2 } } }));
  await assertSucceeds(updateDoc(doc(admin, 'organizations/org_a'), { name: 'A2' }));
  await assertFails(updateDoc(doc(admin, 'org_members/m1'), { areaOverrides: { rh: 2 } }));
  await assertFails(updateDoc(doc(as('member_m1', 'Supervisor'), 'org_members/m1'), { areasUpdatedAt: 'x' }));
});

test('listas (como o app consulta) respeitam a área', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'field_worker_pay/fw1'), { orgId: 'org_a', baseSalary: 3000 });
    await setDoc(doc(db, 'commercial_proposal_items/i1'), { organizationId: 'org_a', proposalId: 'p1' });
  });
  const op = as('member_op', 'Operacional');
  const byOrg = (db: any, c: string) => getDocs(query(collection(db, c), where('orgId', '==', 'org_a')));
  await assertSucceeds(byOrg(op, 'rh_directory'));
  await assertFails(byOrg(as('member_s', 'Supervisor', withArea('Supervisor', { operacoes: 0 })), 'rh_directory'));
  await assertFails(byOrg(op, 'rh_employees'));
  await assertFails(byOrg(op, 'field_worker_pay'));
  await assertSucceeds(byOrg(as('member_g', 'Gerente'), 'field_worker_pay'));
  await assertFails(setDoc(doc(as('member_g', 'Gerente'), 'field_worker_pay/fw2'), { orgId: 'org_a', baseSalary: 1 }));
  const items = (db: any) => getDocs(query(collection(db, 'commercial_proposal_items'), where('proposalId', '==', 'p1')));
  await assertSucceeds(items(as('member_a', 'Admin')));
  await assertFails(items(op));
});
