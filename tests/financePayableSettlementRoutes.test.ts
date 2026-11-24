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
  fornecedor: { nome: 'Fornecedor A', cnpj: '11111111000111' }, documento: 'NF-e 123', parcela: '001',
  valor: 5400, vencimento: '2026-12-10', status: 'aberto', categoriaId: 'cat_mat',
  nfeChave: 'K1', purchaseOrderId: 'po_a', purchaseOrderCode: 'OC-2026-001',
};
const authorization = {
  id: financePayableAuthorizationId('org_a', payable.id), orgId: 'org_a', payableId: payable.id, caseId: 'rcase_org_a_1',
  authorizedValue: 5400, dueDate: '2026-12-10', fornecedorNome: 'Fornecedor A', fornecedorCnpj: '11111111000111',
};

function mockAdmin(seed: Record<string, unknown>) {
  const docs = new Map(Object.entries(seed));
  const db: any = {
    collection: (name: string) => ({ doc: (id: string) => ({ path: name + '/' + id, id }) }),
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

async function withApi(role: string, seed: Record<string, unknown>, action: (base: string, docs: Map<string, unknown>) => Promise<void>, areas?: Record<string, string>) {
  const mocked = mockAdmin(seed);
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { uid: 'settler1', email: 'settler@empresa.com', master: false, orgs: { org_a: role }, ...(areas ? { areas } : {}) };
    next();
  });
  app.use('/api/finance/payable-settlements', createFinancePayableSettlementRouter(() => mocked.handles));
  const server: Server = await new Promise((resolve) => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('API test server did not bind a TCP port');
  try { await action('http://127.0.0.1:' + address.port, mocked.docs); }
  finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}

const request = { orgId: 'org_a', payableId: payable.id, paymentDate: '2026-11-24', paymentMethod: 'pix', paymentReference: 'E2E-123', proofReference: 'https://docs.empresa.com/comprovante/123', notes: 'Pagamento conferido no extrato.' };

test('backend records immutable settlement and marks the existing payable paid in one transaction', async () => {
  await withApi('Supervisor', {
    ['finance_payables/' + payable.id]: { ...payable, id: 'forged_id' },
    ['finance_payable_authorizations/' + authorization.id]: authorization,
  }, async (base, docs) => {
    const response = await fetch(base + '/api/finance/payable-settlements', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) });
    assert.equal(response.status, 201);
    const body = await response.json() as { ok: boolean; settlementId: string };
    const settlementId = financePayableSettlementId('org_a', payable.id);
    assert.equal(body.ok, true); assert.equal(body.settlementId, settlementId);
    const saved = docs.get('finance_payable_settlements/' + settlementId) as Record<string, any>;
    const updated = docs.get('finance_payables/' + payable.id) as Record<string, any>;
    assert.equal(saved.payableId, payable.id); assert.equal(saved.settledValue, 5400);
    assert.equal(saved.settledBy, 'settler1'); assert.equal(saved.settledByEmail, 'settler@empresa.com');
    assert.equal(saved.paymentReference, 'E2E-123'); assert.equal(saved.proofReference, request.proofReference);
    assert.equal(saved.authorizationId, authorization.id);
    assert.equal(updated.status, 'pago'); assert.equal(updated.pagoEm, request.paymentDate);
    assert.equal(updated.pagoPor, 'settler1'); assert.equal(updated.settlementId, settlementId);
  });
});

test('backend rejects a second settlement for the same payable', async () => {
  const settlementId = financePayableSettlementId('org_a', payable.id);
  await withApi('Gerente', { ['finance_payables/' + payable.id]: payable, ['finance_payable_settlements/' + settlementId]: { id: settlementId, orgId: 'org_a', payableId: payable.id } }, async (base) => {
    const response = await fetch(base + '/api/finance/payable-settlements', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) });
    assert.equal(response.status, 409);
  });
});

test('backend requires acknowledgement when the payable changed after authorization', async () => {
  const changed = { ...payable, valor: 5450, vencimento: '2026-12-15' };
  await withApi('Gerente', { ['finance_payables/' + payable.id]: changed, ['finance_payable_authorizations/' + authorization.id]: authorization }, async (base, docs) => {
    const response = await fetch(base + '/api/finance/payable-settlements', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) });
    assert.equal(response.status, 409);
    const response2 = await fetch(base + '/api/finance/payable-settlements', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...request, confirmAuthorizationDivergence: true }) });
    assert.equal(response2.status, 201);
    const id = financePayableSettlementId('org_a', payable.id);
    const saved = docs.get('finance_payable_settlements/' + id) as Record<string, any>;
    assert.deepEqual(saved.authorizationDifferences, ['valor', 'vencimento']); assert.equal(saved.settledValue, 5450);
  });
});

test('backend rejects paid or foreign-company title and malformed date', async () => {
  await withApi('Supervisor', { ['finance_payables/' + payable.id]: { ...payable, status: 'pago' } }, async (base) => {
    const response = await fetch(base + '/api/finance/payable-settlements', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) });
    assert.equal(response.status, 409);
  });
  await withApi('Supervisor', { ['finance_payables/' + payable.id]: { ...payable, orgId: 'org_b' } }, async (base) => {
    const response = await fetch(base + '/api/finance/payable-settlements', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) });
    assert.equal(response.status, 409);
  });
  await withApi('Gerente', { ['finance_payables/' + payable.id]: payable }, async (base) => {
    const response = await fetch(base + '/api/finance/payable-settlements', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...request, paymentDate: '2026-02-30' }) });
    assert.equal(response.status, 400);
  });
});

test('Admin/Gerente require Financeiro level 2; Supervisor may settle with level 1', async () => {
  await withApi('Gerente', { ['finance_payables/' + payable.id]: payable }, async (base) => {
    const response = await fetch(base + '/api/finance/payable-settlements', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) });
    assert.equal(response.status, 403);
  }, { org_a: '22221222222' });
  await withApi('Gerente', { ['finance_payables/' + payable.id]: payable }, async (base) => {
    const response = await fetch(base + '/api/finance/payable-settlements', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) });
    assert.equal(response.status, 201);
  });
  await withApi('Supervisor', { ['finance_payables/' + payable.id]: payable }, async (base) => {
    const response = await fetch(base + '/api/finance/payable-settlements', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) });
    assert.equal(response.status, 201);
  }, { org_a: '12211021112' });
});
