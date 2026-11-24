import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment, assertFails, assertSucceeds, type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, query, where, serverTimestamp, Timestamp } from 'firebase/firestore';

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
    await setDoc(doc(db, 'organizations/org_a'), { id: 'org_a', name: 'A' });
    await setDoc(doc(db, 'work_orders/wo_a'), { orgId: 'org_a', title: 'A' });
    await setDoc(doc(db, 'work_orders/wo_b'), { orgId: 'org_b', title: 'B' });
    await setDoc(doc(db, 'purchasing_orders/po_a'), { organizationId: 'org_a', total: 1 });
    await setDoc(doc(db, 'purchasing_orders/po_b'), { organizationId: 'org_b', total: 2 });
    await setDoc(doc(db, 'purchasing_quotations/q_a'), { organizationId: 'org_a', total: 1 });
    await setDoc(doc(db, 'purchasing_receipts/r_a'), { organizationId: 'org_a', total: 1 });
    await setDoc(doc(db, 'purchasing_requisitions/req_a'), { organizationId: 'org_a', total: 1 });
    await setDoc(doc(db, 'purchasing_suppliers/s_a'), { organizationId: 'org_a', name: 'Fornecedor A' });
    await setDoc(doc(db, 'overtime_rules/org_a'), { organizationId: 'org_a' });
    await setDoc(doc(db, 'commercial_proposals/p_a'), { organizationId: 'org_a' });
    await setDoc(doc(db, 'commercial_proposal_items/i_a'), { organizationId: 'org_a', proposalId: 'p_a' });
    await setDoc(doc(db, 'org_members/m_op'), { orgId: 'org_a', userId: 'member_m_op', userName: 'Op', role: 'Operacional', active: true });
    await setDoc(doc(db, 'org_members/m_adm'), { orgId: 'org_a', userId: '', userName: 'Adm', role: 'Admin', active: true });
    await setDoc(doc(db, 'org_members/m_b'), { orgId: 'org_b', userId: '', userName: 'B', role: 'Operacional', active: true });
    await setDoc(doc(db, 'member_credentials/m_op'), { hash: 'x' });
    await setDoc(doc(db, 'first_access_tokens/t1'), { memberId: 'm_op' });
    await setDoc(doc(db, 'order_events/e_a'), { orgId: 'org_a', orderId: 'wo_a' });
    await setDoc(doc(db, 'stock_movements/s_a'), { orgId: 'org_a' });
    await setDoc(doc(db, 'audit_logs/l_a'), { orgId: 'org_a' });
    await setDoc(doc(db, 'some_unlisted/x'), { orgId: 'org_a' });
  });
});

const as = (uid: string, orgs: Record<string, string> = {}, master = false, areas?: Record<string, string>) =>
  env.authenticatedContext(uid, { master, orgs, ...(areas ? { areas } : {}) }).firestore();
// Operacional com acesso liberado a Comercial (editar) e Financeiro (ver): o perfil continua limitando o resto.
// Os padrões por área (sem liberação) estão em areaRules.test.ts.
const member = () => as('member_m_op', { org_a: 'Operacional' }, false, { org_a: '12121010112' });
const admin = () => as('member_m_adm', { org_a: 'Admin' });
const gerente = () => as('member_m_ger', { org_a: 'Gerente' });
const master = () => as('master_x', {}, true);

test('unauthenticated denied', async () => {
  const db = env.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(db, 'work_orders/wo_a')));
  await assertFails(setDoc(doc(db, 'work_orders/new'), { orgId: 'org_a' }));
  await assertFails(getDoc(doc(db, 'organizations/org_a')));
});

test('other org denied', async () => {
  const db = member();
  await assertFails(getDoc(doc(db, 'work_orders/wo_b')));
  await assertFails(getDoc(doc(db, 'purchasing_orders/po_b')));
  await assertFails(setDoc(doc(db, 'work_orders/new'), { orgId: 'org_b' }));
  await assertFails(updateDoc(doc(db, 'work_orders/wo_b'), { title: 'x' }));
  await assertFails(deleteDoc(doc(db, 'work_orders/wo_b')));
  await assertFails(getDocs(query(collection(db, 'work_orders'), where('orgId', '==', 'org_b'))));
  await assertFails(getDoc(doc(db, 'overtime_rules/org_b')));
  await assertFails(setDoc(doc(db, 'work_orders/mix'), { orgId: 'org_a', organizationId: 'org_b' }));
});

test('member read/write allowed', async () => {
  const db = member();
  await assertSucceeds(getDoc(doc(db, 'work_orders/wo_a')));
  await assertSucceeds(getDocs(query(collection(db, 'work_orders'), where('orgId', '==', 'org_a'))));
  await assertSucceeds(setDoc(doc(db, 'work_orders/new'), { orgId: 'org_a', title: 'n' }));
  await assertSucceeds(updateDoc(doc(db, 'work_orders/wo_a'), { title: 'x' }));
  await assertSucceeds(deleteDoc(doc(db, 'work_orders/new')));
  await assertSucceeds(getDoc(doc(db, 'overtime_rules/org_a')));
  await assertSucceeds(setDoc(doc(db, 'overtime_rules/org_a'), { organizationId: 'org_a', x: 1 }));
  await assertSucceeds(getDoc(doc(db, 'work_orders/missing')));
});

test('organizationId-only docs readable by member; writes require Stock edit', async () => {
  const viewOnly = member();
  await assertSucceeds(getDoc(doc(viewOnly, 'purchasing_orders/po_a')));
  await assertFails(setDoc(doc(viewOnly, 'purchasing_orders/view_only_create'), { organizationId: 'org_a' }));

  const editor = as('stock_editor', { org_a: 'Operacional' }, false, { org_a: '12221010112' });
  await assertSucceeds(setDoc(doc(editor, 'purchasing_orders/editor_create'), { organizationId: 'org_a' }));
});

test('list query by organizationId allowed for member', async () => {
  const db = member();
  await assertSucceeds(getDocs(query(collection(db, 'purchasing_orders'), where('organizationId', '==', 'org_a'))));
  await assertFails(getDocs(query(collection(db, 'purchasing_orders'), where('organizationId', '==', 'org_b'))));
});

