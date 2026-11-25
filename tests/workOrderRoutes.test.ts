import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { Server } from 'node:http';
import type { AdminHandles } from '../server/firebaseAdmin.ts';
import { createWorkOrderRouter } from '../server/workOrderRoutes.ts';

const order = {
  id: 'os_org_a_001',
  orgId: 'org_a',
  unitId: 'unit_a',
  title: 'Inspecionar bomba',
  status: 'aberto',
  createdAt: '2026-11-25T10:00:00.000Z',
  updatedAt: '2026-11-25T10:00:00.000Z',
};

const statuses = {
  'work_order_statuses/org_a_aberto': {
    id: 'aberto', orgId: 'org_a', name: 'Aberto', isInitial: true, isCompleted: false,
  },
  'work_order_statuses/org_a_em_execucao': {
    id: 'em_execucao', orgId: 'org_a', name: 'Em Execução', isCompleted: false,
  },
  'work_order_statuses/org_a_aguardando_pecas': {
    id: 'aguardando_pecas', orgId: 'org_a', name: 'Aguardando Peças', requiresNotes: true,
  },
  'work_order_statuses/org_a_concluido': {
    id: 'concluido', orgId: 'org_a', name: 'Concluído', isCompleted: true,
  },
};

function mockAdmin(seed: Record<string, unknown>) {
  const docs = new Map(Object.entries(seed));
  const runQuery = (col: string, field: string, value: unknown) => {
    const prefix = `${col}/`;
    const matched = [...docs.entries()]
      .filter(([path, data]) => path.startsWith(prefix) && (data as Record<string, unknown>)[field] === value)
      .map(([path, data]) => ({ id: path.slice(prefix.length), exists: true, data: () => data }));
    return { docs: matched, empty: matched.length === 0, size: matched.length };
  };
  const db: any = {
    collection: (name: string) => ({
      doc: (id: string) => {
        const path = name + '/' + id;
        return {
          path,
          id,
          get: async () => {
            const data = docs.get(path);
            return { id, exists: data !== undefined, data: () => data };
          },
        };
      },
      where: (field: string, _op: string, value: unknown) => ({
        kind: 'query',
        collection: name,
        field,
        value,
        get: async () => runQuery(name, field, value),
      }),
    }),
    runTransaction: async (fn: (tx: any) => Promise<unknown>) => {
      const creates: Array<{ path: string; data: unknown }> = [];
      const updates: Array<{ path: string; data: Record<string, unknown> }> = [];
      const tx = {
        get: async (ref: any) => {
          if (ref?.kind === 'query') return runQuery(ref.collection, ref.field, ref.value);
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

async function withApi(
  role: string,
  seed: Record<string, unknown>,
  action: (base: string, docs: Map<string, unknown>) => Promise<void>,
) {
  const mocked = mockAdmin(seed);
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
  app.use('/api/work-orders', createWorkOrderRouter(() => mocked.handles));
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

const requestBody = {
  orgId: 'org_a',
  expectedStatus: 'aberto',
  targetStatusId: 'em_execucao',
  notes: '',
  idempotencyKey: 'transition_0001',
};

async function post(base: string, body: unknown, orderId = order.id) {
  return fetch(base + '/api/work-orders/' + encodeURIComponent(orderId) + '/status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function postReservation(base: string, body: unknown, orderId = order.id) {
  return fetch(base + '/api/work-orders/' + encodeURIComponent(orderId) + '/reservation-approval', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function standardSeed() {
  return {
    ['work_orders/' + order.id]: { ...order },
    ...statuses,
  };
}

test('status change updates the OS and creates its immutable timeline event in one transaction', async () => {
  await withApi('Supervisor', standardSeed(), async (base, docs) => {
    const response = await post(base, requestBody);
    assert.equal(response.status, 200);
    const body = await response.json() as { ok: boolean; replayed: boolean; eventId: string; orderUpdates: Record<string, string> };
    assert.equal(body.ok, true);
    assert.equal(body.replayed, false);
    assert.equal(body.orderUpdates.status, 'em_execucao');
    assert.ok(body.orderUpdates.actualStartDate);

    const savedOrder = docs.get('work_orders/' + order.id) as Record<string, unknown>;
    assert.equal(savedOrder.status, 'em_execucao');
    assert.equal(savedOrder.actualStartDate, body.orderUpdates.actualStartDate);

    const event = docs.get('order_events/' + body.eventId) as Record<string, unknown>;
    assert.equal(event.orderId, order.id);
    assert.equal(event.orgId, 'org_a');
    assert.equal(event.userId, 'operator_1');
    assert.equal(event.previousStatus, 'aberto');
    assert.equal(event.newStatus, 'em_execucao');
    assert.equal(event.eventType, 'mudanca_status');
  });
});

test('repeating the same idempotency key replays the original result without duplicating the event', async () => {
  await withApi('Supervisor', standardSeed(), async (base, docs) => {
    const first = await post(base, requestBody);
    const firstBody = await first.json() as { eventId: string };
    const retry = await post(base, requestBody);
    const retryBody = await retry.json() as { ok: boolean; replayed: boolean; eventId: string };
    assert.equal(first.status, 200);
    assert.equal(retry.status, 200);
    assert.equal(retryBody.ok, true);
    assert.equal(retryBody.replayed, true);
    assert.equal(retryBody.eventId, firstBody.eventId);
    assert.equal([...docs.keys()].filter((key) => key.startsWith('order_events/')).length, 1);
  });
});

test('reusing an idempotency key with a different payload is rejected', async () => {
  await withApi('Supervisor', standardSeed(), async (base) => {
    assert.equal((await post(base, requestBody)).status, 200);
    const collision = await post(base, { ...requestBody, notes: 'Alteração diferente' });
    assert.equal(collision.status, 409);
  });
});

test('a stale expected status is rejected and creates no timeline event', async () => {
  await withApi('Supervisor', standardSeed(), async (base, docs) => {
    const response = await post(base, { ...requestBody, expectedStatus: 'aguardando_pecas' });
    assert.equal(response.status, 409);
    assert.equal((docs.get('work_orders/' + order.id) as Record<string, unknown>).status, 'aberto');
    assert.equal([...docs.keys()].some((key) => key.startsWith('order_events/')), false);
  });
});

test('a status configured to require notes cannot be entered without a reason', async () => {
  await withApi('Supervisor', standardSeed(), async (base, docs) => {
    const response = await post(base, {
      ...requestBody,
      targetStatusId: 'aguardando_pecas',
      idempotencyKey: 'transition_0002',
    });
    assert.equal(response.status, 400);
    assert.equal((docs.get('work_orders/' + order.id) as Record<string, unknown>).status, 'aberto');
  });
});

test('reopening a completed order requires a reason', async () => {
  const seed = {
    ...standardSeed(),
    ['work_orders/' + order.id]: { ...order, status: 'concluido' },
  };
  await withApi('Supervisor', seed, async (base, docs) => {
    const response = await post(base, {
      ...requestBody,
      expectedStatus: 'concluido',
      targetStatusId: 'em_execucao',
      idempotencyKey: 'transition_0003',
    });
    assert.equal(response.status, 400);
    assert.equal((docs.get('work_orders/' + order.id) as Record<string, unknown>).status, 'concluido');
  });
});

test('read-only Operations access cannot change a work order status', async () => {
  await withApi('Visualizador', standardSeed(), async (base, docs) => {
    const response = await post(base, requestBody);
    assert.equal(response.status, 403);
    assert.equal((docs.get('work_orders/' + order.id) as Record<string, unknown>).status, 'aberto');
  });
});

test('reservation approval updates the OS, history and release message atomically', async () => {
  const seed = {
    ...standardSeed(),
    ['work_orders/' + order.id]: {
      ...order,
      isBlockedByReservation: true,
      reservationApprovalStatus: 'pendente',
      plannedParts: [
        { id: 'part_1', sku: 'P-01', name: 'Válvula', status: 'aguardando_compra' },
        { id: 'part_2', sku: 'P-02', name: 'Junta', status: 'disponivel' },
      ],
    },
  };
  await withApi('Supervisor', seed, async (base, docs) => {
    const request = {
      orgId: 'org_a',
      expectedStatus: 'aberto',
      idempotencyKey: 'reservation_approve_0001',
    };
    const response = await postReservation(base, request);
    assert.equal(response.status, 200);
    const body = await response.json() as { ok: boolean; replayed: boolean; orderUpdates: Record<string, any>; eventId: string; messageId: string };
    assert.equal(body.ok, true);
    assert.equal(body.replayed, false);
    assert.equal(body.orderUpdates.status, 'em_execucao');
    assert.equal(body.orderUpdates.reservationApprovalStatus, 'aprovado');
    assert.equal(body.orderUpdates.isBlockedByReservation, false);
    assert.equal(body.orderUpdates.plannedParts[0].status, 'disponivel');

    const savedOrder = docs.get('work_orders/' + order.id) as Record<string, any>;
    assert.equal(savedOrder.status, 'em_execucao');
    assert.equal(savedOrder.reservationApprovalStatus, 'aprovado');
    const event = docs.get('order_events/' + body.eventId) as Record<string, any>;
    assert.equal(event.eventType, 'aprovacao');
    assert.equal(event.userId, 'operator_1');
    const message = docs.get('order_messages/' + body.messageId) as Record<string, any>;
    assert.equal(message.senderId, 'operator_1');
    assert.equal(message.messageType, 'liberacao');
    assert.equal([...docs.keys()].filter((key) => key.startsWith('order_events/')).length, 1);
    assert.equal([...docs.keys()].filter((key) => key.startsWith('order_messages/')).length, 1);

    const retry = await postReservation(base, request);
    const retryBody = await retry.json() as { replayed: boolean; eventId: string; messageId: string };
    assert.equal(retry.status, 200);
    assert.equal(retryBody.replayed, true);
    assert.equal(retryBody.eventId, body.eventId);
    assert.equal(retryBody.messageId, body.messageId);
    assert.equal([...docs.keys()].filter((key) => key.startsWith('order_events/')).length, 1);
    assert.equal([...docs.keys()].filter((key) => key.startsWith('order_messages/')).length, 1);
  });
});

test('only management roles may approve reservations and approval requires a pending reservation', async () => {
  const seed = {
    ...standardSeed(),
    ['work_orders/' + order.id]: { ...order, isBlockedByReservation: true },
  };
  await withApi('Operacional', seed, async (base, docs) => {
    const response = await postReservation(base, {
      orgId: 'org_a', expectedStatus: 'aberto', idempotencyKey: 'reservation_denied_0001',
    });
    assert.equal(response.status, 403);
    assert.equal((docs.get('work_orders/' + order.id) as Record<string, unknown>).status, 'aberto');
  });
  await withApi('Supervisor', standardSeed(), async (base, docs) => {
    const response = await postReservation(base, {
      orgId: 'org_a', expectedStatus: 'aberto', idempotencyKey: 'reservation_not_pending_001',
    });
    assert.equal(response.status, 409);
    assert.equal((docs.get('work_orders/' + order.id) as Record<string, unknown>).status, 'aberto');
  });
});

test('the endpoint rejects a work order that belongs to a different organization', async () => {
  await withApi('Supervisor', {
    ...standardSeed(),
    ['work_orders/' + order.id]: { ...order, orgId: 'org_b' },
  }, async (base, docs) => {
    const response = await post(base, requestBody);
    assert.equal(response.status, 404);
    assert.equal((docs.get('work_orders/' + order.id) as Record<string, unknown>).status, 'aberto');
  });
});

test('risk work order blocks em_execucao without approved PT and valid NR/EPI, and passes once compliant', async () => {
  const today = new Date().toISOString().slice(0, 10);
  const nextYear = `${Number(today.slice(0, 4)) + 1}-12-31`;
  const pastYear = `${Number(today.slice(0, 4)) - 1}-01-01`;

  const riskOrder = {
    ...order,
    requiresSafetyPermit: true,
    safetyPermitType: 'trabalho_em_altura',
    safetyPermitId: 'pt_001',
    assignedEmployeeIds: ['emp_1'],
  };

  // 1. Blocked when PT is not approved and NR-35 is missing
  await withApi('Supervisor', {
    ...standardSeed(),
    ['work_orders/' + order.id]: riskOrder,
    'safety_permits/pt_001': {
      id: 'pt_001',
      orgId: 'org_a',
      unitId: 'unit_a',
      contractId: 'ct_a',
      documentType: 'pt',
      permitCode: 'PT-001',
      permitType: 'trabalho_em_altura',
      validFrom: pastYear,
      validUntil: nextYear,
      teamMemberIds: ['emp_1'],
    },
    'safety_permit_states/pt_001': { id: 'pt_001', orgId: 'org_a', status: 'draft' },
    'rh_directory/emp_1': { id: 'emp_1', orgId: 'org_a', name: 'Carlos', active: true },
  }, async (base, docs) => {
    const checkRes = await fetch(base + '/api/work-orders/' + encodeURIComponent(order.id) + '/safety-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId: 'org_a' }),
    });
    assert.equal(checkRes.status, 200);
    const checkBody = await checkRes.json() as any;
    assert.equal(checkBody.allowed, false);
    assert.ok(checkBody.blockers.length >= 2);

    const blocked = await post(base, { ...requestBody, idempotencyKey: 'risk_blocked_0001' });
    assert.equal(blocked.status, 422);
    const blockedBody = await blocked.json() as any;
    assert.match(blockedBody.error, /bloqueada pelo SMS/i);
    assert.equal((docs.get('work_orders/' + order.id) as any).status, 'aberto');
    assert.equal([...docs.keys()].some((k) => k.startsWith('order_events/')), false);
  });

  // 2. Allowed when PT is approved, in validity window, and crew has current NR-35 + delivered EPI with valid CA
  await withApi('Supervisor', {
    ...standardSeed(),
    ['work_orders/' + order.id]: riskOrder,
    'safety_permits/pt_001': {
      id: 'pt_001',
      orgId: 'org_a',
      unitId: 'unit_a',
      contractId: 'ct_a',
      documentType: 'pt',
      permitCode: 'PT-001',
      permitType: 'trabalho_em_altura',
      validFrom: pastYear,
      validUntil: nextYear,
      teamMemberIds: ['emp_1'],
    },
    'safety_permit_states/pt_001': { id: 'pt_001', orgId: 'org_a', status: 'approved' },
    'rh_directory/emp_1': { id: 'emp_1', orgId: 'org_a', name: 'Carlos', active: true },
    'safety_ppe_catalog/ppe_1': {
      id: 'ppe_1',
      orgId: 'org_a',
      name: 'Cinto Paraquedista',
      category: 'Cinto paraquedista',
      caNumber: 'CA-9999',
      caExpiresAt: nextYear,
      requiredForPermitTypes: ['trabalho_em_altura'],
      active: true,
    },
    'safety_ppe_movements/mov_1': {
      id: 'mov_1',
      orgId: 'org_a',
      employeeId: 'emp_1',
      ppeId: 'ppe_1',
      eventType: 'entregue',
      movementDate: pastYear,
      createdAt: `${pastYear}T10:00:00.000Z`,
    },
    'safety_training_records/tr_1': {
      id: 'tr_1',
      orgId: 'org_a',
      employeeId: 'emp_1',
      trainingCode: 'NR-35',
      title: 'NR-35',
      issueDate: pastYear,
      expirationDate: nextYear,
    },
  }, async (base, docs) => {
    const allowed = await post(base, { ...requestBody, idempotencyKey: 'risk_allowed_0001' });
    assert.equal(allowed.status, 200);
    const body = await allowed.json() as any;
    assert.equal(body.safetyGateVerified.permitCode, 'PT-001');
    assert.equal(body.safetyGateVerified.checkedEmployeeCount, 1);
    const event = docs.get('order_events/' + body.eventId) as any;
    assert.equal(event.meta.safetyGateVerified.permitId, 'pt_001');
  });
});
