import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { Server } from 'node:http';
import type { AdminHandles } from '../../server/firebaseAdmin.ts';
import { createCommercialFunnelRouter } from '../../server/commercialFunnelRoutes.ts';

type QueryRef = { kind: 'query'; collection: string; field: string; value: unknown };
type DocRef = { path: string; id: string; collection: string };
type Ref = QueryRef | DocRef;

const proposal = {
  id: 'p1',
  organizationId: 'org_a',
  unitId: 'unit_a',
  code: 'PROP-1',
  title: 'Skid',
  clientName: 'ACME',
  scopeDescription: 'Montar skid',
  status: 'negociacao',
  proposedTotal: 1000,
  totalBaseCost: 600,
  totalFreightCost: 20,
  totalTaxCost: 30,
};

const seedData = () => ({
  'units/unit_a': { id: 'unit_a', orgId: 'org_a', name: 'Unidade A' },
  'contracts/contract_a': { id: 'contract_a', orgId: 'org_a', title: 'Contrato A' },
  'work_order_statuses/org_a_aberto': {
    id: 'aberto', orgId: 'org_a', name: 'Aberto', order: 1, isInitial: true,
  },
  'work_order_statuses/org_a_em_execucao': {
    id: 'em_execucao', orgId: 'org_a', name: 'Em execução', order: 2, isInitial: false,
  },
  'commercial_proposals/p1': { ...proposal },
});

function mockAdmin(seed: Record<string, unknown>) {
  const docs = new Map(Object.entries(seed));
  let queue: Promise<void> = Promise.resolve();

  const db: any = {
    collection: (name: string) => ({
      doc: (id: string): DocRef => ({ path: name + '/' + id, id, collection: name }),
      where: (field: string, operation: string, value: unknown): QueryRef => {
        if (operation !== '==') throw new Error('Test mock only supports equality queries.');
        return { kind: 'query', collection: name, field, value };
      },
    }),
    runTransaction: async (fn: (tx: any) => Promise<unknown>) => {
      const previous = queue;
      let release!: () => void;
      queue = new Promise<void>((resolve) => { release = resolve; });
      await previous;
      try {
        const creates: Array<{ ref: DocRef; data: unknown }> = [];
        const updates: Array<{ ref: DocRef; data: Record<string, unknown> }> = [];
        const tx = {
          get: async (ref: Ref) => {
            if ('kind' in ref && ref.kind === 'query') {
              const prefix = ref.collection + '/';
              const matching = [...docs.entries()]
                .filter(([path, data]) => path.startsWith(prefix)
                  && (data as Record<string, unknown>)[ref.field] === ref.value)
                .map(([path, data]) => ({
                  id: path.slice(prefix.length),
                  data: () => data,
                  exists: true,
                }));
              return { docs: matching, size: matching.length, empty: matching.length === 0 };
            }
            const docRef = ref as DocRef;
            const data = docs.get(docRef.path);
            return { id: docRef.id, exists: data !== undefined, data: () => data };
          },
          create: (ref: DocRef, data: unknown) => { creates.push({ ref, data }); },
          update: (ref: DocRef, data: Record<string, unknown>) => { updates.push({ ref, data }); },
        };
        const result = await fn(tx);
        const createPaths = new Set<string>();
        for (const item of creates) {
          if (docs.has(item.ref.path) || createPaths.has(item.ref.path)) {
            throw Object.assign(new Error('already exists'), { code: 6 });
          }
          createPaths.add(item.ref.path);
        }
        for (const item of updates) {
          if (!docs.has(item.ref.path)) throw new Error('missing document for transaction update');
        }
        for (const item of creates) docs.set(item.ref.path, item.data);
        for (const item of updates) docs.set(item.ref.path, {
          ...(docs.get(item.ref.path) as object),
          ...item.data,
        });
        return result;
      } finally {
        release();
      }
    },
  };
  return { handles: { db } as unknown as AdminHandles, docs };
}

type TestAccess = { role?: string; areas?: string };
async function withApi(
  seed: Record<string, unknown>,
  action: (base: string, docs: Map<string, unknown>) => Promise<void>,
  access: TestAccess = {},
) {
  const mocked = mockAdmin(seed);
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = {
      uid: 'seller_1',
      email: 'vendedor@empresa.com',
      master: false,
      orgs: { org_a: access.role ?? 'Operacional' },
      areas: { org_a: access.areas ?? '12120010112' },
    };
    next();
  });
  app.use('/api/commercial/proposals', createCommercialFunnelRouter(() => mocked.handles));
  const server: Server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('API test server did not bind a TCP port');
  try {
    await action('http://127.0.0.1:' + address.port, mocked.docs);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve()),
    );
  }
}

