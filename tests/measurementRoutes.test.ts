import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { createMeasurementRouter } from '../server/measurementRoutes';
import type { AdminHandles } from '../server/firebaseAdmin';

function createFakeAdmin(seed: Record<string, any>) {
  const docs = new Map<string, any>(Object.entries(seed));
  const db: any = {
    collection: (name: string) => ({
      doc: (id: string) => ({
        path: `${name}/${id}`, id,
        get: async () => {
          const data = docs.get(`${name}/${id}`);
          return { id, exists: data !== undefined, data: () => data };
        },
      }),
    }),
    runTransaction: async (fn: (tx: any) => Promise<any>) => {
      const creates: Array<{ path: string; data: any }> = [];
      const updates: Array<{ path: string; data: any }> = [];
      const tx = {
        get: async (ref: { path: string; id: string }) => {
          const data = docs.get(ref.path);
          return { id: ref.id, exists: data !== undefined, data: () => data };
        },
        create: (ref: { path: string }, data: any) => creates.push({ path: ref.path, data }),
        update: (ref: { path: string }, data: any) => updates.push({ path: ref.path, data }),
      };
      const result = await fn(tx);
      for (const c of creates) {
        if (docs.has(c.path)) throw Object.assign(new Error('already exists'), { code: 6 });
        docs.set(c.path, c.data);
      }
      for (const u of updates) {
        docs.set(u.path, { ...(docs.get(u.path) || {}), ...u.data });
      }
      return result;
    },
  };
  return { docs, handles: { db } as unknown as AdminHandles };
}

async function startApi(seed: Record<string, any>, userRef: { current: any }) {
  const mocked = createFakeAdmin(seed);
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = userRef.current;
    next();
  });
  app.use('/api/measurements', createMeasurementRouter(() => mocked.handles));
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  const port = (server.address() as AddressInfo).port;
  return {
    base: `http://127.0.0.1:${port}/api/measurements`,
    docs: mocked.docs,
    close: () =>
      new Promise<void>((r) => {
        server.closeAllConnections?.();
        server.close(() => r());
      }),
  };
}

test('full BM lifecycle: create -> submit -> approve atomically generates linked FinanceReceivable', async () => {
  const userRef = {
    current: { uid: 'op_1', email: 'eng@alfa.test', master: false, orgs: { org_a: 'Supervisor' } },
  };
  const srv = await startApi(
    {
      'units/unit_a': { id: 'unit_a', orgId: 'org_a', name: 'Planta A' },
      'contracts/ct_a': { id: 'ct_a', orgId: 'org_a', title: 'Contrato Montagem', partyName: 'Cliente Alfa' },
      'projects/prj_a': { id: 'prj_a', orgId: 'org_a', code: 'OBRA-01', name: 'Obra 01', contractId: 'ct_a', unitId: 'unit_a' },
    },
    userRef,
  );

  try {
    // Reject default_unit
    const badUnit = await fetch(`${srv.base}/bulletins`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orgId: 'org_a',
        unitId: 'default_unit',
        contractId: 'ct_a',
        title: 'BM 01',
        periodStart: '2026-11-01',
        periodEnd: '2026-11-30',
        dueDate: '2026-12-15',
        items: [{ description: 'Montagem', unit: 'UN', measuredQuantity: 1, unitPrice: 1000 }],
      }),
    });
    assert.equal(badUnit.status, 400);

    // 1. Create bulletin in rascunho
    const createRes = await fetch(`${srv.base}/bulletins`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orgId: 'org_a',
        unitId: 'unit_a',
        contractId: 'ct_a',
        projectId: 'prj_a',
        title: '1ª Medição Mensal',
        periodStart: '2026-11-01',
        periodEnd: '2026-11-30',
        dueDate: '2026-12-20',
        items: [
          { itemCode: 'LPU-1', description: 'Solda Inox 304', unit: 'M', measuredQuantity: 10, unitPrice: 500 },
        ],
      }),
    });
    assert.equal(createRes.status, 201);
    const { bulletin } = (await createRes.json()) as any;
    assert.equal(bulletin.status, 'rascunho');
    assert.equal(bulletin.code, 'BM-2026-001');
    assert.equal(bulletin.totalMeasuredAmount, 5000);

    // 2. Submit for approval
    const submitRes = await fetch(`${srv.base}/bulletins/${bulletin.id}/transition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId: 'org_a', targetStatus: 'enviado_aprovacao' }),
    });
    assert.equal(submitRes.status, 200);

    // 3. Supervisor cannot approve without an explicit level-3 grant
    const deniedApprove = await fetch(`${srv.base}/bulletins/${bulletin.id}/transition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId: 'org_a', targetStatus: 'aprovado' }),
    });
    assert.equal(deniedApprove.status, 403);

    // 4. Gerente with an explicit level-3 grant approves -> FinanceReceivable is created atomically
    userRef.current = { uid: 'ger_1', email: 'gerente@alfa.test', master: false, orgs: { org_a: 'Gerente' } };
    srv.docs.set('org_module_access/org_a__ger_1', { orgId: 'org_a', uid: 'ger_1', modules: { 'obras-medicoes': 3 }, explicitModules: ['obras-medicoes'] });
    const approveRes = await fetch(`${srv.base}/bulletins/${bulletin.id}/transition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId: 'org_a', targetStatus: 'aprovado' }),
    });
    assert.equal(approveRes.status, 200);
    const approveBody = (await approveRes.json()) as any;
    assert.equal(approveBody.receivableCreated, true);
    assert.ok(approveBody.receivableId);

    const receivable = srv.docs.get(`finance_receivables/${approveBody.receivableId}`);
    assert.ok(receivable);
    assert.equal(receivable.origem, 'medicao');
    assert.equal(receivable.measurementBulletinId, bulletin.id);
    assert.equal(receivable.projectId, 'prj_a');
    assert.equal(receivable.contractId, 'ct_a');
    assert.equal(receivable.valor, 5000);
    assert.equal(receivable.status, 'aberto');

    // 5. Terminal state cannot be re-transitioned
    const secondApprove = await fetch(`${srv.base}/bulletins/${bulletin.id}/transition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId: 'org_a', targetStatus: 'aprovado' }),
    });
    assert.equal(secondApprove.status, 409);
  } finally {
    await srv.close();
  }
});
