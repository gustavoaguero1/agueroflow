import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment, assertFails, assertSucceeds, type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, query, where, serverTimestamp } from 'firebase/firestore';

let env: RulesTestEnvironment;
before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-agueroflow',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: 'localhost', port: 8085 },
  });
});
after(async () => { await env?.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

const as = (uid: string, orgs: Record<string, string> = {}, master = false, areas?: Record<string, string>) =>
  env.authenticatedContext(uid, { master, orgs, ...(areas ? { areas } : {}) }).firestore();
const manager = () => as('manager_a', { org_a: 'Gerente' });
const financeViewer = () => as('finance_viewer', { org_a: 'Operacional' }, false, { org_a: '00001000000' });
const noFinance = () => as('no_finance', { org_a: 'Gerente' }, false, { org_a: '22220000000' });
const otherOrg = () => as('manager_b', { org_b: 'Gerente' });
const seedAs = async (fn: (db: ReturnType<RulesTestEnvironment['authenticatedContext']>['firestore']) => Promise<unknown>) =>
  env.withSecurityRulesDisabled(async (ctx) => fn(ctx.firestore()));

const receivable = (id = 'recv_org_a_client1', extra: Record<string, unknown> = {}) => ({
  id, orgId: 'org_a', origem: 'manual', cliente: { nome: 'Cliente A' },
  documento: 'PROP-001', valor: 1000, vencimento: '2026-12-10', status: 'aberto',
  createdBy: 'manager_a', createdAt: serverTimestamp(), ...extra,
});
const receipt = (id = 'recr_org_a_client1_req001') => ({
  id, orgId: 'org_a', receivableId: 'recv_org_a_client1', idempotencyKey: 'req001',
  receiptDate: '2026-11-24', receiptAmount: 250, paymentMethod: 'pix',
  remainingBefore: 1000, remainingAfter: 750, receiptSequence: 1,
  receivableStatusAfter: 'aberto', receivableSnapshot: { clientName: 'Cliente A', documento: 'PROP-001', value: 1000 },
  receivedBy: 'manager_a', receivedAt: new Date(), createdAt: new Date(),
});

test('finance receivables are tenant-scoped and visible to finance viewers', async () => {
  await seedAs(async (db) => {
    await setDoc(doc(db, 'finance_receivables/recv_org_a_client1'), receivable());
    await setDoc(doc(db, 'finance_receivables/recv_org_b_client2'), { ...receivable('recv_org_b_client2'), orgId: 'org_b', id: 'recv_org_b_client2' });
  });
  await assertSucceeds(getDoc(doc(financeViewer(), 'finance_receivables/recv_org_a_client1')));
  await assertFails(getDoc(doc(financeViewer(), 'finance_receivables/recv_org_b_client2')));
  await assertSucceeds(getDocs(query(collection(financeViewer(), 'finance_receivables'), where('orgId', '==', 'org_a'))));
  await assertFails(getDocs(query(collection(financeViewer(), 'finance_receivables'), where('orgId', '==', 'org_b'))));
});

test('Admin/Gerente/Supervisor with finance level 2 can create only valid manual receivables', async () => {
  await assertSucceeds(setDoc(doc(manager(), 'finance_receivables/recv_org_a_new'), receivable('recv_org_a_new')));
  await assertFails(setDoc(doc(noFinance(), 'finance_receivables/recv_org_a_no_access'), receivable('recv_org_a_no_access')));
  await assertFails(setDoc(doc(otherOrg(), 'finance_receivables/recv_org_a_foreign'), receivable('recv_org_a_foreign')));
  await assertFails(setDoc(doc(manager(), 'finance_receivables/wrong_prefix'), receivable('wrong_prefix')));
  await assertFails(setDoc(doc(manager(), 'finance_receivables/recv_org_a_paid'), receivable('recv_org_a_paid', { status: 'recebido' })));
  await assertFails(setDoc(doc(manager(), 'finance_receivables/recv_org_a_forged'), receivable('recv_org_a_forged', { valorRecebido: 1, saldoAberto: 999 })));
});

test('receivable balances/status are backend-only and client cannot update or delete receivables', async () => {
  await seedAs((db) => setDoc(doc(db, 'finance_receivables/recv_org_a_client1'), receivable()));
  await assertFails(updateDoc(doc(manager(), 'finance_receivables/recv_org_a_client1'), { valor: 1 }));
  await assertFails(updateDoc(doc(manager(), 'finance_receivables/recv_org_a_client1'), { valorRecebido: 1000, status: 'recebido' }));
  await assertFails(deleteDoc(doc(manager(), 'finance_receivables/recv_org_a_client1')));
});

test('receipt events are readable inside the company but immutable to every client', async () => {
  await seedAs((db) => setDoc(doc(db, 'finance_receivable_receipts/recr_org_a_client1_req001'), receipt()));
  await assertSucceeds(getDoc(doc(financeViewer(), 'finance_receivable_receipts/recr_org_a_client1_req001')));
  await assertFails(getDoc(doc(otherOrg(), 'finance_receivable_receipts/recr_org_a_client1_req001')));
  await assertSucceeds(getDocs(query(collection(financeViewer(), 'finance_receivable_receipts'), where('orgId', '==', 'org_a'))));
  await assertFails(setDoc(doc(manager(), 'finance_receivable_receipts/recr_org_a_forged'), receipt('recr_org_a_forged')));
  await assertFails(updateDoc(doc(manager(), 'finance_receivable_receipts/recr_org_a_client1_req001'), { receiptAmount: 1 }));
  await assertFails(deleteDoc(doc(manager(), 'finance_receivable_receipts/recr_org_a_client1_req001')));
});
