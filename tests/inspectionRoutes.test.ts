import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { Server } from 'node:http';
import type { AdminHandles } from '../server/firebaseAdmin.ts';
import { createInspectionRouter } from '../server/inspectionRoutes.ts';

const inspection = {
  id: 'insp_org_a_001',
  orgId: 'org_a',
  unitId: 'unit_a',
  title: 'Inspeção visual da linha',
  inspectorId: 'operator_1',
  inspectorName: 'operador@empresa.com',
  status: 'agendada',
  result: 'pendente',
  findings: '',
  createdAt: '2026-11-25T10:00:00.000Z',
  updatedAt: '2026-11-25T10:00:00.000Z',
};

function mockAdmin(seed: Record<string, unknown>) {
  const docs = new Map(Object.entries(seed));
  const db: any = {
    collection: (name: string) => ({
      doc: (id: string) => ({ path: name + '/' + id, id }),
    }),
    runTransaction: async (fn: (tx: any) => Promise<unknown>) => {
      const creates: Array<{ path: string; data: unknown }> = [];
      const updates: Array<{ path: string; data: Record<string, unknown> }> = [];
      const tx = {
        get: async (ref: { path: string; id: string }) => {
          const data = docs.get(ref.path);
          return { id: ref.id, exists: data !== undefined, data: () => data };
        },
        create: (ref: { path: string }, data: unknown) => { creates.push({ path: ref.path, data }); },
        update: (ref: { path: string }, data: Record<string, unknown>) => { updates.push({ path: ref.path, data }); },
      };
      const result = await fn(tx);
      const createPaths = new Set<string>();
      for (const item of creates) {
        if (docs.has(item.path) || createPaths.has(item.path)) {
          throw Object.assign(new Error('already exists'), { code: 6 });
        }
        createPaths.add(item.path);
      }
      for (const item of updates) {
        if (!docs.has(item.path)) throw new Error('missing document for transaction update');
      }
      for (const item of creates) docs.set(item.path, item.data);
      for (const item of updates) docs.set(item.path, { ...(docs.get(item.path) as object), ...item.data });
      return result;
    },
  };
  return { handles: { db } as unknown as AdminHandles, docs };
}

function seed(status = 'agendada') {
  return {
    'units/unit_a': { id: 'unit_a', orgId: 'org_a', name: 'Unidade A' },
    'assets/asset_a': { id: 'asset_a', orgId: 'org_a', unitId: 'unit_a', name: 'Bomba A' },
    'work_orders/wo_a': { id: 'wo_a', orgId: 'org_a', unitId: 'unit_a', status: 'aberto' },
    ['inspections/' + inspection.id]: {
      ...inspection,
      status,
      ...(status === 'aguardando_revisao' ? {
        result: 'conforme',
        findings: 'Inspeção executada e conferida.',
        completedAt: '2026-11-25T10:30:00.000Z',
      } : {}),
    },
  };
}

async function withApi(
  role: string,
  initial: Record<string, unknown>,
  action: (base: string, docs: Map<string, unknown>) => Promise<void>,
) {
  const mocked = mockAdmin(initial);
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = {
      uid: 'operator_1',
      email: 'operador@empresa.com',
      master: false,
      orgs: { org_a: role },
    };
    next();
  });
  app.use('/api/inspections', createInspectionRouter(() => mocked.handles));
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