test('estoque: acesso por área nas coleções de compras', async () => {
  const viewOnly = as('stock_view', { org_a: 'Operacional' }, false, { org_a: '12121010112' });
  const editor = as('stock_editor', { org_a: 'Operacional' }, false, { org_a: '12221010112' });
  const noAccess = as('stock_none', { org_a: 'Operacional' }, false, { org_a: '12020010112' });
  const collections = [
    'purchasing_orders', 'purchasing_quotations', 'purchasing_receipts',
    'purchasing_requisitions', 'purchasing_suppliers',
  ];

  for (const name of collections) {
    const existingId = ({
      purchasing_orders: 'po_a', purchasing_quotations: 'q_a', purchasing_receipts: 'r_a',
      purchasing_requisitions: 'req_a', purchasing_suppliers: 's_a',
    } as Record<string, string>)[name];

    await assertSucceeds(getDoc(doc(viewOnly, `${name}/${existingId}`)));
    await assertFails(getDoc(doc(noAccess, `${name}/${existingId}`)));
    await assertFails(updateDoc(doc(viewOnly, `${name}/${existingId}`), { total: 2 }));
    await assertFails(deleteDoc(doc(viewOnly, `${name}/${existingId}`)));
    await assertFails(setDoc(doc(viewOnly, `${name}/view_create`), { organizationId: 'org_a' }));

    await assertFails(updateDoc(doc(noAccess, `${name}/${existingId}`), { total: 2 }));
    await assertFails(deleteDoc(doc(noAccess, `${name}/${existingId}`)));
    await assertFails(setDoc(doc(noAccess, `${name}/no_access_create`), { organizationId: 'org_a' }));

    await assertSucceeds(updateDoc(doc(editor, `${name}/${existingId}`), { total: 3 }));
    await assertSucceeds(setDoc(doc(editor, `${name}/editor_create`), { organizationId: 'org_a' }));
    await assertSucceeds(deleteDoc(doc(editor, `${name}/editor_create`)));
    await assertFails(setDoc(doc(editor, `${name}/foreign_create`), { organizationId: 'org_b' }));
  }

  await assertSucceeds(getDocs(query(collection(viewOnly, 'purchasing_requisitions'), where('organizationId', '==', 'org_a'))));
  await assertFails(getDocs(query(collection(noAccess, 'purchasing_requisitions'), where('organizationId', '==', 'org_a'))));
});
test('Financeiro can read OCs/receipts for reconciliation but cannot modify them', async () => {
  const financeView = as('finance_view', { org_a: 'Operacional' }, false, { org_a: '00001000000' });
  await assertSucceeds(getDoc(doc(financeView, 'purchasing_orders/po_a')));
  await assertSucceeds(getDoc(doc(financeView, 'purchasing_receipts/r_a')));
  await assertSucceeds(getDocs(query(collection(financeView, 'purchasing_orders'), where('organizationId', '==', 'org_a'))));
  await assertSucceeds(getDocs(query(collection(financeView, 'purchasing_receipts'), where('organizationId', '==', 'org_a'))));
  await assertFails(updateDoc(doc(financeView, 'purchasing_orders/po_a'), { total: 3 }));
  await assertFails(updateDoc(doc(financeView, 'purchasing_receipts/r_a'), { notes: 'alterado' }));
  await assertFails(setDoc(doc(financeView, 'purchasing_orders/finance_create'), { organizationId: 'org_a' }));
  await assertFails(setDoc(doc(financeView, 'purchasing_receipts/finance_create'), { organizationId: 'org_a' }));
});

test('list query without org filter denied', async () => {
  const db = member();
  await assertFails(getDocs(collection(db, 'work_orders')));
  await assertFails(getDocs(collection(db, 'purchasing_orders')));
  await assertFails(getDocs(collection(db, 'org_members')));
  // denied as a query, not per returned doc: every support_tickets doc here is org_a
  await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'support_tickets/t_a'), { orgId: 'org_a' }));
  await assertFails(getDocs(collection(db, 'support_tickets')));
  await assertSucceeds(getDocs(query(collection(db, 'support_tickets'), where('orgId', '==', 'org_a'))));
});

test('proposal items listed by proposalId via parent org', async () => {
  await assertSucceeds(getDocs(query(collection(member(), 'commercial_proposal_items'), where('proposalId', '==', 'p_a'))));
  await assertFails(getDocs(query(collection(as('u', { org_b: 'Admin' }), 'commercial_proposal_items'), where('proposalId', '==', 'p_a'))));
});

test('proposal item for other org\'s proposal denied', async () => {
  const db = as('u', { org_b: 'Admin' });
  await assertFails(setDoc(doc(db, 'commercial_proposal_items/x'), { organizationId: 'org_b', proposalId: 'p_a' }));
  await assertFails(setDoc(doc(db, 'commercial_proposal_items/y'), { organizationId: 'org_b', proposalId: 'missing' }));
  await assertSucceeds(setDoc(doc(member(), 'commercial_proposal_items/z'), { organizationId: 'org_a', proposalId: 'p_a' }));
  await assertFails(updateDoc(doc(member(), 'commercial_proposal_items/i_a'), { proposalId: 'p_b' }));
});

test('mixed-owner doc not readable by member of only one org', async () => {
  await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'work_orders/mixed'), { orgId: 'org_a', organizationId: 'org_b' }));
  await assertFails(getDoc(doc(member(), 'work_orders/mixed')));
  await assertFails(getDoc(doc(as('u', { org_b: 'Admin' }), 'work_orders/mixed')));
  await assertSucceeds(getDoc(doc(as('u', { org_a: 'Admin', org_b: 'Admin' }), 'work_orders/mixed')));
});

test('master allowed', async () => {
  const db = master();
  await assertSucceeds(getDoc(doc(db, 'work_orders/wo_b')));
  await assertSucceeds(getDocs(collection(db, 'work_orders')));
  await assertSucceeds(setDoc(doc(db, 'work_orders/m'), { orgId: 'org_b' }));
  await assertSucceeds(getDocs(collection(db, 'org_members')));
  await assertSucceeds(setDoc(doc(db, 'organizations/org_n'), { name: 'N' }));
});

test('update cannot change owner', async () => {
  const db = as('u', { org_a: 'Admin', org_b: 'Admin' });
  await assertFails(updateDoc(doc(db, 'work_orders/wo_a'), { orgId: 'org_b' }));
  await assertFails(updateDoc(doc(db, 'purchasing_orders/po_a'), { organizationId: 'org_b' }));
  await assertFails(updateDoc(doc(db, 'purchasing_orders/po_a'), { orgId: 'org_b' }));
});

