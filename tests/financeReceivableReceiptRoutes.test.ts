import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { Server } from 'node:http';
import type { AdminHandles } from '../server/firebaseAdmin.ts';
import { createFinanceReceivableReceiptRouter } from '../server/financeReceivableReceiptRoutes.ts';

type Ref = { path: string; id: string };
function mockAdmin(seed: Record<string, unknown>) {
  const docs = new Map(Object.entries(seed));
  const db: any = {
    collection: (name: string) => ({
      doc: (id: string) => ({
        path: name + '/' + id, id,
        get: async () => { const data = docs.get(name + '/' + id); return { id, exists: data !== undefined, data: () => data }; },
      } as Ref),
    }),
    runTransaction: async (fn: (tx: any) => Promise<unknown>) => {
      const creates: Array<{ path: string; data: unknown }> = [];
      const updates: Array<{ path: string; data: Record<string, unknown> }> = [];
      const tx = {
        get: async (ref: Ref) => {
          const data = docs.get(ref.path);
          return { id: ref.id, exists: data !== undefined, data: () => data };
        },
        create: (ref: Ref, data: unknown) => creates.push({ path: ref.path, data }),
        update: (ref: Ref, data: Record<string, unknown>) => updates.push({ path: ref.path, data }),
      };
      const result = await fn(tx);
      for (const item of creates) if (docs.has(item.path)) throw Object.assign(new Error('already exists'), { code: 6 });
      for (const item of creates) docs.set(item.path, item.data);
      for (const item of updates) {
        const previous = docs.get(item.path);
        if (!previous) throw new Error('document not found: ' + item.path);
        docs.set(item.path, { ...(previous as Record<string, unknown>), ...item.data });
      }
      return result;
    },
  };
  return { handles: { db } as unknown as AdminHandles, docs };
}

async function withApi(seed: Record<string, unknown>, action: (base: string, docs: Map<string, unknown>) => Promise<void>) {
  const mocked = mockAdmin(seed);
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { uid: 'manager1', email: 'manager@empresa.com', master: false, orgs: { org_a: 'Gerente' } };
    next();
  });
  app.use('/api/finance/receivable-receipts', createFinanceReceivableReceiptRouter(() => mocked.handles));
  const server: Server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('API test server did not bind a TCP port');
  try { await action('http://127.0.0.1:' + address.port, mocked.docs); }
  finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}

const seedReceivable = (extra: Record<string, unknown> = {}) => ({
  id: 'recv_org_a_client1', orgId: 'org_a', origem: 'manual',
  cliente: { nome: 'Cliente A', cnpj: '12345678000190' }, documento: 'PROP-001',
  valor: 1000, valorRecebido: 200, saldoAberto: 800, status: 'aberto',
  vencimento: '2026-12-10', createdAt: '2026-11-24T00:00:00.000Z', createdBy: 'manager1',
  ...extra,
});
const input = (extra: Record<string, unknown> = {}) => ({
  orgId: 'org_a', receivableId: 'recv_org_a_client1', idempotencyKey: 'request-0001',
  receiptDate: '2026-11-24', receiptAmount: 300, paymentMethod: 'pix',
  paymentReference: 'PIX-123', ...extra,
});
async function post(base: string, body: unknown) {
  return fetch(base + '/api/finance/receivable-receipts', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
}

test('records partial receipts atomically and closes the receivable only when its balance reaches zero', async () => {
  await withApi({ 'finance_receivables/recv_org_a_client1': seedReceivable() }, async (base, docs) => {
    const first = await post(base, input());
    assert.equal(first.status, 201);
    const firstResult = await first.json() as { receiptId: string; remainingAfter: number; status: string };
    assert.equal(firstResult.remainingAfter, 500);
    assert.equal(firstResult.status, 'aberto');
    const partial = docs.get('finance_receivables/recv_org_a_client1') as any;
    assert.equal(partial.valor, 1000);
    assert.equal(partial.valorRecebido, 500);
    assert.equal(partial.saldoAberto, 500);
    assert.equal(partial.status, 'aberto');
    const event = docs.get('finance_receivable_receipts/' + firstResult.receiptId) as any;
    assert.equal(event.receiptAmount, 300);
    assert.equal(event.remainingBefore, 800);
    assert.equal(event.remainingAfter, 500);
    assert.equal(event.receivedBy, 'manager1');

    const second = await post(base, input({ idempotencyKey: 'request-0002', receiptAmount: 500, receiptDate: '2026-11-25' }));
    assert.equal(second.status, 201);
    const secondResult = await second.json() as { remainingAfter: number; status: string };
    assert.equal(secondResult.remainingAfter, 0);
    assert.equal(secondResult.status, 'recebido');
    const closed = docs.get('finance_receivables/recv_org_a_client1') as any;
    assert.equal(closed.valor, 1000);
    assert.equal(closed.valorRecebido, 1000);
    assert.equal(closed.saldoAberto, 0);
    assert.equal(closed.status, 'recebido');
    assert.equal(closed.receiptCount, 2);
  });
});

test('retries are idempotent and cannot reuse a key with different financial data', async () => {
  await withApi({ 'finance_receivables/recv_org_a_client1': seedReceivable() }, async (base, docs) => {
    const body = input();
    const first = await post(base, body);
    const firstResult = await first.json() as { receiptId: string };
    assert.equal(first.status, 201);
    const retry = await post(base, body);
    assert.equal(retry.status, 200);
    assert.equal((await retry.json() as any).replayed, true);
    assert.equal((docs.get('finance_receivables/recv_org_a_client1') as any).valorRecebido, 500);
    const changed = await post(base, { ...body, receiptAmount: 250 });
    assert.equal(changed.status, 409);
    assert.equal([...docs.keys()].filter((key) => key.startsWith('finance_receivable_receipts/')).length, 1);
    assert.ok(firstResult.receiptId);
  });
});

test('rejects over-balance amounts, invalid requests and missing receivables', async () => {
  await withApi({ 'finance_receivables/recv_org_a_client1': seedReceivable() }, async (base) => {
    assert.equal((await post(base, input({ receiptAmount: 800.01 }))).status, 409);
    assert.equal((await post(base, input({ receiptAmount: 0 }))).status, 400);
    assert.equal((await post(base, input({ receiptDate: '2026-02-30' }))).status, 400);
    assert.equal((await post(base, input({ receivableId: 'recv_org_a_missing' }))).status, 404);
    assert.equal((await post(base, input({ orgId: 'org_b' }))).status, 403);
  });
});

test('rejects closed receivables and cross-company source records', async () => {
  await withApi({
    'finance_receivables/recv_org_a_client1': seedReceivable({ status: 'recebido', valorRecebido: 1000, saldoAberto: 0 }),
    'finance_receivables/recv_org_b_client2': { ...seedReceivable(), id: 'recv_org_b_client2', orgId: 'org_b' },
  }, async (base) => {
    assert.equal((await post(base, input())).status, 409);
    assert.equal((await post(base, input({ receivableId: 'recv_org_b_client2' }))).status, 404);
  });
});