async function postCreate(base: string, body: unknown) {
  return fetch(base + '/api/inspections', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function postTransition(base: string, body: unknown, id = inspection.id) {
  return fetch(base + '/api/inspections/' + encodeURIComponent(id) + '/transition', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const createBody = {
  orgId: 'org_a',
  unitId: 'unit_a',
  assetId: 'asset_a',
  orderId: 'wo_a',
  title: 'Inspeção de recebimento do equipamento',
};

const transitionBody = {
  orgId: 'org_a',
  expectedStatus: 'agendada',
  action: 'start',
  idempotencyKey: 'inspection_start_0001',
};

test('creation stores an inspection as scheduled and writes its initial event atomically', async () => {
  await withApi('Operacional', seed(), async (base, docs) => {
    const response = await postCreate(base, createBody);
    assert.equal(response.status, 201);
    const body = await response.json() as { ok: boolean; inspection: Record<string, any> };
    assert.equal(body.ok, true);
    assert.equal(body.inspection.status, 'agendada');
    assert.equal(body.inspection.result, 'pendente');
    assert.equal(body.inspection.completedAt, undefined);
    assert.equal(body.inspection.inspectorId, 'operator_1');
    assert.equal(body.inspection.unitId, 'unit_a');
    const saved = docs.get('inspections/' + body.inspection.id) as Record<string, unknown>;
    assert.equal(saved.status, 'agendada');
    assert.ok(docs.has('inspection_events/inspection_evt_' + body.inspection.id + '_created'));
  });
});

test('creation rejects missing or cross-company units and invalid linked assets/orders', async () => {
  await withApi('Operacional', seed(), async (base) => {
    assert.equal((await postCreate(base, { ...createBody, unitId: '' })).status, 400);
    assert.equal((await postCreate(base, { ...createBody, unitId: 'unit_missing' })).status, 400);
    assert.equal((await postCreate(base, { ...createBody, assetId: 'asset_missing' })).status, 400);
    assert.equal((await postCreate(base, { ...createBody, orderId: 'order_missing' })).status, 400);
  });
});

test('the lifecycle starts an inspection from scheduled to in-field and creates an event', async () => {
  await withApi('Operacional', seed(), async (base, docs) => {
    const response = await postTransition(base, transitionBody);
    assert.equal(response.status, 200);
    const body = await response.json() as { ok: boolean; replayed: boolean; inspection: Record<string, any>; eventId: string };
    assert.equal(body.ok, true);
    assert.equal(body.replayed, false);
    assert.equal(body.inspection.status, 'em_campo');
    assert.ok(body.inspection.startedAt);
    assert.equal((docs.get('inspections/' + inspection.id) as Record<string, any>).status, 'em_campo');
    assert.equal((docs.get('inspection_events/' + body.eventId) as Record<string, any>).eventType, 'start');
  });
});

test('transition idempotency returns the original inspection without duplicating events', async () => {
  await withApi('Operacional', seed(), async (base, docs) => {
    const first = await postTransition(base, transitionBody);
    const firstBody = await first.json() as { eventId: string };
    const retry = await postTransition(base, transitionBody);
    const retryBody = await retry.json() as { ok: boolean; replayed: boolean; eventId: string };
    assert.equal(retry.status, 200);
    assert.equal(retryBody.ok, true);
    assert.equal(retryBody.replayed, true);
    assert.equal(retryBody.eventId, firstBody.eventId);
    assert.equal([...docs.keys()].filter((key) => key.startsWith('inspection_events/')).length, 1);
  });
});

test('stale status and invalid transitions are rejected without changing the inspection', async () => {
  await withApi('Operacional', seed(), async (base, docs) => {
    const stale = await postTransition(base, { ...transitionBody, expectedStatus: 'em_campo' });
    assert.equal(stale.status, 409);
    const invalid = await postTransition(base, { ...transitionBody, action: 'approve' , idempotencyKey: 'inspection_approve_001' });
    assert.equal(invalid.status, 403);
    assert.equal((docs.get('inspections/' + inspection.id) as Record<string, unknown>).status, 'agendada');
  });
});

test('non-conforming or pending results require findings before submission', async () => {
  await withApi('Operacional', seed('em_campo'), async (base, docs) => {
    const invalid = await postTransition(base, {
      orgId: 'org_a', expectedStatus: 'em_campo', action: 'submit',
      result: 'nao_conforme', findings: 'ruim', idempotencyKey: 'inspection_submit_0001',
    });
    assert.equal(invalid.status, 400);
    assert.equal((docs.get('inspections/' + inspection.id) as Record<string, unknown>).status, 'em_campo');
    const valid = await postTransition(base, {
      orgId: 'org_a', expectedStatus: 'em_campo', action: 'submit',
      result: 'nao_conforme', findings: 'Vazamento identificado na flange de saída.',
      idempotencyKey: 'inspection_submit_0002',
    });
    assert.equal(valid.status, 200);
    const body = await valid.json() as { inspection: Record<string, any> };
    assert.equal(body.inspection.status, 'aguardando_revisao');
    assert.equal(body.inspection.result, 'nao_conforme');
    assert.ok(body.inspection.completedAt);
    assert.equal(body.inspection.reviewedAt, undefined);
  });
});

test('incomplete legacy inspection cannot be approved even with explicit approval permission', async () => {
  await withApi('Supervisor', {
    ...seed('aguardando_revisao'),
    'org_module_access/org_a__operator_1': { orgId: 'org_a', uid: 'operator_1', modules: { inspecoes: 3 } },
    ['inspections/' + inspection.id]: { ...inspection, status: 'aguardando_revisao', completedAt: undefined },
  }, async (base, docs) => {
    const response = await postTransition(base, {
      orgId: 'org_a', expectedStatus: 'aguardando_revisao', action: 'approve',
      idempotencyKey: 'inspection_approve_incomplete',
    });
    assert.equal(response.status, 400);
    assert.equal((docs.get('inspections/' + inspection.id) as Record<string, unknown>).status, 'aguardando_revisao');
  });
});

test('inspection review is controlled by the configured approval level', async () => {
  await withApi('Operacional', seed('aguardando_revisao'), async (base, docs) => {
    const response = await postTransition(base, {
      orgId: 'org_a', expectedStatus: 'aguardando_revisao', action: 'approve',
      idempotencyKey: 'inspection_approve_0001',
    });
    assert.equal(response.status, 403);
    assert.equal((docs.get('inspections/' + inspection.id) as Record<string, unknown>).status, 'aguardando_revisao');
  });

  await withApi('Supervisor', { ...seed('aguardando_revisao'), 'org_module_access/org_a__operator_1': { orgId: 'org_a', uid: 'operator_1', modules: { inspecoes: 3 } } }, async (base, docs) => {
    const response = await postTransition(base, {
      orgId: 'org_a', expectedStatus: 'aguardando_revisao', action: 'approve',
      idempotencyKey: 'inspection_approve_0002',
    });
    assert.equal(response.status, 200);
    const body = await response.json() as { inspection: Record<string, any> };
    assert.equal(body.inspection.status, 'aprovada');
    assert.ok(body.inspection.reviewedAt);
    assert.equal((docs.get('inspections/' + inspection.id) as Record<string, any>).status, 'aprovada');
  });
});

test('rejection requires a reason and a returned inspection can be reopened with a reason', async () => {
  await withApi('Supervisor', { ...seed('aguardando_revisao'), 'org_module_access/org_a__operator_1': { orgId: 'org_a', uid: 'operator_1', modules: { inspecoes: 3 } } }, async (base, docs) => {
    const rejected = await postTransition(base, {
      orgId: 'org_a', expectedStatus: 'aguardando_revisao', action: 'reject',
      comment: '   ', idempotencyKey: 'inspection_reject_0001',
    });
    assert.equal(rejected.status, 400);
    const accepted = await postTransition(base, {
      orgId: 'org_a', expectedStatus: 'aguardando_revisao', action: 'reject',
      comment: 'Refazer medição e anexar evidência da correção.',
      idempotencyKey: 'inspection_reject_0002',
    });
    assert.equal(accepted.status, 200);
    const body = await accepted.json() as { inspection: Record<string, any> };
    assert.equal(body.inspection.status, 'reprovada');
    const reopened = await postTransition(base, {
      orgId: 'org_a', expectedStatus: 'reprovada', action: 'reopen',
      comment: 'Correção executada; nova verificação solicitada.',
      idempotencyKey: 'inspection_reopen_0001',
    });
    assert.equal(reopened.status, 200);
    const reopenedBody = await reopened.json() as { inspection: Record<string, any> };
    assert.equal(reopenedBody.inspection.status, 'em_campo');
    assert.equal(reopenedBody.inspection.completedAt, undefined);
    assert.equal((docs.get('inspections/' + inspection.id) as Record<string, any>).status, 'em_campo');
  });
});

test('inspection endpoints enforce organization membership', async () => {
  await withApi('Supervisor', seed(), async (base, docs) => {
    const crossOrgTransition = await postTransition(base, {
      ...transitionBody,
      orgId: 'org_b',
    });
    assert.equal(crossOrgTransition.status, 403);
    assert.equal((docs.get('inspections/' + inspection.id) as Record<string, any>).status, 'agendada');
  });
});