test('member_credentials always denied', async () => {
  await assertFails(getDoc(doc(master(), 'member_credentials/m_op')));
  await assertFails(getDoc(doc(member(), 'member_credentials/_master_')));
  await assertFails(setDoc(doc(admin(), 'member_credentials/m_op'), { hash: 'y' }));
});

test('receipt_images always denied (server-only)', async () => {
  await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'receipt_images/r1'), { orgId: 'org_a', base64: 'x' }));
  await assertFails(getDoc(doc(member(), 'receipt_images/r1')));
  await assertFails(getDoc(doc(master(), 'receipt_images/r1')));
  await assertFails(setDoc(doc(admin(), 'receipt_images/r2'), { orgId: 'org_a', base64: 'x' }));
});

test('server_state always denied (server-only)', async () => {
  await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'server_state/reembolso_resumo_org_a'), { lastSentWeek: '2026-11-16' }));
  await assertFails(getDoc(doc(admin(), 'server_state/reembolso_resumo_org_a')));
  await assertFails(getDoc(doc(master(), 'server_state/reembolso_resumo_org_a')));
  await assertFails(setDoc(doc(master(), 'server_state/reembolso_resumo_org_a'), { lastSentWeek: 'x' }));
});

test('first_access_tokens always denied', async () => {
  await assertFails(getDoc(doc(master(), 'first_access_tokens/t1')));
  await assertFails(setDoc(doc(admin(), 'first_access_tokens/t2'), { memberId: 'm_op' }));
});

test('org_members: member reads own org', async () => {
  const db = member();
  await assertSucceeds(getDocs(query(collection(db, 'org_members'), where('orgId', '==', 'org_a'))));
  await assertFails(getDoc(doc(db, 'org_members/m_b')));
  // userId lookup before claims exist
  await assertSucceeds(getDocs(query(collection(as('member_m_op'), 'org_members'), where('userId', '==', 'member_m_op'))));
  // own doc by id (uid member_<docId>), even when userId is unbound
  await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), 'org_members/m_op'), { userId: '' }));
  await assertSucceeds(getDoc(doc(as('member_m_op'), 'org_members/m_op')));
  await assertFails(getDoc(doc(as('member_m_adm'), 'org_members/m_op')));
});

test('org_members: verified email reads own doc, case-insensitive', async () => {
  await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'org_members/m_g'), { orgId: 'org_b', userId: '', userEmail: 'g@x.com', role: 'Operacional', active: true }));
  const ok = env.authenticatedContext('google_g', { email: 'G@X.com', email_verified: true }).firestore();
  await assertSucceeds(getDocs(query(collection(ok, 'org_members'), where('userEmail', '==', 'g@x.com'), where('active', '==', true))));
  const unverified = env.authenticatedContext('google_h', { email: 'g@x.com', email_verified: false }).firestore();
  await assertFails(getDoc(doc(unverified, 'org_members/m_g')));
  await assertFails(getDoc(doc(as('no_email'), 'org_members/m_g')));
});

test('org_members: self update limited to userId/userName/updatedAt/lastLoginAt', async () => {
  const self = as('member_m_op'); // no claims needed for own doc
  await assertSucceeds(updateDoc(doc(self, 'org_members/m_op'), { userName: 'New', updatedAt: 'now', lastLoginAt: 'now' }));
  await assertFails(updateDoc(doc(self, 'org_members/m_op'), { role: 'Admin' }));
  await assertFails(updateDoc(doc(self, 'org_members/m_op'), { userId: 'other' }));
  await assertFails(updateDoc(doc(self, 'org_members/m_op'), { orgId: 'org_b' }));
});

test('org_members: passwordHash field write denied', async () => {
  await assertFails(setDoc(doc(admin(), 'org_members/n1'), { orgId: 'org_a', userId: '', role: 'Operacional', passwordHash: 'x' }));
  await assertFails(updateDoc(doc(admin(), 'org_members/m_op'), { passwordHash: 'x' }));
  await assertFails(updateDoc(doc(master(), 'org_members/m_op'), { passwordHash: 'x' }));
  await assertFails(updateDoc(doc(as('member_m_op'), 'org_members/m_op'), { passwordHash: 'x' }));
});

test('org_members: admin manages members of own org only', async () => {
  await assertSucceeds(setDoc(doc(admin(), 'org_members/n1'), { orgId: 'org_a', userId: '', role: 'Admin', active: true }));
  await assertSucceeds(updateDoc(doc(admin(), 'org_members/m_op'), { role: 'Supervisor' }));
  await assertFails(updateDoc(doc(admin(), 'org_members/m_op'), { orgId: 'org_b' }));
  await assertFails(setDoc(doc(admin(), 'org_members/n2'), { orgId: 'org_b', userId: '', role: 'Operacional' }));
  await assertFails(setDoc(doc(member(), 'org_members/n3'), { orgId: 'org_a', userId: '', role: 'Operacional' }));
  await assertSucceeds(deleteDoc(doc(admin(), 'org_members/m_op')));
});

test('gerente cannot create admin member', async () => {
  await assertFails(setDoc(doc(gerente(), 'org_members/n1'), { orgId: 'org_a', userId: '', role: 'Admin' }));
  await assertSucceeds(setDoc(doc(gerente(), 'org_members/n2'), { orgId: 'org_a', userId: '', role: 'Supervisor' }));
  await assertFails(updateDoc(doc(gerente(), 'org_members/m_op'), { role: 'Admin' }));
  await assertFails(updateDoc(doc(gerente(), 'org_members/m_adm'), { userName: 'x' }));
  await assertFails(deleteDoc(doc(gerente(), 'org_members/m_adm')));
});

test('org_members create with foreign userId denied', async () => {
  await assertFails(setDoc(doc(admin(), 'org_members/n1'), { orgId: 'org_a', userId: 'master_x', role: 'Operacional' }));
  await assertSucceeds(setDoc(doc(admin(), 'org_members/n2'), { orgId: 'org_a', userId: 'member_m_adm', role: 'Operacional' }));
  await assertFails(updateDoc(doc(admin(), 'org_members/m_b'), { userId: 'x' }));
});

