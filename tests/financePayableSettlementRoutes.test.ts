import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { Server } from 'node:http';
import type { AdminHandles } from '../server/firebaseAdmin.ts';
import { createFinancePayableSettlementRouter } from '../server/financePayableSettlementRoutes.ts';
import { financePayableSettlementId } from '../src/services/financePayableSettlementRules.ts';
import { financePayableAuthorizationId } from '../src/services/financePayableAuthorizationRules.ts';

const payable = {
  id: 'pay_org_a_K1_001', orgId: 'org_a', origem: 'nfe',
  fornecedor: { nome: 'Fornecedor A', cnpj: '11111111000111' },
  documento: 'NF-e 123', parcela: '001', valor: 5400, vencimento: '2026-12-10',
  status: 'aberto', categoriaId: 'cat_mat', nfeChave: 'K1', purchaseOrderId: 'po_a', purchaseOrderCode: 'OC-2026-001',
};
const authorization = {
  id: financePayableAuthorizationId('org_a', payable.id), orgId: 'org_a', payableId: payable.id, caseId: 'rcase_org_a_1',
  authorizedValue: 5400, dueDate: '2026-12-10', fornecedorNome: 'Fornecedor A', fornecedorCnpj: '11111111000111',
};

function mockAdmin(seed: Record<string, unknown>) {
  const docs = new Map(Object.entries(seed));
  const db: any = {
    collection: (name: string) => ({ doc: (id: string) => ({
        path: name + '/' + id, id,
        get: async () => { const data = docs.get(name + '/' + id); return { id, exists: data !== undefined, data: () => data }; },
      }) }),
    runTransaction: async (fn: (tx: any) => Promise<unknown>) => {
      const creates: Array<{ path: string; data: unknown }> = [];
      const updates: Array<{ path: string; data: Record<string, unknown> }> = [];
      const tx = {
        get: async (ref: { path: string; id: string }) => { const data = docs.get(ref.path); return { id: ref.id, exists: data !== undefined, data: () => data }; },
        create: (ref: { path: string }, data: unknown) => { creates.push({ path: ref.path, data }); },
        update: (ref: { path: string }, data: Record<string, unknown>) => { updates.push({ path: ref.path, data }); },
      };
      const result = await fn(tx);
      for (const item of creates) if (docs.has(item.path)) throw Object.assign(new Error('already exists'), { code: 6 });
      for (const item of updates) if (!docs.has(item.path)) throw new Error('missing document for transaction update');
      for (const item of creates) docs.set(item.path, item.data);
      for (const item of updates) docs.set(item.path, { ...(docs.get(item.path) as object), ...item.data });
      return result;
    },
  };
  return { handles: { db } as unknown as AdminHandles, docs };
}

async function withApi(
  role: string,
  seed: Record<string, unknown>,
  action: (base: string, docs: Map<string, unknown>) => Promise<void>,
  areas?: Record<string, string>,
  uid = 'settler1',
) {
  const mocked = mockAdmin(seed);
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { uid, email: 'settler@empresa.com', master: false, orgs: { org_a: role }, ...(areas ? { areas } : {}) };
    next();
  });
  app.use('/api/finance/payable-settlements', createFinancePayableSettlementRouter(() => mocked.handles));
  const server: Server = await new Promise((resolve) => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('API test server did not bind a TCP port');
  try { await action('http://127.0.0.1:' + address.port, mocked.docs); }
  finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}

const request = {
  orgId: 'org_a', payableId: payable.id, idempotencyKey: 'operation_0001',
  paymentDate: '2026-11-24', paymentAmount: 5400, discountAmount: 0, paymentMethod: 'pix',
  paymentReference: 'E2E-123', proofReference: 'https://docs.empresa.com/comprovante/123', notes: 'Pagamento conferido no extrato.',
};

