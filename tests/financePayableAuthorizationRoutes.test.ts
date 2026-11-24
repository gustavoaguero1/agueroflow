import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { Server } from 'node:http';
import type { AdminHandles } from '../server/firebaseAdmin.ts';
import { createFinancePayableAuthorizationRouter } from '../server/financePayableAuthorizationRoutes.ts';
import { financePayableAuthorizationId } from '../src/services/financePayableAuthorizationRules.ts';

const caseRecord = {
  id: 'rcase_org_a_1',
  orgId: 'org_a',
  purchaseOrderId: 'po1',
  purchaseOrderCode: 'OC-2026-001',
  supplierName: 'Fornecedor A',
  supplierCnpj: '11111111000111',
  issueType: 'divergencia_valor_produtos',
  issueTitle: 'Divergência de valores da NF-e',
  description: 'O valor dos produtos precisa de aprovação.',
  snapshot: { invoiceKeys: ['K1'], sourceIssues: ['Diferença de valor'] },
  status: 'aprovada',
  reviewedBy: 'manager1',
  reviewedByName: 'Gerente',
  reviewedAt: new Date('2026-11-24T10:00:00.000Z'),
  resolutionNotes: 'Diferença conferida e autorizada pela gerência.',
};
const payable = {
  id: 'pay_org_a_K1_001',
  orgId: 'org_a',
  origem: 'nfe',
  fornecedor: { nome: 'Fornecedor A', cnpj: '11111111000111' },
  documento: 'NF-e 123',
  parcela: '001',
  valor: 5400,
  vencimento: '2026-12-10',
  status: 'aberto',
  categoriaId: 'cat_material',
  nfeChave: 'K1',
  purchaseOrderId: 'po1',
  purchaseOrderCode: 'OC-2026-001',
};

function mockAdmin(seed: Record<string, unknown>) {
  const docs = new Map(Object.entries(seed));
  const db: any = {
    collection: (name: string) => ({
      doc: (id: string) => ({ path: name + '/' + id, id }),
    }),
    runTransaction: async (fn: (tx: any) => Promise<unknown>) => {
      const writes: Array<{ path: string; data: unknown }> = [];
      const tx = {
        get: async (ref: { path: string; id: string }) => {
          const data = docs.get(ref.path);
          return { id: ref.id, exists: data !== undefined, data: () => data };
        },
        create: (ref: { path: string }, data: unknown) => { writes.push({ path: ref.path, data }); },
      };
      const result = await fn(tx);
      for (const write of writes) {
        if (docs.has(write.path)) throw Object.assign(new Error('already exists'), { code: 6 });
        docs.set(write.path, write.data);
      }
      return result;
    },
  };
  return { handles: { db } as unknown as AdminHandles, docs };
}

async function withApi(
  role: string,
  seed: Record<string, unknown>,
  action: (base: string, docs: Map<string, unknown>) => Promise<void>,
) {
  const mocked = mockAdmin(seed);
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { uid: 'manager1', email: 'manager@empresa.com', master: false, orgs: { org_a: role } };
    next();
  });
  app.use('/api/finance/payable-authorizations', createFinancePayableAuthorizationRouter(() => mocked.handles));
  const server: Server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('API test server did not bind a TCP port');
  try {
    await action('http://127.0.0.1:' + address.port, mocked.docs);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

const payload = { orgId: 'org_a', caseId: 'rcase_org_a_1', payableId: 'pay_org_a_K1_001' };

test('backend creates one authorization with server-derived actor and leaves payable open', async () => {
  await withApi('Gerente', {
    'finance_reconciliation_cases/rcase_org_a_1': caseRecord,
    'finance_payables/pay_org_a_K1_001': payable,
  }, async (base, docs) => {
    const response = await fetch(base + '/api/finance/payable-authorizations', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    assert.equal(response.status, 201);
    const body = await response.json() as { ok: boolean; authorizationId: string };
    assert.equal(body.ok, true);
    assert.equal(body.authorizationId, financePayableAuthorizationId('org_a', 'pay_org_a_K1_001'));
    const stored = docs.get('finance_payable_authorizations/' + body.authorizationId) as Record<string, any>;
    assert.equal(stored.authorizedBy, 'manager1');
    assert.equal(stored.authorizedByName, 'manager@empresa.com');
    assert.equal(stored.approvedBy, 'manager1');
    assert.equal(stored.authorizedValue, 5400);
    assert.equal(stored.dueDate, '2026-12-10');
    assert.equal(docs.get('finance_payables/pay_org_a_K1_001'), payable);
  });
});

test('backend takes case and payable identifiers from Firestore paths, not embedded id fields', async () => {
  await withApi('Gerente', {
    'finance_reconciliation_cases/rcase_org_a_1': { ...caseRecord, id: 'forged_case_id' },
    'finance_payables/pay_org_a_K1_001': { ...payable, id: 'forged_payable_id' },
  }, async (base, docs) => {
    const response = await fetch(base + '/api/finance/payable-authorizations', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    assert.equal(response.status, 201);
    const body = await response.json() as { authorizationId: string };
    const stored = docs.get('finance_payable_authorizations/' + body.authorizationId) as Record<string, any>;
    assert.equal(stored.payableId, 'pay_org_a_K1_001');
    assert.equal(stored.caseId, 'rcase_org_a_1');
  });
});

test('backend rejects duplicate authorization and preserves the first record', async () => {
  const id = financePayableAuthorizationId('org_a', 'pay_org_a_K1_001');
  await withApi('Gerente', {
    'finance_reconciliation_cases/rcase_org_a_1': caseRecord,
    'finance_payables/pay_org_a_K1_001': payable,
    ['finance_payable_authorizations/' + id]: { id, orgId: 'org_a', payableId: 'pay_org_a_K1_001' },
  }, async (base, docs) => {
    const response = await fetch(base + '/api/finance/payable-authorizations', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    assert.equal(response.status, 409);
    assert.deepEqual(docs.get('finance_payable_authorizations/' + id), { id, orgId: 'org_a', payableId: 'pay_org_a_K1_001' });
  });
});

test('backend rejects unapproved case, wrong invoice and paid title', async () => {
  await withApi('Gerente', {
    'finance_reconciliation_cases/rcase_org_a_1': { ...caseRecord, status: 'em_analise' },
    'finance_payables/pay_org_a_K1_001': payable,
  }, async (base) => {
    const response = await fetch(base + '/api/finance/payable-authorizations', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    assert.equal(response.status, 409);
  });

  await withApi('Gerente', {
    'finance_reconciliation_cases/rcase_org_a_1': caseRecord,
    'finance_payables/pay_org_a_K1_001': { ...payable, nfeChave: 'K2' },
  }, async (base) => {
    const response = await fetch(base + '/api/finance/payable-authorizations', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    assert.equal(response.status, 409);
  });

  await withApi('Gerente', {
    'finance_reconciliation_cases/rcase_org_a_1': caseRecord,
    'finance_payables/pay_org_a_K1_001': { ...payable, status: 'pago' },
  }, async (base) => {
    const response = await fetch(base + '/api/finance/payable-authorizations', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    assert.equal(response.status, 409);
  });
});

test('only Admin/Gerente can use the endpoint and Financeiro level 2 is required', async () => {
  await withApi('Supervisor', {
    'finance_reconciliation_cases/rcase_org_a_1': caseRecord,
    'finance_payables/pay_org_a_K1_001': payable,
  }, async (base) => {
    const response = await fetch(base + '/api/finance/payable-authorizations', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    assert.equal(response.status, 403);
  });
});