test('order_events/stock_movements/audit_logs not updatable', async () => {
  const db = member();
  for (const c of ['order_events', 'stock_movements', 'audit_logs']) {
    await assertSucceeds(setDoc(doc(db, `${c}/new`), { orgId: 'org_a' }));
    await assertFails(setDoc(doc(db, `${c}/other`), { orgId: 'org_b' }));
    await assertFails(updateDoc(doc(db, `${c}/new`), { x: 1 }));
    await assertFails(deleteDoc(doc(db, `${c}/new`)));
    await assertFails(updateDoc(doc(master(), `${c}/new`), { x: 1 }));
  }
  await assertSucceeds(getDocs(query(collection(db, 'order_events'), where('orgId', '==', 'org_a'), where('orderId', '==', 'wo_a'))));
});

test('unlisted collection denied', async () => {
  await assertFails(getDoc(doc(master(), 'some_unlisted/x')));
  await assertFails(setDoc(doc(member(), 'some_unlisted/y'), { orgId: 'org_a' }));
  await assertFails(getDoc(doc(member(), 'system_security/master')));
});

test('organizations readable by any signed-in user, writable by master/Admin', async () => {
  await assertSucceeds(getDoc(doc(as('anyone'), 'organizations/org_a')));
  await assertSucceeds(getDocs(collection(as('anyone'), 'organizations')));
  await assertSucceeds(updateDoc(doc(admin(), 'organizations/org_a'), { name: 'A2' }));
  await assertSucceeds(updateDoc(doc(master(), 'organizations/org_a'), { name: 'A3' }));
  await assertFails(updateDoc(doc(gerente(), 'organizations/org_a'), { name: 'x' }));
  await assertFails(updateDoc(doc(as('u', { org_b: 'Admin' }), 'organizations/org_a'), { name: 'x' }));
  await assertFails(setDoc(doc(admin(), 'organizations/org_new'), { name: 'x' }));
  await assertFails(deleteDoc(doc(admin(), 'organizations/org_a')));
});

test('trusted_devices: own create, org-scoped read', async () => {
  const db = member();
  await assertSucceeds(setDoc(doc(db, 'trusted_devices/d1'), { orgId: 'org_a', userId: 'member_m_op', status: 'ativo' }));
  await assertFails(setDoc(doc(db, 'trusted_devices/d2'), { orgId: 'org_a', userId: 'someone', status: 'ativo' }));
  await assertSucceeds(getDocs(query(collection(db, 'trusted_devices'), where('userId', '==', 'member_m_op'), where('orgId', '==', 'org_a'), where('status', '==', 'ativo'))));
  await assertSucceeds(updateDoc(doc(db, 'trusted_devices/d1'), { status: 'revogado' }));
  await assertFails(updateDoc(doc(db, 'trusted_devices/d1'), { userId: 'x' }));
});

const supervisor = () => as('member_m_sup', { org_a: 'Supervisor' });
const seedAs = (fn: (db: any) => Promise<unknown>) => env.withSecurityRulesDisabled(async (ctx) => { await fn(ctx.firestore()); });

test('finance categories/rules: members read, Supervisor+ write, Admin/Gerente delete, owner immutable', async () => {
  for (const [c, pre] of [['finance_categories', 'cat_'], ['finance_rules', 'rule_']]) {
    const n = `${pre}org_a_n`, x = `${pre}org_b_x`;
    await seedAs((db) => setDoc(doc(db, `${c}/a`), { orgId: 'org_a', v: 1 }));
    await seedAs((db) => setDoc(doc(db, `${c}/b`), { orgId: 'org_b', v: 1 }));
    await assertSucceeds(getDoc(doc(member(), `${c}/a`)));
    await assertSucceeds(getDocs(query(collection(member(), c), where('orgId', '==', 'org_a'))));
    await assertFails(getDoc(doc(member(), `${c}/b`)));
    await assertFails(setDoc(doc(member(), `${c}/${n}`), { orgId: 'org_a' }));
    await assertFails(updateDoc(doc(member(), `${c}/a`), { v: 2 }));
    await assertSucceeds(setDoc(doc(supervisor(), `${c}/${n}`), { orgId: 'org_a' }));
    await assertFails(setDoc(doc(supervisor(), `${c}/${pre}org_b_y`), { orgId: 'org_a' })); // id squatting another org
    await assertSucceeds(updateDoc(doc(supervisor(), `${c}/a`), { v: 2 }));
    await assertFails(setDoc(doc(supervisor(), `${c}/${x}`), { orgId: 'org_b' }));
    await assertFails(updateDoc(doc(gerente(), `${c}/a`), { orgId: 'org_b' }));
    await assertFails(deleteDoc(doc(supervisor(), `${c}/${n}`)));
    await assertSucceeds(deleteDoc(doc(gerente(), `${c}/${n}`)));
    await assertFails(deleteDoc(doc(as('g', { org_b: 'Gerente' }), `${c}/a`)));
  }
});

test('finance_payables: createdBy is caller; payment state can only change through backend settlement; Admin/Gerente can edit title fields', async () => {
  const c = 'finance_payables';
  await seedAs((db) => setDoc(doc(db, `${c}/a`), { orgId: 'org_a', valor: 10, status: 'aberto', createdBy: 'x' }));
  await seedAs((db) => setDoc(doc(db, `${c}/b`), { orgId: 'org_b', valor: 10, status: 'aberto' }));
  await seedAs((db) => setDoc(doc(db, `${c}/paid`), { orgId: 'org_a', valor: 25, status: 'pago', pagoEm: '2026-11-24', pagoPor: 'settler1' }));
  await assertSucceeds(getDoc(doc(member(), `${c}/a`)));
  await assertFails(getDoc(doc(member(), `${c}/b`)));
  await assertFails(setDoc(doc(member(), `${c}/pay_org_a_n`), { orgId: 'org_a', createdBy: 'member_m_op' }));
  await assertFails(setDoc(doc(supervisor(), `${c}/pay_org_a_n`), { orgId: 'org_a', createdBy: 'someone' }));
  await assertSucceeds(setDoc(doc(supervisor(), `${c}/pay_org_a_n`), { orgId: 'org_a', createdBy: 'member_m_sup', status: 'aberto' }));
  await assertFails(setDoc(doc(supervisor(), `${c}/pay_org_a_forged_totals`), { orgId: 'org_a', createdBy: 'member_m_sup', status: 'aberto', valorPago: 1, saldoAberto: 9 }));
  await assertFails(updateDoc(doc(supervisor(), `${c}/a`), { valor: 1 }));
  await assertFails(updateDoc(doc(supervisor(), `${c}/a`), { status: 'pago', valor: 1 }));
  await assertFails(updateDoc(doc(supervisor(), `${c}/a`), { status: 'cancelado' }));
  await assertFails(updateDoc(doc(supervisor(), `${c}/a`), { status: 'pago', pagoEm: '2026-11-21', pagoPor: 'member_m_sup', updatedAt: 'x' }));
  await assertFails(updateDoc(doc(gerente(), `${c}/a`), { status: 'pago', pagoEm: '2026-11-21', pagoPor: 'member_m_ger', updatedAt: 'x' }));
  await assertFails(updateDoc(doc(gerente(), `${c}/a`), { settlementId: 'forged' }));
  await assertFails(updateDoc(doc(gerente(), `${c}/a`), { valorPago: 5 }));
  await assertFails(updateDoc(doc(gerente(), `${c}/a`), { valorAbatido: 5, saldoAberto: 0 }));
  await assertFails(updateDoc(doc(gerente(), `${c}/a`), { settlementCount: 1, lastSettlementId: 'fake' }));
  await assertSucceeds(updateDoc(doc(gerente(), `${c}/a`), { valor: 12 }));
  await assertFails(updateDoc(doc(gerente(), `${c}/paid`), { valor: 99 }));
  await assertFails(updateDoc(doc(gerente(), `${c}/a`), { orgId: 'org_b' }));
  await assertFails(updateDoc(doc(member(), `${c}/a`), { status: 'pago' }));
  await assertFails(deleteDoc(doc(supervisor(), `${c}/pay_org_a_n`)));
  await assertSucceeds(deleteDoc(doc(admin(), `${c}/pay_org_a_n`)));
});


