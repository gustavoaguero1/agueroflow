import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { Server } from 'node:http';
import type { AdminHandles } from '../server/firebaseAdmin.ts';
import { createFinanceBankReconciliationRouter } from '../server/financeBankReconciliationRoutes.ts';

type Ref = { path: string; id: string };
type QueryRef = { collection: string; filters: Array<[string, unknown]>; where: (field: string, operator: string, value: unknown) => QueryRef; limit: (count: number) => QueryRef };
function mockAdmin(seed: Record<string, unknown>) {
  const docs = new Map(Object.entries(seed));
  const ref = (collection: string, id: string): Ref => ({
    path: collection + '/' + id, id,
    get: async () => { const data = docs.get(collection + '/' + id); return { id, exists: data !== undefined, data: () => data }; },
  } as Ref);
  const queryResult = (query: QueryRef) => [...docs.entries()]
    .filter(([path, value]) => path.startsWith(query.collection + '/') && query.filters.every(([field, expected]) => (value as any)?.[field] === expected))
    .map(([path, data]) => ({ id: path.split('/').pop(), exists: true, data: () => data }));
  const db: any = {
    collection: (name: string) => ({
      doc: (id: string) => ref(name, id),
      where: (field: string, _operator: string, value: unknown) => {
        const query: QueryRef = {
          collection: name, filters: [[field, value]],
          where(nextField: string, _nextOperator: string, nextValue: unknown) { this.filters.push([nextField, nextValue]); return this; },
          limit(_count: number) { return this; },
        };
        return query;
      },
    }),
    getAll: async (...refs: Ref[]) => refs.map((item) => {
      const data = docs.get(item.path);
      return { id: item.id, exists: data !== undefined, data: () => data };
    }),
    batch: () => {
      const creates: Array<{ path: string; data: unknown }> = [];
      return {
        create: (item: Ref, data: unknown) => creates.push({ path: item.path, data }),
        commit: async () => {
          for (const item of creates) if (docs.has(item.path)) throw Object.assign(new Error('already exists'), { code: 6 });
          for (const item of creates) docs.set(item.path, item.data);
        },
      };
    },
    runTransaction: async (fn: (tx: any) => Promise<unknown>) => {
      const creates: Array<{ path: string; data: unknown }> = [];
      const tx = {
        get: async (item: Ref | QueryRef) => {
          if ('collection' in item) {
            const found = queryResult(item);
            return { empty: found.length === 0, docs: found };
          }
          const data = docs.get(item.path);
          return { id: item.id, exists: data !== undefined, data: () => data };
        },
        create: (item: Ref, data: unknown) => creates.push({ path: item.path, data }),
      };
      const result = await fn(tx);
      for (const item of creates) if (docs.has(item.path)) throw Object.assign(new Error('already exists'), { code: 6 });
      for (const item of creates) docs.set(item.path, item.data);
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
  app.use('/api/finance/bank-reconciliation', createFinanceBankReconciliationRouter(() => mocked.handles));
  const server: Server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('API test server did not bind a TCP port');
  try { await action('http://127.0.0.1:' + address.port, mocked.docs); }
  finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}

const rows = [
  { date: '2026-11-24', amount: 500, direction: 'debit', description: 'PIX Fornecedor A', externalId: 'FIT-1', rowNumber: 2 },
  { date: '2026-11-24', amount: 500, direction: 'debit', description: 'PIX Fornecedor A', externalId: 'FIT-1', rowNumber: 3 },
  { date: '2026-11-25', amount: 900, direction: 'credit', description: 'Recebimento cliente', externalId: 'FIT-2', rowNumber: 4 },
];

async function post(base: string, path: string, body: unknown) {
  return fetch(base + '/api/finance/bank-reconciliation' + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
}

test('imports bank rows idempotently and ignores duplicate identifiers', async () => {
  await withApi({}, async (base, docs) => {
    const body = { orgId: 'org_a', importBatchId: 'batch-001', sourceFileName: 'extrato.ofx', accountLabel: 'Conta principal', rows };
    const first = await post(base, '/import', body);
    assert.equal(first.status, 201);
    assert.deepEqual(await first.json(), { ok: true, imported: 2, duplicates: 1 });
    const transaction = [...docs.entries()].find(([path]) => path.startsWith('finance_bank_transactions/'))?.[1] as any;
    assert.equal(transaction.orgId, 'org_a');
    assert.equal(transaction.importedBy, 'manager1');
    const second = await post(base, '/import', { ...body, importBatchId: 'batch-002' });
    assert.deepEqual(await second.json(), { ok: true, imported: 0, duplicates: 3 });
    assert.equal([...docs.keys()].filter((path) => path.startsWith('finance_bank_transactions/')).length, 2);
  });
});

test('rejects invalid rows, missing account label and cross-company imports', async () => {
  await withApi({}, async (base) => {
    assert.equal((await post(base, '/import', { orgId: 'org_b', importBatchId: 'batch-001', sourceFileName: 'x.csv', accountLabel: 'Conta', rows })).status, 403);
    assert.equal((await post(base, '/import', { orgId: 'org_a', importBatchId: 'batch-001', sourceFileName: 'x.csv', rows })).status, 400);
    assert.equal((await post(base, '/import', { orgId: 'org_a', importBatchId: 'batch-001', sourceFileName: 'x.csv', accountLabel: 'Conta', rows: [{ ...rows[0], amount: -1 }] })).status, 400);
  });
});

test('manual match links a debit to an exact cash payment without changing payable or settlement', async () => {
  const transactionId = 'btxn_org_a_tx1';
  const settlementId = 'pays_org_a_payable_operation';
  const seed = {
    ['finance_bank_transactions/' + transactionId]: {
      id: transactionId, orgId: 'org_a', date: '2026-11-24', amount: 500, direction: 'debit',
      description: 'PIX Fornecedor A', sourceFileName: 'extrato.csv',
    },
    ['finance_payable_settlements/' + settlementId]: {
      id: settlementId, orgId: 'org_a', payableId: 'pay_org_a_1', paymentDate: '2026-11-24',
      paymentAmount: 500, discountAmount: 100, settledValue: 600,
      payableSnapshot: { supplierName: 'Fornecedor A', documento: 'NF 123' },
    },
    'finance_payables/pay_org_a_1': { id: 'pay_org_a_1', orgId: 'org_a', status: 'aberto', valor: 1000, valorPago: 500, saldoAberto: 400 },
  };
  await withApi(seed, async (base, docs) => {
    const before = docs.get('finance_payables/pay_org_a_1');
    const response = await post(base, '/' + transactionId + '/match', { orgId: 'org_a', transactionId, settlementId });
    assert.equal(response.status, 201);
    const result = await response.json() as { matchId: string };
    const match = docs.get('finance_bank_reconciliations/' + result.matchId) as any;
    assert.equal(match.transactionId, transactionId);
    assert.equal(match.settlementId, settlementId);
    assert.equal(match.amount, 500);
    assert.deepEqual(docs.get('finance_payables/pay_org_a_1'), before);
    assert.equal((docs.get('finance_payable_settlements/' + settlementId) as any).paymentAmount, 500);
  });
});

test('rejects credit rows, amount mismatch and a second match to the same settlement', async () => {
  const settlementId = 'settlement-1';
  const baseSeed = {
    ['finance_payable_settlements/' + settlementId]: {
      id: settlementId, orgId: 'org_a', payableId: 'pay1', paymentDate: '2026-11-24', paymentAmount: 500, settledValue: 500,
    },
  };
  await withApi({
    ...baseSeed,
    'finance_bank_transactions/credit': { id: 'credit', orgId: 'org_a', date: '2026-11-24', amount: 500, direction: 'credit' },
    'finance_bank_transactions/wrong': { id: 'wrong', orgId: 'org_a', date: '2026-11-24', amount: 501, direction: 'debit' },
    'finance_bank_transactions/second': { id: 'second', orgId: 'org_a', date: '2026-11-24', amount: 500, direction: 'debit' },
    'finance_bank_reconciliations/existing': { id: 'existing', orgId: 'org_a', transactionId: 'other', settlementId },
  }, async (base) => {
    assert.equal((await post(base, '/credit/match', { orgId: 'org_a', settlementId })).status, 409);
    assert.equal((await post(base, '/wrong/match', { orgId: 'org_a', settlementId })).status, 409);
    assert.equal((await post(base, '/second/match', { orgId: 'org_a', settlementId })).status, 409);
  });
});

test('keeps identical CSV rows without bank IDs distinct by source row, while repeat imports remain idempotent', async () => {
  await withApi({}, async (base, docs) => {
    const fallbackRows = [
      { date: '2026-11-24', amount: 100, direction: 'debit', description: 'PIX MESMO VALOR', rowNumber: 2 },
      { date: '2026-11-24', amount: 100, direction: 'debit', description: 'PIX MESMO VALOR', rowNumber: 3 },
    ];
    const body = { orgId: 'org_a', importBatchId: 'batch-fallback', sourceFileName: 'extrato.csv', accountLabel: 'Conta corrente', rows: fallbackRows };
    const first = await post(base, '/import', body);
    assert.deepEqual(await first.json(), { ok: true, imported: 2, duplicates: 0 });
    const second = await post(base, '/import', { ...body, importBatchId: 'batch-fallback-2' });
    assert.deepEqual(await second.json(), { ok: true, imported: 0, duplicates: 2 });
    assert.equal([...docs.keys()].filter((path) => path.startsWith('finance_bank_transactions/')).length, 2);
  });
});

test('manually matches a bank credit to an exact receivable receipt without changing the receivable or receipt event', async () => {
  const transactionId = 'btxn_org_a_credit1';
  const receiptId = 'recr_org_a_recv_1_request001';
  const seed = {
    ['finance_bank_transactions/' + transactionId]: {
      id: transactionId, orgId: 'org_a', date: '2026-11-24', amount: 400, direction: 'credit',
      description: 'TED Cliente A', sourceFileName: 'extrato.csv',
    },
    ['finance_receivable_receipts/' + receiptId]: {
      id: receiptId, orgId: 'org_a', receivableId: 'recv_org_a_1',
      receiptDate: '2026-11-24', receiptAmount: 400,
      receivableSnapshot: { clientName: 'Cliente A', documento: 'PROP-001' },
    },
    'finance_receivables/recv_org_a_1': {
      id: 'recv_org_a_1', orgId: 'org_a', status: 'aberto', valor: 1000, valorRecebido: 400, saldoAberto: 600,
    },
  };
  await withApi(seed, async (base, docs) => {
    const receivableBefore = docs.get('finance_receivables/recv_org_a_1');
    const receiptBefore = docs.get('finance_receivable_receipts/' + receiptId);
    const response = await post(base, '/' + transactionId + '/match-receipt', {
      orgId: 'org_a', transactionId, receiptId,
    });
    assert.equal(response.status, 201);
    const result = await response.json() as { matchId: string };
    const match = docs.get('finance_bank_reconciliations/' + result.matchId) as any;
    assert.equal(match.matchType, 'receivable');
    assert.equal(match.transactionId, transactionId);
    assert.equal(match.receiptId, receiptId);
    assert.equal(match.receivableId, 'recv_org_a_1');
    assert.equal(match.amount, 400);
    assert.deepEqual(docs.get('finance_receivables/recv_org_a_1'), receivableBefore);
    assert.deepEqual(docs.get('finance_receivable_receipts/' + receiptId), receiptBefore);
  });
});

test('credit reconciliation rejects wrong direction, amount mismatch, foreign company and duplicate receipt match', async () => {
  const receiptId = 'recr_org_a_recv_1_request001';
  const seed = {
    ['finance_receivable_receipts/' + receiptId]: {
      id: receiptId, orgId: 'org_a', receivableId: 'recv_org_a_1', receiptDate: '2026-11-24', receiptAmount: 400,
    },
    'finance_bank_transactions/debit': { id: 'debit', orgId: 'org_a', date: '2026-11-24', amount: 400, direction: 'debit' },
    'finance_bank_transactions/wrong': { id: 'wrong', orgId: 'org_a', date: '2026-11-24', amount: 401, direction: 'credit' },
    'finance_bank_transactions/foreign': { id: 'foreign', orgId: 'org_b', date: '2026-11-24', amount: 400, direction: 'credit' },
    'finance_bank_transactions/credit2': { id: 'credit2', orgId: 'org_a', date: '2026-11-24', amount: 400, direction: 'credit' },
    'finance_bank_transactions/credit3': { id: 'credit3', orgId: 'org_a', date: '2026-11-24', amount: 400, direction: 'credit' },
  };
  await withApi(seed, async (base) => {
    assert.equal((await post(base, '/debit/match-receipt', { orgId: 'org_a', receiptId })).status, 409);
    assert.equal((await post(base, '/wrong/match-receipt', { orgId: 'org_a', receiptId })).status, 409);
    assert.equal((await post(base, '/foreign/match-receipt', { orgId: 'org_a', receiptId })).status, 403);
    assert.equal((await post(base, '/credit2/match-receipt', { orgId: 'org_a', receiptId })).status, 201);
    assert.equal((await post(base, '/credit3/match-receipt', { orgId: 'org_a', receiptId })).status, 409);
  });
});
