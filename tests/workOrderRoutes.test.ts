import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { Server } from 'node:http';
import type { AdminHandles } from '../server/firebaseAdmin.ts';
import { createWorkOrderRouter } from '../server/workOrderRoutes.ts';

type Seed = Record<string, Record<string, any>>;
function mockAdmin(seed: Seed) {
  const docs = new Map<string, Record<string, any>>(Object.entries(seed));
  let generated = 0;
  const makeQuery = (name: string, filters: Array<{ field: string; value: unknown }> = []) => ({
    __query: true, name, filters,
    where: (field: string, _op: string, value: unknown) => makeQuery(name, [...filters, { field, value }]),
  });
  const collection = (name: string) => ({
    doc: (id?: string) => { const key = id || `generated_${++generated}`; return { id: key, path: `${name}/${key}` }; },
    where: (field: string, _op: string, value: unknown) => makeQuery(name, [{ field, value }]),
  });
  const db: any = {
    collection,
    runTransaction: async (callback: (tx: any) => Promise<unknown>) => {
      const creates: Array<{ path: string; data: Record<string, any> }> = [];
      const sets: Array<{ path: string; data: Record<string, any> }> = [];
      const updates: Array<{ path: string; data: Record<string, any> }> = [];
      const tx = {
        get: async (ref: any) => {
          if (ref.__query) {
            const rows = [...docs.entries()].filter(([path, data]) =>
              path.startsWith(ref.name + '/') && ref.filters.every((filter: any) => data[filter.field] === filter.value));
            return { docs: rows.map(([path, data]) => ({ id: path.split('/').pop(), data: () => data })) };
          }
          const data = docs.get(ref.path);
          return { id: ref.id, exists: data !== undefined, data: () => data };
        },
        create: (ref: { path: string }, data: Record<string, any>) => creates.push({ path: ref.path, data }),
        set: (ref: { path: string }, data: Record<string, any>) => sets.push({ path: ref.path, data }),
        update: (ref: { path: string }, data: Record<string, any>) => updates.push({ path: ref.path, data }),
      };
      const result = await callback(tx);
      for (const item of creates) if (docs.has(item.path)) throw new Error('already exists');
      for (const item of updates) if (!docs.has(item.path)) throw new Error('missing transaction update target');
      for (const item of creates) docs.set(item.path, item.data);
      for (const item of sets) docs.set(item.path, item.data);
      for (const item of updates) docs.set(item.path, { ...(docs.get(item.path) || {}), ...item.data });
      return result;
    },
  };
  return { handles: { db } as unknown as AdminHandles, docs };
}
async function withApi(role: string, seed: Seed, action: (base: string, docs: Map<string, Record<string, any>>) => Promise<void>) {
  const mocked = mockAdmin(seed);
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { uid: 'operator_1', email: 'operator@company.test', master: false, orgs: { org_a: role } };
    next();
  });
  app.use('/api/work-orders', createWorkOrderRouter(() => mocked.handles));
  const server: Server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Work order test API did not bind a TCP port');
  try { await action('http://127.0.0.1:' + address.port, mocked.docs); }
  finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}
const seed = (): Seed => ({
  'units/unit_a': { id: 'unit_a', orgId: 'org_a', name: 'Unidade A' },
  'work_order_statuses/org_a_aberto': { id: 'aberto', orgId: 'org_a', name: 'Aberto', isInitial: true, isCompleted: false },
  'work_order_statuses/org_a_em_execucao': { id: 'em_execucao', orgId: 'org_a', name: 'Em Execução', isInitial: false, isCompleted: false },
  'work_order_statuses/org_a_aguardando_pecas': { id: 'aguardando_pecas', orgId: 'org_a', name: 'Aguardando Peças', isInitial: false, isCompleted: false, requiresNotes: true },
  'work_order_statuses/org_a_concluido': { id: 'concluido', orgId: 'org_a', name: 'Concluído', isInitial: false, isCompleted: true },
});
const createPayload = (changes: Record<string, unknown> = {}) => ({
  orgId: 'org_a',
  workOrder: {
    title: 'Montagem de linha de processo',
    description: 'Montagem e alinhamento de trecho de tubulação sanitária em inox 316L.',
    unitId: 'unit_a', status: 'aberto', orderType: 'instalacao', priority: 'alta',
    requesterName: 'Encarregado da obra', estimatedHours: 16, estimatedCost: 0, ...changes,
  },
  autoNumber: true, idempotencyKey: 'create-key-0001',
});
async function post(base: string, path: string, body: Record<string, unknown>) {
  return fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}