test('finance_reconciliation_cases: org-scoped, created by actor, manager-only decisions with justification, append-only', async () => {
  const path = 'finance_reconciliation_cases';
  const caseId = path + '/rcase_org_a_case1';
  const record = (uid: string, id = 'rcase_org_a_case1') => ({
    id,
    orgId: 'org_a',
    purchaseOrderId: 'po_a',
    purchaseOrderCode: 'OC-2026-001',
    supplierName: 'Fornecedor A',
    supplierCnpj: '11111111000111',
    issueType: 'divergencia_valor_produtos',
    issueTitle: 'Diferença no valor dos produtos',
    description: 'A NF-e está acima do valor da OC e exige conferência.',
    snapshot: { productValueDelta: 800, sourceIssues: ['Valor divergente'] },
    status: 'aberta',
    createdBy: uid,
    createdByName: 'Responsável',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await seedAs((db) => setDoc(doc(db, caseId), record('member_m_sup', 'rcase_org_a_case1')));
  await seedAs((db) => setDoc(doc(db, path + '/rcase_org_b_other'), { ...record('other', 'rcase_org_b_other'), orgId: 'org_b' }));
  await assertSucceeds(getDoc(doc(member(), caseId)));
  await assertSucceeds(getDocs(query(collection(member(), path), where('orgId', '==', 'org_a'))));
  await assertFails(getDoc(doc(member(), path + '/rcase_org_b_other')));
  await assertFails(getDocs(query(collection(member(), path), where('orgId', '==', 'org_b'))));

  await assertFails(setDoc(doc(member(), path + '/rcase_org_a_viewer'), record('member_m_op', 'rcase_org_a_viewer')));
  await assertFails(setDoc(doc(supervisor(), path + '/rcase_org_b_squat'), record('member_m_sup', 'rcase_org_b_squat')));
  await assertFails(setDoc(doc(supervisor(), path + '/rcase_org_a_spoof'), record('someone', 'rcase_org_a_spoof')));
  await assertFails(setDoc(doc(supervisor(), path + '/rcase_org_a_mismatch'), record('member_m_sup', 'rcase_org_a_other')));
  await assertSucceeds(setDoc(doc(supervisor(), path + '/rcase_org_a_valid'), record('member_m_sup', 'rcase_org_a_valid')));

  await assertFails(updateDoc(doc(supervisor(), caseId), {
    status: 'em_analise', reviewedBy: 'member_m_sup', reviewedByName: 'Supervisor',
    reviewedAt: serverTimestamp(), updatedAt: serverTimestamp(),
  }));
  await assertFails(updateDoc(doc(gerente(), caseId), {
    status: 'aprovada', reviewedBy: 'member_m_ger', reviewedByName: 'Gerente',
    reviewedAt: serverTimestamp(), updatedAt: serverTimestamp(), resolutionNotes: 'Aprovado.',
  }));
  await assertSucceeds(updateDoc(doc(gerente(), caseId), {
    status: 'em_analise', reviewedBy: 'member_m_ger', reviewedByName: 'Gerente',
    reviewedAt: serverTimestamp(), updatedAt: serverTimestamp(),
  }));
  await assertFails(updateDoc(doc(gerente(), caseId), {
    status: 'aprovada', reviewedBy: 'someone', reviewedByName: 'Outro',
    reviewedAt: serverTimestamp(), updatedAt: serverTimestamp(), resolutionNotes: 'Aprovado.',
  }));
  await assertFails(updateDoc(doc(gerente(), caseId), {
    status: 'aprovada', reviewedBy: 'member_m_ger', reviewedByName: 'Gerente',
    reviewedAt: serverTimestamp(), updatedAt: serverTimestamp(), resolutionNotes: 'x',
  }));
  await assertFails(updateDoc(doc(gerente(), caseId), {
    status: 'aprovada', purchaseOrderId: 'po_other', reviewedBy: 'member_m_ger',
    reviewedByName: 'Gerente', reviewedAt: serverTimestamp(), updatedAt: serverTimestamp(),
    resolutionNotes: 'Conferido e autorizado.',
  }));
  await assertSucceeds(updateDoc(doc(gerente(), caseId), {
    status: 'aprovada', reviewedBy: 'member_m_ger', reviewedByName: 'Gerente',
    reviewedAt: serverTimestamp(), updatedAt: serverTimestamp(), resolutionNotes: 'Conferido com o fornecedor e autorizado.',
  }));
  await assertFails(updateDoc(doc(gerente(), caseId), {
    status: 'aberta', reviewedBy: 'member_m_ger', reviewedByName: 'Gerente',
    reviewedAt: serverTimestamp(), updatedAt: serverTimestamp(),
  }));
  await assertFails(deleteDoc(doc(admin(), caseId)));
  await assertFails(updateDoc(doc(as('g', { org_b: 'Gerente' }), caseId), {
    status: 'rejeitada', reviewedBy: 'g', reviewedByName: 'Gerente',
    reviewedAt: serverTimestamp(), updatedAt: serverTimestamp(), resolutionNotes: 'Não autorizado.',
  }));
});


test('finance_payable_settlements: members read only their company; client writes are always denied', async () => {
  const path = 'finance_payable_settlements';
  await seedAs((db) => setDoc(doc(db, path + '/pays_org_a_title1'), { id: 'pays_org_a_title1', orgId: 'org_a', payableId: 'pay_org_a_title1', settledValue: 125, paymentDate: '2026-11-24', paymentMethod: 'pix' }));
  await seedAs((db) => setDoc(doc(db, path + '/pays_org_b_title2'), { id: 'pays_org_b_title2', orgId: 'org_b', payableId: 'pay_org_b_title2', settledValue: 200, paymentDate: '2026-11-24', paymentMethod: 'boleto' }));
  await assertSucceeds(getDoc(doc(member(), path + '/pays_org_a_title1')));
  await assertFails(getDoc(doc(member(), path + '/pays_org_b_title2')));
  await assertSucceeds(getDocs(query(collection(member(), path), where('orgId', '==', 'org_a'))));
  await assertFails(getDocs(query(collection(member(), path), where('orgId', '==', 'org_b'))));
  const record = { id: 'pays_org_a_new', orgId: 'org_a', payableId: 'pay_org_a_new', settledValue: 5 };
  await assertFails(setDoc(doc(supervisor(), path + '/pays_org_a_new'), record));
  await assertFails(setDoc(doc(gerente(), path + '/pays_org_a_new'), record));
  await assertFails(setDoc(doc(master(), path + '/pays_org_a_new'), record));
  await assertFails(updateDoc(doc(admin(), path + '/pays_org_a_title1'), { settledValue: 1 }));
  await assertFails(deleteDoc(doc(admin(), path + '/pays_org_a_title1')));
});


test('finance bank statement and reconciliation collections are company-scoped and immutable to clients', async () => {
  const transactions = 'finance_bank_transactions';
  const matches = 'finance_bank_reconciliations';
  await seedAs((db) => setDoc(doc(db, transactions + '/btxn_org_a_one'), {
    id: 'btxn_org_a_one', orgId: 'org_a', date: '2026-11-24', amount: 500, direction: 'debit', description: 'Fornecedor A',
  }));
  await seedAs((db) => setDoc(doc(db, transactions + '/btxn_org_b_two'), {
    id: 'btxn_org_b_two', orgId: 'org_b', date: '2026-11-24', amount: 700, direction: 'debit', description: 'Fornecedor B',
  }));
  await seedAs((db) => setDoc(doc(db, matches + '/bmatch_org_a_one'), {
    id: 'bmatch_org_a_one', orgId: 'org_a', transactionId: 'btxn_org_a_one', settlementId: 'settlement_a',
  }));
  await seedAs((db) => setDoc(doc(db, matches + '/bmatch_org_b_two'), {
    id: 'bmatch_org_b_two', orgId: 'org_b', transactionId: 'btxn_org_b_two', settlementId: 'settlement_b',
  }));
  await assertSucceeds(getDoc(doc(member(), transactions + '/btxn_org_a_one')));
  await assertFails(getDoc(doc(member(), transactions + '/btxn_org_b_two')));
  await assertSucceeds(getDocs(query(collection(member(), transactions), where('orgId', '==', 'org_a'))));
  await assertFails(getDocs(query(collection(member(), transactions), where('orgId', '==', 'org_b'))));
  await assertSucceeds(getDoc(doc(member(), matches + '/bmatch_org_a_one')));
  await assertFails(getDoc(doc(member(), matches + '/bmatch_org_b_two')));
  await assertFails(setDoc(doc(gerente(), transactions + '/btxn_org_a_forged'), {
    id: 'btxn_org_a_forged', orgId: 'org_a', date: '2026-11-24', amount: 1, direction: 'debit', description: 'Forged',
  }));
  await assertFails(updateDoc(doc(gerente(), transactions + '/btxn_org_a_one'), { amount: 1 }));
  await assertFails(deleteDoc(doc(admin(), transactions + '/btxn_org_a_one')));
  await assertFails(setDoc(doc(gerente(), matches + '/bmatch_org_a_forged'), {
    id: 'bmatch_org_a_forged', orgId: 'org_a', transactionId: 'btxn_org_a_one', settlementId: 'settlement_a',
  }));
  await assertFails(updateDoc(doc(admin(), matches + '/bmatch_org_a_one'), { settlementId: 'other' }));
  await assertFails(deleteDoc(doc(admin(), matches + '/bmatch_org_a_one')));
});

test('finance_payable_authorizations: only Admin/Gerente can create one per approved case and open matching NF-e payable; immutable', async () => {
  const casePath = 'finance_reconciliation_cases/rcase_org_a_case1';
  const payablePath = 'finance_payables/pay_org_a_K1_001';
  const authPath = 'finance_payable_authorizations/paya_org_a_pay_org_a_K1_001';
  const reviewedAt = Timestamp.fromMillis(1795525200000);
  const approvedCase = {
    id: 'rcase_org_a_case1', orgId: 'org_a', purchaseOrderId: 'po_a', purchaseOrderCode: 'OC-2026-001',
    supplierName: 'Fornecedor A', supplierCnpj: '11111111000111',
    issueType: 'divergencia_valor_produtos', issueTitle: 'Diferença no valor dos produtos',
    description: 'O total dos produtos da NF-e difere da OC.',
    snapshot: { invoiceKeys: ['K1'], sourceIssues: ['Diferença no valor'] },
    status: 'aprovada', createdBy: 'member_m_sup', createdByName: 'Supervisor',
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    reviewedBy: 'member_m_ger', reviewedByName: 'Gerente', reviewedAt,
    resolutionNotes: 'Diferença conferida e autorizada pela gerência.',
  };
  const payable = {
    id: 'pay_org_a_K1_001', orgId: 'org_a', origem: 'nfe',
    fornecedor: { nome: 'Fornecedor A', cnpj: '11111111000111' },
    documento: 'NF-e 123', parcela: '001', valor: 5400, vencimento: '2026-12-10',
    status: 'aberto', categoriaId: 'cat_mat', nfeChave: 'K1', purchaseOrderId: 'po_a',
  };
  const authorization = {
    id: 'paya_org_a_pay_org_a_K1_001', orgId: 'org_a',
    payableId: 'pay_org_a_K1_001', caseId: 'rcase_org_a_case1',
    purchaseOrderId: 'po_a', purchaseOrderCode: 'OC-2026-001',
    nfeChave: 'K1', documento: 'NF-e 123', parcela: '001',
    fornecedorNome: 'Fornecedor A', fornecedorCnpj: '11111111000111',
    authorizedValue: 5400, dueDate: '2026-12-10',
    payableStatusAtAuthorization: 'aberto', authorizationStatus: 'registrada',
    issueTitle: 'Diferença no valor dos produtos',
    resolutionNotes: 'Diferença conferida e autorizada pela gerência.',
    approvedBy: 'member_m_ger', approvedByName: 'Gerente', approvedAt: reviewedAt,
    authorizedBy: 'member_m_ger', authorizedByName: 'Gerente',
    authorizedAt: serverTimestamp(), createdAt: serverTimestamp(),
  };

  await seedAs(async (db) => {
    await setDoc(doc(db, casePath), approvedCase);
    await setDoc(doc(db, payablePath), payable);
  });

  await assertFails(setDoc(doc(gerente(), authPath), authorization)); // browsers cannot write this collection
  await seedAs((db) => setDoc(doc(db, authPath), authorization)); // backend Admin SDK is the only writer
  await assertSucceeds(getDoc(doc(member(), authPath)));
  await assertFails(getDoc(doc(as('other', { org_b: 'Gerente' }), authPath)));
  await assertSucceeds(getDocs(query(collection(member(), 'finance_payable_authorizations'), where('orgId', '==', 'org_a'))));
  assert.equal((await getDoc(doc(gerente(), payablePath))).data()?.status, 'aberto', 'authorization must not mark the title as paid');
  await assertFails(setDoc(doc(gerente(), authPath), authorization)); // deterministic duplicate -> update denied
  await assertFails(updateDoc(doc(gerente(), authPath), { authorizedValue: 1 }));
  await assertFails(deleteDoc(doc(admin(), authPath)));

  await seedAs((db) => setDoc(doc(db, 'finance_reconciliation_cases/rcase_org_a_pending'), {
    ...approvedCase, id: 'rcase_org_a_pending', status: 'em_analise',
  }));
  await assertFails(setDoc(doc(gerente(), 'finance_payable_authorizations/paya_org_a_pay_org_a_K1_002'), {
    ...authorization, id: 'paya_org_a_pay_org_a_K1_002', payableId: 'pay_org_a_K1_002', caseId: 'rcase_org_a_pending',
  }));

  await seedAs((db) => setDoc(doc(db, 'finance_payables/pay_org_a_K2_001'), { ...payable, id: 'pay_org_a_K2_001', nfeChave: 'K2' }));
  await assertFails(setDoc(doc(gerente(), 'finance_payable_authorizations/paya_org_a_pay_org_a_K2_001'), {
    ...authorization, id: 'paya_org_a_pay_org_a_K2_001', payableId: 'pay_org_a_K2_001', nfeChave: 'K2',
  }));

  await seedAs((db) => setDoc(doc(db, 'finance_payables/pay_org_a_K1_paid'), {
    ...payable, id: 'pay_org_a_K1_paid', status: 'pago',
  }));
  await assertFails(setDoc(doc(gerente(), 'finance_payable_authorizations/paya_org_a_pay_org_a_K1_paid'), {
    ...authorization, id: 'paya_org_a_pay_org_a_K1_paid', payableId: 'pay_org_a_K1_paid',
  }));

  await assertFails(setDoc(doc(supervisor(), 'finance_payable_authorizations/paya_org_a_pay_org_a_K1_supervisor'), {
    ...authorization, id: 'paya_org_a_pay_org_a_K1_supervisor', payableId: 'pay_org_a_K1_001',
  }));
  await assertFails(setDoc(doc(member(), 'finance_payable_authorizations/paya_org_a_pay_org_a_K1_member'), {
    ...authorization, id: 'paya_org_a_pay_org_a_K1_member', payableId: 'pay_org_a_K1_001',
  }));
  await assertFails(setDoc(doc(as('other', { org_b: 'Gerente' }), 'finance_payable_authorizations/paya_org_b_pay_org_a_K1_001'), {
    ...authorization, id: 'paya_org_b_pay_org_a_K1_001', orgId: 'org_b',
  }));
  await assertFails(setDoc(doc(gerente(), 'finance_payable_authorizations/paya_org_a_spoof'), {
    ...authorization, id: 'paya_org_a_spoof', payableId: 'pay_org_a_K1_001',
  }));
  await assertFails(setDoc(doc(gerente(), 'finance_payable_authorizations/paya_org_a_pay_org_a_K1_001_bad_value'), {
    ...authorization, id: 'paya_org_a_pay_org_a_K1_001_bad_value', payableId: 'pay_org_a_K1_001', authorizedValue: 1,
  }));
});

test('nfe_documents: read by members, server-only create/delete, guarded status transitions', async () => {
  await seedAs((db) => setDoc(doc(db, 'nfe_documents/org_a_1'), { orgId: 'org_a', status: 'aguardando_classificacao', valorTotal: 10 }));
  await seedAs((db) => setDoc(doc(db, 'nfe_documents/org_b_1'), { orgId: 'org_b', status: 'aguardando_classificacao' }));
  const d = 'nfe_documents/org_a_1';
  const runBy = (uid: string) => ({ classificacao: { runId: 'r', by: uid, startedAt: serverTimestamp() } });
  await assertSucceeds(getDoc(doc(member(), d)));
  await assertSucceeds(getDocs(query(collection(member(), 'nfe_documents'), where('orgId', '==', 'org_a'))));
  await assertFails(getDoc(doc(member(), 'nfe_documents/org_b_1')));
  await assertFails(setDoc(doc(gerente(), 'nfe_documents/org_a_2'), { orgId: 'org_a', status: 'aguardando_classificacao' }));
  await assertFails(deleteDoc(doc(admin(), d)));
  // other fields / skipped transitions / foreign run owner denied
  await assertFails(updateDoc(doc(gerente(), d), { status: 'classificando', valorTotal: 1, ...runBy('member_m_ger') }));
  await assertFails(updateDoc(doc(gerente(), d), { status: 'classificada' }));
  await assertFails(updateDoc(doc(member(), d), { status: 'classificando', ...runBy('member_m_op') })); // Operacional cannot classify
  await assertFails(updateDoc(doc(as('g', { org_b: 'Gerente' }), d), { status: 'classificando', ...runBy('g') }));
  await assertFails(updateDoc(doc(supervisor(), d), { status: 'classificando', ...runBy('someone') }));
  // startedAt must be the server time (no backdating to make a run look stale)
  await assertFails(updateDoc(doc(supervisor(), d), { status: 'classificando', classificacao: { runId: 'r', by: 'member_m_sup', startedAt: Timestamp.fromMillis(Date.now() - 3 * 60_000) } }));
  await assertSucceeds(updateDoc(doc(supervisor(), d), { status: 'classificando', updatedAt: 'x', ...runBy('member_m_sup') }));
  await assertFails(updateDoc(doc(gerente(), d), { status: 'aguardando_classificacao' }));
  // a fresh run belongs to its owner: a manager cannot release or finish it yet
  await assertFails(updateDoc(doc(gerente(), d), { status: 'erro_classificacao', erroClassificacao: 'x' }));
  await assertFails(updateDoc(doc(gerente(), d), { status: 'classificada' }));
  await assertSucceeds(updateDoc(doc(supervisor(), d), { status: 'erro_classificacao', erroClassificacao: 'falhou' }));
  await assertSucceeds(updateDoc(doc(gerente(), d), { status: 'classificando', ...runBy('member_m_ger') }));
  await assertSucceeds(updateDoc(doc(gerente(), d), { status: 'classificada', classificacao: { runId: 'r', by: 'member_m_ger', lines: [] } }));
  await assertFails(updateDoc(doc(gerente(), d), { status: 'classificando', ...runBy('member_m_ger') }));
  await assertFails(updateDoc(doc(master(), d), { status: 'aguardando_classificacao' }));
});

test('nfe_documents: stale run (≥ 2 min, server time) released by Admin/Gerente only', async () => {
  const old = Timestamp.fromMillis(Date.now() - 3 * 60_000);
  await seedAs((db) => setDoc(doc(db, 'nfe_documents/org_a_s'), { orgId: 'org_a', status: 'classificando', classificacao: { runId: 'r', by: 'other', startedAt: old } }));
  const rel = { status: 'erro_classificacao', erroClassificacao: 'interrompida' };
  await assertFails(updateDoc(doc(supervisor(), 'nfe_documents/org_a_s'), rel));
  await assertSucceeds(updateDoc(doc(gerente(), 'nfe_documents/org_a_s'), rel));
  // legacy run without startedAt
  await seedAs((db) => setDoc(doc(db, 'nfe_documents/org_a_l'), { orgId: 'org_a', status: 'classificando', classificacao: { runId: 'r', by: 'other' } }));
  await seedAs((db) => setDoc(doc(db, 'nfe_documents/org_a_l2'), { orgId: 'org_a', status: 'classificando' }));
  await assertFails(updateDoc(doc(supervisor(), 'nfe_documents/org_a_l'), rel));
  await assertSucceeds(updateDoc(doc(gerente(), 'nfe_documents/org_a_l'), rel));
  await assertSucceeds(updateDoc(doc(admin(), 'nfe_documents/org_a_l2'), rel));
});

test('nfe_sync: members read, writes denied', async () => {
  await seedAs((db) => setDoc(doc(db, 'nfe_sync/org_a'), { ultNSU: '0' }));
  await assertSucceeds(getDoc(doc(member(), 'nfe_sync/org_a')));
  await assertFails(getDoc(doc(as('x', { org_b: 'Admin' }), 'nfe_sync/org_a')));
  await assertFails(setDoc(doc(admin(), 'nfe_sync/org_a'), { ultNSU: '9' }));
  await assertFails(setDoc(doc(master(), 'nfe_sync/org_a'), { ultNSU: '9' }));
});

test('pending center queries (orgId/organizationId == + status in) pass rules for a member', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'nfe_documents/n1'), { orgId: 'org_a', status: 'aguardando_classificacao' });
    await setDoc(doc(db, 'nfe_documents/n2'), { orgId: 'org_a', status: 'classificada' });
    await setDoc(doc(db, 'commercial_proposals/p_env'), { organizationId: 'org_a', status: 'enviada' });
    await setDoc(doc(db, 'finance_payables/f1'), { orgId: 'org_a', status: 'aberto' });
  });
  const db = member();
  const nfe = await assertSucceeds(getDocs(query(collection(db, 'nfe_documents'), where('orgId', '==', 'org_a'), where('status', 'in', ['aguardando_classificacao', 'erro_classificacao']))));
  if (nfe.size !== 1) throw new Error(`nfe size ${nfe.size}`);
  const props = await assertSucceeds(getDocs(query(collection(db, 'commercial_proposals'), where('organizationId', '==', 'org_a'), where('status', 'in', ['enviada', 'negociacao']))));
  if (props.size !== 1) throw new Error(`proposals size ${props.size}`);
  await assertSucceeds(getDocs(query(collection(db, 'finance_payables'), where('orgId', '==', 'org_a'), where('status', '==', 'aberto'))));
});

