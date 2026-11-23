import test, { before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, setDoc, collection } from 'firebase/firestore';

// Regras do módulo Operações: ops_orgs/{orgId}/{coll}/{doc}.
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
    await setDoc(doc(db, 'ops_orgs/org_a/obras/o1'), { nome: 'Obra A' });
    await setDoc(doc(db, 'ops_orgs/org_a/salarios/c1'), { salario: 5000 });
    await setDoc(doc(db, 'ops_orgs/org_b/obras/o1'), { nome: 'Obra B' });
  });
});

const as = (uid: string, orgs: Record<string, string> = {}, master = false) =>
  env.authenticatedContext(uid, { master, orgs }).firestore();
const op = () => as('member_op', { org_a: 'Operacional' });
const ger = () => as('member_ger', { org_a: 'Gerente' });
const vis = () => as('member_vis', { org_a: 'Visualizador' });

test('membro lê e escreve a base da própria empresa', async () => {
  await assertSucceeds(getDocs(collection(op(), 'ops_orgs/org_a/obras')));
  await assertSucceeds(setDoc(doc(op(), 'ops_orgs/org_a/diario/2026-11-23'), { x: 1 }));
});

test('ninguém acessa a base de outra empresa', async () => {
  await assertFails(getDoc(doc(op(), 'ops_orgs/org_b/obras/o1')));
  await assertFails(setDoc(doc(ger(), 'ops_orgs/org_b/obras/o2'), { x: 1 }));
  await assertFails(getDoc(doc(as('anon'), 'ops_orgs/org_a/obras/o1')));
});

test('salários só para Admin/Gerente', async () => {
  await assertFails(getDoc(doc(op(), 'ops_orgs/org_a/salarios/c1')));
  await assertFails(setDoc(doc(op(), 'ops_orgs/org_a/salarios/c2'), { salario: 1 }));
  await assertSucceeds(getDoc(doc(ger(), 'ops_orgs/org_a/salarios/c1')));
  await assertSucceeds(setDoc(doc(ger(), 'ops_orgs/org_a/salarios/c2'), { salario: 1 }));
});

test('equipe e parâmetros: escrita só de Admin/Gerente', async () => {
  await assertFails(setDoc(doc(op(), 'ops_orgs/org_a/membros/u1'), { papel: 'Gerente' }));
  await assertFails(setDoc(doc(op(), 'ops_orgs/org_a/config/params'), { x: 1 }));
  await assertSucceeds(setDoc(doc(op(), 'ops_orgs/org_a/config/diario'), { x: 1 }));
  await assertSucceeds(setDoc(doc(ger(), 'ops_orgs/org_a/config/params'), { x: 1 }));
});

test('Visualizador só lê', async () => {
  await assertSucceeds(getDoc(doc(vis(), 'ops_orgs/org_a/obras/o1')));
  await assertFails(setDoc(doc(vis(), 'ops_orgs/org_a/obras/o2'), { x: 1 }));
});