async function post(base: string, action: string, body: unknown, proposalId = 'p1') {
  return fetch(`${base}/api/commercial/proposals/${encodeURIComponent(proposalId)}/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('three concurrent wins create a single Contract, Project with frozen baseline, OS, counter and timeline event', async () => {
  await withApi(seedData(), async (base, docs) => {
    const body = { orgId: 'org_a' };
    const responses = await Promise.all([
      post(base, 'win', body),
      post(base, 'win', body),
      post(base, 'win', body),
    ]);
    const payloads = await Promise.all(responses.map((response) => response.json() as Promise<any>));
    assert.deepEqual(responses.map((response) => response.status), [200, 200, 200]);
    assert.equal(new Set(payloads.map((item) => item.workOrderId)).size, 1);
    assert.equal(new Set(payloads.map((item) => item.projectId)).size, 1);
    assert.equal(new Set(payloads.map((item) => item.contractId)).size, 1);
    assert.equal(payloads.filter((item) => item.replayed).length, 2);

    const orderId = 'os_prop_p1';
    const contractId = 'ct_prop_p1';
    const projectId = 'prj_prop_p1';
    const workOrder = docs.get('work_orders/' + orderId) as Record<string, any>;
    const derivedContract = docs.get('contracts/' + contractId) as Record<string, any>;
    const derivedProject = docs.get('projects/' + projectId) as Record<string, any>;
    const event = docs.get('order_events/' + orderId + '_created') as Record<string, any>;
    const savedProposal = docs.get('commercial_proposals/p1') as Record<string, any>;
    const counter = docs.get('counters/org_a_work_orders') as Record<string, any>;

    assert.equal(derivedContract.orgId, 'org_a');
    assert.deepEqual(derivedContract.unitIds, ['unit_a']);
    assert.equal(derivedContract.value, 1000);
    assert.equal(derivedProject.orgId, 'org_a');
    assert.equal(derivedProject.contractId, contractId);
    assert.equal(derivedProject.unitId, 'unit_a');
    assert.equal(derivedProject.budgetBaseline.version, 1);
    assert.equal(derivedProject.budgetBaseline.plannedDirectCost, 650);
    assert.equal(derivedProject.budgetBaseline.contractedRevenue, 1000);

    assert.equal(workOrder.orgId, 'org_a');
    assert.equal(workOrder.unitId, 'unit_a');
    assert.equal(workOrder.contractId, contractId);
    assert.equal(workOrder.projectId, projectId);
    assert.equal(workOrder.status, 'aberto');
    assert.equal(workOrder.estimatedCost, 650);
    assert.equal(workOrder.proposalId, 'p1');
    assert.equal(event.orderId, orderId);
    assert.equal(event.userId, 'seller_1');
    assert.equal(event.newStatus, 'aberto');
    assert.equal(savedProposal.status, 'ganha');
    assert.equal(savedProposal.contractId, contractId);
    assert.equal(savedProposal.projectId, projectId);
    assert.equal(savedProposal.workOrderId, orderId);
    assert.equal(savedProposal.workOrderCode, workOrder.orderNumber);
    assert.equal(savedProposal.approvedBaselineSnapshot.plannedDirectCost, 650);
    assert.equal(savedProposal.statusHistory.length, 1);
    assert.equal(counter.seq, 1);
    assert.equal([...docs.keys()].filter((path) => path.startsWith('work_orders/')).length, 1);
    assert.equal([...docs.keys()].filter((path) => path.startsWith('projects/')).length, 1);
    assert.equal([...docs.keys()].filter((path) => path.startsWith('order_events/')).length, 1);
  });
});

test('win reuses existing same-org contract and rejects default_unit', async () => {
  await withApi({
    ...seedData(),
    'commercial_proposals/p1': { ...proposal, unitId: 'default_unit' },
  }, async (base, docs) => {
    const response = await post(base, 'win', { orgId: 'org_a' });
    assert.equal(response.status, 400);
    assert.match((await response.json() as any).error, /default_unit/i);
    assert.equal(docs.has('projects/prj_prop_p1'), false);
    assert.equal(docs.has('work_orders/os_prop_p1'), false);
  });

  await withApi({
    ...seedData(),
    'commercial_proposals/p1': { ...proposal, contractId: 'contract_a' },
  }, async (base, docs) => {
    const response = await post(base, 'win', { orgId: 'org_a' });
    assert.equal(response.status, 200);
    const body = await response.json() as any;
    assert.equal(body.contractId, 'contract_a');
    assert.equal(docs.has('contracts/ct_prop_p1'), false);
    assert.equal((docs.get('projects/prj_prop_p1') as any).contractId, 'contract_a');
    assert.equal((docs.get('work_orders/os_prop_p1') as any).contractId, 'contract_a');
  });
});

test('win rejects a missing or cross-company unit and does not write any OS', async () => {
  await withApi({
    ...seedData(),
    'units/unit_b': { id: 'unit_b', orgId: 'org_b', name: 'Unidade B' },
    'commercial_proposals/p1': { ...proposal, unitId: 'unit_b' },
  }, async (base, docs) => {
    const response = await post(base, 'win', { orgId: 'org_a' });
    const body = await response.json() as { error: string };
    assert.equal(response.status, 400);
    assert.match(body.error, /não pertence à empresa/i);
    assert.equal([...docs.keys()].some((path) => path.startsWith('work_orders/')), false);
    assert.equal([...docs.keys()].some((path) => path.startsWith('projects/')), false);
    assert.equal(docs.has('counters/org_a_work_orders'), false);
  });
});

test('win requires an explicitly configured initial OS status', async () => {
  const seed = {
    ...seedData(),
    'work_order_statuses/org_a_aberto': {
      id: 'aberto', orgId: 'org_a', name: 'Aberto', order: 1, isInitial: false,
    },
  };
  await withApi(seed, async (base, docs) => {
    const response = await post(base, 'win', { orgId: 'org_a' });
    assert.equal(response.status, 400);
    assert.match((await response.json() as any).error, /estado inicial/i);
    assert.equal(docs.has('work_orders/os_prop_p1'), false);
    assert.equal(docs.has('projects/prj_prop_p1'), false);
  });
});

test('win rejects a contract from another company', async () => {
  await withApi({
    ...seedData(),
    'contracts/contract_b': { id: 'contract_b', orgId: 'org_b' },
    'commercial_proposals/p1': { ...proposal, contractId: 'contract_b' },
  }, async (base, docs) => {
    const response = await post(base, 'win', { orgId: 'org_a' });
    assert.equal(response.status, 400);
    assert.match((await response.json() as any).error, /contrato.*não pertence/i);
    assert.equal(docs.has('work_orders/os_prop_p1'), false);
    assert.equal(docs.has('projects/prj_prop_p1'), false);
  });
});

test('win requires edit access to both Commercial and Operations', async () => {
  await withApi(seedData(), async (base) => {
    const response = await post(base, 'win', { orgId: 'org_a' });
    assert.equal(response.status, 403);
  }, { areas: '12110010112' }); // Commercial: view only; Operations: edit.
});

test('loss requires a reason and persists it with the status history', async () => {
  await withApi(seedData(), async (base, docs) => {
    const missing = await post(base, 'lost', { orgId: 'org_a', reason: '', detail: '' });
    assert.equal(missing.status, 400);
    const response = await post(base, 'lost', { orgId: 'org_a', reason: 'Preço', detail: 'Cliente fechou com concorrente.' });
    assert.equal(response.status, 200);
    const proposalDoc = docs.get('commercial_proposals/p1') as Record<string, any>;
    assert.equal(proposalDoc.status, 'perdida');
    assert.equal(proposalDoc.motivoPerda, 'Preço: Cliente fechou com concorrente.');
    assert.equal(proposalDoc.statusHistory.length, 1);
  });
});

test('a proposal that generated an OS cannot be marked as lost', async () => {
  await withApi({
    ...seedData(),
    'commercial_proposals/p1': { ...proposal, status: 'ganha', workOrderId: 'os_prop_p1' },
  }, async (base) => {
    const response = await post(base, 'lost', { orgId: 'org_a', reason: 'Prazo' });
    assert.equal(response.status, 409);
  });
});

test('only open proposals can move between sent and negotiation stages', async () => {
  await withApi(seedData(), async (base, docs) => {
    const response = await post(base, 'stage', { orgId: 'org_a', status: 'enviada' });
    assert.equal(response.status, 200);
    assert.equal((docs.get('commercial_proposals/p1') as Record<string, any>).status, 'enviada');
    const forbidden = await post(base, 'stage', { orgId: 'org_a', status: 'ganha' });
    assert.equal(forbidden.status, 400);
  });
});