test('counters: member writes own org only', async () => {
  const db = member();
  await assertSucceeds(setDoc(doc(db, 'counters/org_a_work_orders'), { orgId: 'org_a', seq: 1 }));
  await assertFails(setDoc(doc(db, 'counters/org_b_work_orders'), { orgId: 'org_b', seq: 1 }));
});

test('counters: cannot claim another org\'s deterministic id', async () => {
  await assertFails(setDoc(doc(member(), 'counters/org_b_work_orders'), { orgId: 'org_a', seq: 1 }));
});

test('counters: no reset, no delete, only +1', async () => {
  const db = member();
  await assertFails(setDoc(doc(db, 'counters/org_a_x'), { orgId: 'org_a', seq: 0 }));
  await assertSucceeds(setDoc(doc(db, 'counters/org_a_work_orders'), { orgId: 'org_a', seq: 5 }));
  await assertFails(setDoc(doc(db, 'counters/org_a_work_orders'), { orgId: 'org_a', seq: 1 }));
  await assertFails(updateDoc(doc(db, 'counters/org_a_work_orders'), { seq: 7 }));
  await assertSucceeds(updateDoc(doc(db, 'counters/org_a_work_orders'), { seq: 6 }));
  await assertFails(deleteDoc(doc(db, 'counters/org_a_work_orders')));
});