test('creates OS, sequence and initial timeline event in one transaction', async () => {
  await withApi('Operacional', seed(), async (base, docs) => {
    const response = await post(base, '/api/work-orders', createPayload());
    assert.equal(response.status, 201);
    const body = await response.json() as { ok: boolean; orderId: string; orderNumber: string };
    assert.equal(body.ok, true);
    assert.equal(body.orderNumber, `OS-${new Date().getFullYear()}-001`);
    const order = docs.get('work_orders/' + body.orderId);
    assert.equal(order?.unitId, 'unit_a');
    assert.equal(order?.requesterId, 'operator_1');
    assert.equal(order?.status, 'aberto');
    const events = [...docs.entries()].filter(([path, value]) => path.startsWith('order_events/') && value.orderId === body.orderId);
    assert.equal(events.length, 1);
    assert.equal(events[0][1].eventType, 'criacao');
    assert.equal(docs.get('counters/org_a_work_orders')?.seq, 1);
  });
});
test('same idempotency key does not create a second OS or increment counter twice', async () => {
  await withApi('Operacional', seed(), async (base, docs) => {
    const first = await post(base, '/api/work-orders', createPayload());
    const a = await first.json() as { orderId: string; orderNumber: string };
    const second = await post(base, '/api/work-orders', createPayload());
    const b = await second.json() as { orderId: string; orderNumber: string };
    assert.equal(second.status, 200);
    assert.equal(b.orderId, a.orderId);
    assert.equal(b.orderNumber, a.orderNumber);
    assert.equal([...docs.keys()].filter((path) => path.startsWith('work_orders/')).length, 1);
    assert.equal(docs.get('counters/org_a_work_orders')?.seq, 1);
  });
});
test('rejects missing and cross-company units', async () => {
  const initial = seed();
  initial['units/unit_b'] = { id: 'unit_b', orgId: 'org_b' };
  await withApi('Operacional', initial, async (base, docs) => {
    assert.equal((await post(base, '/api/work-orders', createPayload({ unitId: 'default_unit' }))).status, 400);
    assert.equal((await post(base, '/api/work-orders', createPayload({ unitId: 'unit_b' }))).status, 409);
    assert.equal([...docs.keys()].filter((path) => path.startsWith('work_orders/')).length, 0);
  });
});
test('requires notes for configured states and leaves the OS unchanged on invalid transition', async () => {
  const initial = seed();
  initial['work_orders/wo_a'] = { id: 'wo_a', orgId: 'org_a', unitId: 'unit_a', status: 'aberto' };
  await withApi('Operacional', initial, async (base, docs) => {
    const response = await post(base, '/api/work-orders/wo_a/transition', {
      orgId: 'org_a', expectedStatus: 'aberto', targetStatusId: 'aguardando_pecas', notes: '', idempotencyKey: 'transition-key-01',
    });
    assert.equal(response.status, 400);
    assert.equal(docs.get('work_orders/wo_a')?.status, 'aberto');
    assert.equal([...docs.keys()].filter((path) => path.startsWith('order_events/')).length, 0);
  });
});
test('changes status and timeline atomically and records first execution date', async () => {
  const initial = seed();
  initial['work_orders/wo_a'] = { id: 'wo_a', orgId: 'org_a', unitId: 'unit_a', status: 'aberto' };
  await withApi('Operacional', initial, async (base, docs) => {
    const response = await post(base, '/api/work-orders/wo_a/transition', {
      orgId: 'org_a', expectedStatus: 'aberto', targetStatusId: 'em_execucao', notes: '', idempotencyKey: 'transition-key-02',
    });
    assert.equal(response.status, 200);
    assert.equal(docs.get('work_orders/wo_a')?.status, 'em_execucao');
    assert.match(String(docs.get('work_orders/wo_a')?.actualStartDate), /^\d{4}-\d{2}-\d{2}$/);
    const events = [...docs.values()].filter((v) => v.orderId === 'wo_a' && v.eventType === 'mudanca_status');
    assert.equal(events.length, 1);
    assert.equal(events[0].previousStatus, 'aberto');
    assert.equal(events[0].newStatus, 'em_execucao');
  });
});
test('rejects stale transitions instead of overwriting another operator change', async () => {
  const initial = seed();
  initial['work_orders/wo_a'] = { id: 'wo_a', orgId: 'org_a', unitId: 'unit_a', status: 'em_execucao' };
  await withApi('Operacional', initial, async (base, docs) => {
    const response = await post(base, '/api/work-orders/wo_a/transition', {
      orgId: 'org_a', expectedStatus: 'aberto', targetStatusId: 'concluido', notes: '', idempotencyKey: 'transition-key-03',
    });
    assert.equal(response.status, 409);
    assert.equal(docs.get('work_orders/wo_a')?.status, 'em_execucao');
    assert.equal([...docs.keys()].filter((path) => path.startsWith('order_events/')).length, 0);
  });
});
test('requires edit permission in Operações to change status', async () => {
  const initial = seed();
  initial['work_orders/wo_a'] = { id: 'wo_a', orgId: 'org_a', unitId: 'unit_a', status: 'aberto' };
  await withApi('Visualizador', initial, async (base, docs) => {
    const response = await post(base, '/api/work-orders/wo_a/transition', {
      orgId: 'org_a', expectedStatus: 'aberto', targetStatusId: 'em_execucao', notes: '', idempotencyKey: 'transition-key-04',
    });
    assert.equal(response.status, 403);
    assert.equal(docs.get('work_orders/wo_a')?.status, 'aberto');
  });
});
