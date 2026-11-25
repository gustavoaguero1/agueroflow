import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { Server } from 'node:http';
import type { AdminHandles } from '../server/firebaseAdmin.ts';
import { createSafetyRouter } from '../server/safetyRoutes.ts';

type Seed = Record<string, Record<string, any>>;

function mockAdmin(seed: Seed) {
  const docs = new Map<string, Record<string, any>>(Object.entries(seed));
  let eventSequence = 0;
  const collection = (name: string) => ({
    doc: (id?: string) => ({ path: name + '/' + (id || 'generated_' + (++eventSequence)), id: id || 'generated_' + eventSequence }),
    where: (field: string, op: string, value: unknown) => ({ query: true, name, field, op, value }),
  });
  const db: any = {
    collection,
    runTransaction: async (fn: (tx: any) => Promise<unknown>) => {
      const creates: Array<{ path: string; data: Record<string, any> }> = [];
      const updates: Array<{ path: string; data: Record<string, any> }> = [];
      const tx = {
        get: async (ref: any) => {
          if (ref.query) {
            const rows = [...docs.entries()].filter(([path, data]) =>
              path.startsWith(ref.name + '/') && (ref.op !== '==' || data[ref.field] === ref.value));
            return { docs: rows.map(([path, data]) => ({ id: path.split('/').pop(), data: () => data })) };
          }
          const data = docs.get(ref.path);
          return { id: ref.id, exists: data !== undefined, data: () => data };
        },
        create: (ref: { path: string }, data: Record<string, any>) => creates.push({ path: ref.path, data }),
        update: (ref: { path: string }, data: Record<string, any>) => updates.push({ path: ref.path, data }),
      };
      const result = await fn(tx);
      for (const item of creates) {
        if (docs.has(item.path)) throw Object.assign(new Error('already exists'), { code: 6 });
      }
      for (const item of updates) {
        if (!docs.has(item.path)) throw new Error('missing document for transaction update');
      }
      for (const item of creates) docs.set(item.path, item.data);
      for (const item of updates) docs.set(item.path, { ...(docs.get(item.path) || {}), ...item.data });
      return result;
    },
  };
  return { handles: { db } as unknown as AdminHandles, docs };
}

async function withApi(
  role: string,
  seed: Seed,
  action: (base: string, docs: Map<string, Record<string, any>>) => Promise<void>,
) {
  const mocked = mockAdmin(seed);
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { uid: 'supervisor_2', email: 'supervisor@empresa.com', master: false, orgs: { org_a: role } };
    next();
  });
  app.use('/api/safety', createSafetyRouter(() => mocked.handles));
  const server: Server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Safety test API did not bind a TCP port');
  try { await action('http://127.0.0.1:' + address.port, mocked.docs); }
  finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}

async function post(base: string, permitId: string, body: Record<string, unknown>) {
  return fetch(base + '/api/safety/permits/' + encodeURIComponent(permitId) + '/transition', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orgId: 'org_a', ...body }),
  });
}

const aprPermit = {
  id: 'apr_01', orgId: 'org_a', unitId: 'unit_a', contractId: 'contract_a',
  documentType: 'apr', permitType: 'trabalho_a_quente', permitCode: 'APR-2026-12345678',
  validFrom: '2026-11-25T07:00', validUntil: '2027-11-25T17:00', createdByUid: 'operator_1',
};
const aprState = {
  id: 'apr_01', orgId: 'org_a', unitId: 'unit_a', contractId: 'contract_a',
  permitId: 'apr_01', status: 'draft', latestEventId: 'apr_created',
};
const baseSeed = (): Seed => ({
  'safety_permits/apr_01': aprPermit,
  'safety_permit_states/apr_01': aprState,
});

test('operational editor submits an APR, but cannot use manager-only transitions', async () => {
  await withApi('Operacional', baseSeed(), async (base, docs) => {
    const submitted = await post(base, 'apr_01', { eventType: 'submitted_for_approval', previousEventId: 'apr_created' });
    assert.equal(submitted.status, 200);
    const result = docs.get('safety_permit_states/apr_01');
    assert.equal(result?.status, 'awaiting_approval');
    assert.notEqual(result?.latestEventId, 'apr_created');

    const denied = await post(base, 'apr_01', { eventType: 'approved', previousEventId: result?.latestEventId });
    assert.equal(denied.status, 403);
  });
});