async function post(base: string, body: unknown) {
  return fetch(base + '/api/finance/payable-settlements', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
}

test('full payment records one immutable event and pays the existing title atomically', async () => {
  await withApi('Supervisor', {
    ['finance_payables/' + payable.id]: { ...payable, id: 'forged_id' },
    ['finance_payable_authorizations/' + authorization.id]: authorization,
  }, async (base, docs) => {
    const response = await post(base, request);
    assert.equal(response.status, 201);
    const body = await response.json() as { ok: boolean; settlementId: string; status: string };
    const settlementId = financePayableSettlementId('org_a', payable.id, request.idempotencyKey);
    assert.equal(body.ok, true); assert.equal(body.settlementId, settlementId); assert.equal(body.status, 'pago');
    const saved = docs.get('finance_payable_settlements/' + settlementId) as Record<string, any>;
    const updated = docs.get('finance_payables/' + payable.id) as Record<string, any>;
    assert.equal(saved.payableId, payable.id); assert.equal(saved.paymentAmount, 5400); assert.equal(saved.discountAmount, 0);
    assert.equal(saved.settledValue, 5400); assert.equal(saved.remainingBefore, 5400); assert.equal(saved.remainingAfter, 0);
    assert.equal(saved.settledBy, 'settler1'); assert.equal(saved.settledByEmail, 'settler@empresa.com');
    assert.equal(saved.paymentReference, 'E2E-123'); assert.equal(saved.proofReference, request.proofReference);
    assert.equal(saved.authorizationId, authorization.id);
    assert.equal(updated.status, 'pago'); assert.equal(updated.pagoEm, request.paymentDate);
    assert.equal(updated.pagoPor, 'settler1'); assert.equal(updated.settlementId, settlementId);
    assert.equal(updated.valorPago, 5400); assert.equal(updated.valorAbatido, 0); assert.equal(updated.saldoAberto, 0);
  });
});

test('multiple partial payments reduce the balance and only the final payment marks the title paid', async () => {
  await withApi('Supervisor', { ['finance_payables/' + payable.id]: payable }, async (base, docs) => {
    const first = { ...request, idempotencyKey: 'partial_0001', paymentAmount: 1500, paymentReference: 'PIX-1' };
    const r1 = await post(base, first);
    assert.equal(r1.status, 201);
    let updated = docs.get('finance_payables/' + payable.id) as Record<string, any>;
    assert.equal(updated.valor, 5400, 'original amount is immutable');
    assert.equal(updated.valorPago, 1500); assert.equal(updated.valorAbatido, 0);
    assert.equal(updated.saldoAberto, 3900); assert.equal(updated.status, 'aberto');
    assert.equal(updated.pagoEm, undefined);

    const second = { ...request, idempotencyKey: 'partial_0002', paymentAmount: 3900, paymentReference: 'PIX-2' };
    const r2 = await post(base, second);
    assert.equal(r2.status, 201);
    updated = docs.get('finance_payables/' + payable.id) as Record<string, any>;
    assert.equal(updated.valor, 5400);
    assert.equal(updated.valorPago, 5400); assert.equal(updated.saldoAberto, 0);
    assert.equal(updated.status, 'pago'); assert.equal(updated.pagoEm, request.paymentDate);
    assert.equal(updated.settlementCount, 2);
    assert.ok(docs.has('finance_payable_settlements/' + financePayableSettlementId('org_a', payable.id, 'partial_0001')));
    assert.ok(docs.has('finance_payable_settlements/' + financePayableSettlementId('org_a', payable.id, 'partial_0002')));
  });
});

test('approved discount requires a reason and an explicit Financeiro approval grant', async () => {
  const discountRequest = { ...request, paymentAmount: 1000, discountAmount: 100, discountReason: 'Crédito negociado com fornecedor.' };
  await withApi('Supervisor', { ['finance_payables/' + payable.id]: payable }, async (base) => {
    const response = await post(base, { ...discountRequest, idempotencyKey: 'discount_0001' });
    assert.equal(response.status, 403);
  });
  await withApi('Gerente', { ['finance_payables/' + payable.id]: payable, 'org_module_access/org_a__settler1': { orgId: 'org_a', uid: 'settler1', modules: { 'financeiro-pagar': 3 } } }, async (base, docs) => {
    const response = await post(base, { ...discountRequest, idempotencyKey: 'discount_0002' });
    assert.equal(response.status, 201);
    const eventId = financePayableSettlementId('org_a', payable.id, 'discount_0002');
    const event = docs.get('finance_payable_settlements/' + eventId) as Record<string, any>;
    const updated = docs.get('finance_payables/' + payable.id) as Record<string, any>;
    assert.equal(event.paymentAmount, 1000); assert.equal(event.discountAmount, 100);
    assert.equal(event.discountReason, discountRequest.discountReason);
    assert.equal(event.settledValue, 1100); assert.equal(updated.valorPago, 1000);
    assert.equal(updated.valorAbatido, 100); assert.equal(updated.saldoAberto, 4300);
    assert.equal(updated.status, 'aberto');
  });
});

test('discount-only settlement can close the balance with explicit approval permission', async () => {
  const discountOnly = { ...request, idempotencyKey: 'writeoff_0001', paymentAmount: 0, discountAmount: 5400, paymentMethod: undefined, discountReason: 'Crédito integral aprovado pela gerência.' };
  await withApi('Gerente', { ['finance_payables/' + payable.id]: payable, 'org_module_access/org_a__settler1': { orgId: 'org_a', uid: 'settler1', modules: { 'financeiro-pagar': 3 } } }, async (base, docs) => {
    const response = await post(base, discountOnly);
    assert.equal(response.status, 201);
    const event = docs.get('finance_payable_settlements/' + financePayableSettlementId('org_a', payable.id, 'writeoff_0001')) as Record<string, any>;
    const updated = docs.get('finance_payables/' + payable.id) as Record<string, any>;
    assert.equal(event.paymentAmount, 0); assert.equal(event.discountAmount, 5400);
    assert.equal(event.paymentMethod, undefined);
    assert.equal(updated.status, 'pago'); assert.equal(updated.valorPago, 0);
    assert.equal(updated.valorAbatido, 5400); assert.equal(updated.saldoAberto, 0);
  });
});

test('retrying the same idempotency key does not double debit; reusing it with different values is rejected', async () => {
  await withApi('Supervisor', { ['finance_payables/' + payable.id]: payable }, async (base, docs) => {
    const first = { ...request, idempotencyKey: 'retry_0001', paymentAmount: 500 };
    assert.equal((await post(base, first)).status, 201);
    assert.equal((await post(base, first)).status, 200);
    const conflict = await post(base, { ...first, paymentAmount: 700 });
    assert.equal(conflict.status, 409);
    const updated = docs.get('finance_payables/' + payable.id) as Record<string, any>;
    assert.equal(updated.valorPago, 500); assert.equal(updated.saldoAberto, 4900);
    assert.equal(updated.settlementCount, 1);
  });
});

test('backend rejects overpayment, legacy duplicate, paid/foreign title and malformed dates', async () => {
  await withApi('Supervisor', { ['finance_payables/' + payable.id]: payable }, async (base, docs) => {
    const over = await post(base, { ...request, idempotencyKey: 'overpay_0001', paymentAmount: 5400.01 });
    assert.equal(over.status, 409);
    assert.equal(docs.get('finance_payables/' + payable.id) && (docs.get('finance_payables/' + payable.id) as any).valorPago, undefined);
  });
  await withApi('Supervisor', {
    ['finance_payables/' + payable.id]: payable,
    ['finance_payable_settlements/' + financePayableSettlementId('org_a', payable.id)]: { id: 'legacy', orgId: 'org_a', payableId: payable.id },
  }, async (base) => assert.equal((await post(base, { ...request, idempotencyKey: 'legacy_0001' })).status, 409));
  await withApi('Supervisor', { ['finance_payables/' + payable.id]: { ...payable, status: 'pago' } }, async (base) => assert.equal((await post(base, request)).status, 409));
  await withApi('Supervisor', { ['finance_payables/' + payable.id]: { ...payable, orgId: 'org_b' } }, async (base) => assert.equal((await post(base, request)).status, 409));
  await withApi('Gerente', { ['finance_payables/' + payable.id]: payable }, async (base) => assert.equal((await post(base, { ...request, paymentDate: '2026-02-30' })).status, 400));
});

test('authorization changes still require explicit acknowledgement before any partial/full movement', async () => {
  const changed = { ...payable, valor: 5450, vencimento: '2026-12-15' };
  await withApi('Gerente', {
    ['finance_payables/' + payable.id]: changed,
    ['finance_payable_authorizations/' + authorization.id]: authorization,
  }, async (base, docs) => {
    const key = 'authchange_0001';
    const first = await post(base, { ...request, idempotencyKey: key, paymentAmount: 500 });
    assert.equal(first.status, 409);
    const second = await post(base, { ...request, idempotencyKey: key, paymentAmount: 500, confirmAuthorizationDivergence: true });
    assert.equal(second.status, 201);
    const event = docs.get('finance_payable_settlements/' + financePayableSettlementId('org_a', payable.id, key)) as Record<string, any>;
    assert.deepEqual(event.authorizationDifferences, ['valor', 'vencimento']);
    assert.equal(event.settledValue, 500);
  });
});

test('payment settlement requires Operar or higher in Contas a Pagar', async () => {
  await withApi('Gerente', { ['finance_payables/' + payable.id]: payable }, async (base) => {
    assert.equal((await post(base, request)).status, 403);
  }, { org_a: '22221222222' });
  await withApi('Gerente', { ['finance_payables/' + payable.id]: payable }, async (base) => {
    assert.equal((await post(base, request)).status, 201);
  });
  await withApi('Supervisor', { ['finance_payables/' + payable.id]: payable }, async (base) => {
    assert.equal((await post(base, request)).status, 403);
  }, { org_a: '12211021112' });
});