test('manager cannot approve a permit they created', async () => {
  const seed = baseSeed();
  seed['safety_permits/apr_01'] = { ...aprPermit, createdByUid: 'supervisor_2' };
  seed['safety_permit_states/apr_01'] = { ...aprState, status: 'awaiting_approval', latestEventId: 'submitted' };
  await withApi('Supervisor', seed, async (base, docs) => {
    const response = await post(base, 'apr_01', { eventType: 'approved', previousEventId: 'submitted' });
    assert.equal(response.status, 403);
    assert.equal(docs.get('safety_permit_states/apr_01')?.status, 'awaiting_approval');
  });
});

function ptSeed(): Seed {
  return {
    ...baseSeed(),
    'safety_permits/pt_01': {
      id: 'pt_01', orgId: 'org_a', unitId: 'unit_a', contractId: 'contract_a',
      documentType: 'pt', permitType: 'trabalho_em_altura', permitCode: 'PT-2026-12345678',
      validFrom: '2026-11-25T07:00', validUntil: '2027-11-25T17:00',
      createdByUid: 'operator_1', teamMemberIds: ['employee_01'], relatedAprId: 'apr_01',
    },
    'safety_permit_states/pt_01': {
      id: 'pt_01', orgId: 'org_a', unitId: 'unit_a', contractId: 'contract_a',
      permitId: 'pt_01', status: 'awaiting_approval', latestEventId: 'pt_submitted',
    },
    'safety_permit_states/apr_01': {
      id: 'apr_01', orgId: 'org_a', unitId: 'unit_a', contractId: 'contract_a',
      permitId: 'apr_01', status: 'approved', latestEventId: 'apr_approved',
    },
    'rh_directory/employee_01': {
      id: 'employee_01', orgId: 'org_a', name: 'Profissional de Altura', role: 'Montador', active: true,
    },
    'safety_ppe_catalog/ppe_01': {
      id: 'ppe_01', orgId: 'org_a', name: 'Cinto paraquedista', caNumber: 'CA-12345',
      caExpiresAt: '2027-11-25', requiredForPermitTypes: ['trabalho_em_altura'], active: true,
    },
    'safety_ppe_movements/delivery_01': {
      id: 'delivery_01', orgId: 'org_a', employeeId: 'employee_01', employeeName: 'Profissional de Altura',
      ppeId: 'ppe_01', ppeName: 'Cinto paraquedista', eventType: 'entregue',
      movementDate: '2026-11-25', createdAt: new Date('2026-11-25T08:00:00Z'),
    },
    'safety_training_records/nr35_01': {
      id: 'nr35_01', orgId: 'org_a', employeeId: 'employee_01', employeeName: 'Profissional de Altura',
      trainingCode: 'NR-35', title: 'Trabalho em Altura', issueDate: '2026-01-01',
      expirationDate: '2027-01-01',
    },
  };
}

test('PT approval is blocked by missing training even when an employee exists and PPE is issued', async () => {
  const seed = ptSeed();
  delete seed['safety_training_records/nr35_01'];
  await withApi('Supervisor', seed, async (base, docs) => {
    const response = await post(base, 'pt_01', { eventType: 'approved', previousEventId: 'pt_submitted' });
    assert.equal(response.status, 409);
    const body = await response.json() as { error: string };
    assert.match(body.error, /NR-35/);
    assert.equal(docs.get('safety_permit_states/pt_01')?.status, 'awaiting_approval');
  });
});

test('PT approval passes only when RH, required NR, PPE delivery, CA and linked APR are valid', async () => {
  await withApi('Supervisor', ptSeed(), async (base, docs) => {
    const response = await post(base, 'pt_01', { eventType: 'approved', previousEventId: 'pt_submitted' });
    assert.equal(response.status, 200);
    assert.equal(docs.get('safety_permit_states/pt_01')?.status, 'approved');
    assert.ok([...docs.keys()].some((path) => path.startsWith('safety_permit_events/')));
  });
});

test('backend rejects stale state pointers and non-member organization requests', async () => {
  await withApi('Supervisor', baseSeed(), async (base, docs) => {
    const stale = await post(base, 'apr_01', { eventType: 'submitted_for_approval', previousEventId: 'stale' });
    assert.equal(stale.status, 409);
    assert.equal(docs.get('safety_permit_states/apr_01')?.status, 'draft');
    const foreign = await fetch(base + '/api/safety/permits/apr_01/transition', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId: 'org_b', eventType: 'submitted_for_approval', previousEventId: 'apr_created' }),
    });
    assert.equal(foreign.status, 403);
  });
});
