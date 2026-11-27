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
  const collection = (name: string) => {
    const buildQuery = (filters: Array<{ field: string; op: string; value: unknown }>) => ({
      query: true, name, filters,
      where: (field: string, op: string, value: unknown) => buildQuery([...filters, { field, op, value }]),
    });
    return {
      doc: (id?: string) => {
        const docId = id || 'generated_' + (++eventSequence);
        const path = name + '/' + docId;
        return {
          path, id: docId,
          get: async () => { const data = docs.get(path); return { id: docId, exists: data !== undefined, data: () => data }; },
        };
      },
      where: (field: string, op: string, value: unknown) => buildQuery([{ field, op, value }]),
    };
  };
  const db: any = {
    collection,
    runTransaction: async (fn: (tx: any) => Promise<unknown>) => {
      const creates: Array<{ path: string; data: Record<string, any> }> = [];
      const updates: Array<{ path: string; data: Record<string, any> }> = [];
      const tx = {
        get: async (ref: any) => {
          if (ref.query) {
            const rows = [...docs.entries()].filter(([path, data]) =>
              path.startsWith(ref.name + '/') && (ref.filters || []).every((filter: any) =>
                filter.op !== '==' || data[filter.field] === filter.value));
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

async function postCreate(base: string, permit: Record<string, unknown>) {
  return fetch(base + '/api/safety/permits', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orgId: 'org_a', permit }),
  });
}

const validPermitPayload = (overrides: Record<string, unknown> = {}) => ({
  unitId: 'unit_a',
  contractId: 'contract_a',
  documentType: 'apr',
  validFrom: '2026-11-25T07:00',
  validUntil: '2026-11-25T17:00',
  permitType: 'trabalho_a_quente',
  activityTitle: 'Soldagem TIG em tubulação inox',
  description: 'Execução de soldagem TIG em trecho isolado da linha de processo.',
  location: 'Planta industrial / Linha L-101',
  supervisorName: 'Encarregado de montagem',
  teamMembers: ['Soldador TIG', 'Ajudante'],
  risks: [{
    hazard: 'Projeção de fagulhas durante soldagem',
    consequence: 'Queimaduras ou princípio de incêndio',
    initialRisk: 'alto',
    controlMeasures: 'Isolar a área, remover combustíveis e manter extintor e vigia de fogo.',
    residualRisk: 'medio',
  }],
  controls: { teamBriefed: true, ppeInspected: true, areaIsolated: true, fireWatch: true },
  emergencyPlan: 'Interromper o serviço, acionar o responsável da planta e utilizar os recursos de combate disponíveis.',
  ...overrides,
});

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

test('APR creation validates server-side and atomically creates permit, initial event and state', async () => {
  const seed: Seed = {
    'units/unit_a': { id: 'unit_a', orgId: 'org_a', name: 'Unidade A' },
    'contracts/contract_a': { id: 'contract_a', orgId: 'org_a', name: 'Contrato A' },
  };
  await withApi('Operacional', seed, async (base, docs) => {
    const response = await postCreate(base, validPermitPayload());
    assert.equal(response.status, 201);
    const body = await response.json() as { permitId: string; permitCode: string };
    assert.ok(body.permitId);
    assert.match(body.permitCode, /^APR-2026-/);
    const permit = docs.get('safety_permits/' + body.permitId);
    assert.equal(permit?.createdByUid, 'supervisor_2');
    assert.equal(permit?.documentType, 'apr');
    assert.equal(docs.get('safety_permit_states/' + body.permitId)?.status, 'draft');
    assert.ok([...docs.values()].some((item) => item.permitId === body.permitId && item.eventType === 'created'));
  });
});

test('APR creation rejects missing activity controls and invalid risk reduction before writing', async () => {
  const seed: Seed = {
    'units/unit_a': { id: 'unit_a', orgId: 'org_a' },
    'contracts/contract_a': { id: 'contract_a', orgId: 'org_a' },
  };
  await withApi('Operacional', seed, async (base, docs) => {
    const response = await postCreate(base, validPermitPayload({
      controls: { teamBriefed: true, ppeInspected: true, areaIsolated: true, fireWatch: false },
      risks: [{ hazard: 'Queda de altura', consequence: 'Lesão grave',
        initialRisk: 'baixo', controlMeasures: 'Linha de vida e inspeção dos pontos de ancoragem.',
        residualRisk: 'critico' }],
    }));
    assert.equal(response.status, 400);
    assert.equal([...docs.keys()].filter((path) => path.startsWith('safety_permits/')).length, 0);
  });
});

test('PT creation requires an approved same-org APR and active RH identities', async () => {
  const seed: Seed = {
    'units/unit_a': { id: 'unit_a', orgId: 'org_a' },
    'contracts/contract_a': { id: 'contract_a', orgId: 'org_a' },
    'rh_directory/employee_01': { id: 'employee_01', orgId: 'org_a', name: 'Profissional de Altura', active: true },
    'safety_permits/apr_01': {
      id: 'apr_01', orgId: 'org_a', unitId: 'unit_a', contractId: 'contract_a',
      documentType: 'apr', permitType: 'trabalho_em_altura', validFrom: '2026-11-25T07:00',
      validUntil: '2026-11-25T17:00',
    },
    'safety_permit_states/apr_01': {
      id: 'apr_01', orgId: 'org_a', permitId: 'apr_01', status: 'approved',
    },
  };
  await withApi('Operacional', seed, async (base, docs) => {
    const response = await postCreate(base, validPermitPayload({
      documentType: 'pt', relatedAprId: 'apr_01', permitType: 'trabalho_em_altura',
      validFrom: '2026-11-25T08:00', validUntil: '2026-11-25T16:00',
      teamMembers: ['Profissional de Altura'], teamMemberIds: ['employee_01'],
      controls: { teamBriefed: true, ppeInspected: true, areaIsolated: true, fallProtection: true, anchorVerified: true },
    }));
    assert.equal(response.status, 201);
    const body = await response.json() as { permitId: string };
    const created = docs.get('safety_permits/' + body.permitId);
    assert.deepEqual(created?.teamMemberIds, ['employee_01']);
    assert.equal(created?.relatedAprId, 'apr_01');
  });
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
  seed['org_module_access/org_a__supervisor_2'] = { orgId: 'org_a', uid: 'supervisor_2', modules: { ordens: 3 }, explicitModules: ['ordens'] };
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
      createdByUid: 'operator_1', teamMembers: ['Profissional de Altura'],
      teamMemberIds: ['employee_01'], relatedAprId: 'apr_01',
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
      expirationDate: '2028-01-01',
    },
  };
}

test('PT approval is blocked by missing training even when an employee exists and PPE is issued', async () => {
  const seed = ptSeed();
  seed['org_module_access/org_a__supervisor_2'] = { orgId: 'org_a', uid: 'supervisor_2', modules: { ordens: 3 }, explicitModules: ['ordens'] };
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
  const seed = ptSeed();
  seed['org_module_access/org_a__supervisor_2'] = { orgId: 'org_a', uid: 'supervisor_2', modules: { ordens: 3 }, explicitModules: ['ordens'] };
  await withApi('Supervisor', seed, async (base, docs) => {
    const response = await post(base, 'pt_01', { eventType: 'approved', previousEventId: 'pt_submitted' });
    assert.equal(response.status, 200);
    assert.equal(docs.get('safety_permit_states/pt_01')?.status, 'approved');
    assert.ok([...docs.keys()].some((path) => path.startsWith('safety_permit_events/')));
  });
});

test('PPE movement API validates CA, prevents duplicate delivery and closes only the current issue', async () => {
  const seed: Seed = {
    'rh_directory/employee_01': { id: 'employee_01', orgId: 'org_a', name: 'Profissional SMS', active: true },
    'rh_directory/employee_dismissed': { id: 'employee_dismissed', orgId: 'org_a', name: 'Desligado', active: true, dismissalDate: '2026-10-31' },
    'safety_ppe_catalog/ppe_01': {
      id: 'ppe_01', orgId: 'org_a', name: 'Capacete', active: true,
      caNumber: 'CA-12345', caExpiresAt: '2027-11-25',
    },
  };
  await withApi('Supervisor', seed, async (base, docs) => {
    const delivered = await fetch(base + '/api/safety/ppe-movements', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId: 'org_a', employeeId: 'employee_01', ppeId: 'ppe_01', eventType: 'entregue', movementDate: '2026-11-25' }),
    });
    assert.equal(delivered.status, 201);
    const deliveryBody = await delivered.json() as { movementId: string };
    const duplicated = await fetch(base + '/api/safety/ppe-movements', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId: 'org_a', employeeId: 'employee_01', ppeId: 'ppe_01', eventType: 'entregue', movementDate: '2026-11-25' }),
    });
    assert.equal(duplicated.status, 409);

    const returned = await fetch(base + '/api/safety/ppe-movements', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId: 'org_a', employeeId: 'employee_01', ppeId: 'ppe_01', eventType: 'devolvido', movementDate: '2026-11-25', referenceMovementId: deliveryBody.movementId }),
    });
    assert.equal(returned.status, 201);
    const current = [...docs.entries()].filter(([path]) => path.startsWith('safety_ppe_movements/'));
    assert.equal(current.length, 2);
    assert.ok(current.some(([, item]) => item.eventType === 'devolvido' && item.referenceMovementId === deliveryBody.movementId));
  });
});

test('PPE delivery and replacement reject expired CA, foreign or stale movements', async () => {
  const seed: Seed = {
    'rh_directory/employee_01': { id: 'employee_01', orgId: 'org_a', name: 'Profissional SMS', active: true },
    'safety_ppe_catalog/ppe_expired': {
      id: 'ppe_expired', orgId: 'org_a', name: 'Capacete vencido', active: true,
      caNumber: 'CA-EXP', caExpiresAt: '2026-11-24',
    },
    'safety_ppe_catalog/ppe_new': {
      id: 'ppe_new', orgId: 'org_a', name: 'Capacete novo', active: true,
      caNumber: 'CA-NEW', caExpiresAt: '2027-11-25',
    },
  };
  await withApi('Supervisor', seed, async (base) => {
    const expired = await fetch(base + '/api/safety/ppe-movements', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId: 'org_a', employeeId: 'employee_01', ppeId: 'ppe_expired', eventType: 'entregue', movementDate: '2026-11-25' }),
    });
    assert.equal(expired.status, 409);
  });
});

test('PPE replacement writes the return and new delivery atomically after rechecking both histories', async () => {
  await withApi('Supervisor', {
    'rh_directory/employee_01': { id: 'employee_01', orgId: 'org_a', name: 'Profissional SMS', active: true },
    'safety_ppe_catalog/ppe_old': { id: 'ppe_old', orgId: 'org_a', name: 'Capacete antigo', active: false, caNumber: 'CA-OLD', caExpiresAt: '2027-11-25' },
    'safety_ppe_catalog/ppe_new': { id: 'ppe_new', orgId: 'org_a', name: 'Capacete novo', active: true, caNumber: 'CA-NEW', caExpiresAt: '2027-11-25' },
    'safety_ppe_movements/delivery_old': {
      id: 'delivery_old', orgId: 'org_a', employeeId: 'employee_01', employeeName: 'Profissional SMS',
      ppeId: 'ppe_old', ppeName: 'Capacete antigo', eventType: 'entregue', movementDate: '2026-10-01',
      createdAt: new Date('2026-10-01T08:00:00Z'),
    },
  }, async (base, docs) => {
    const response = await fetch(base + '/api/safety/ppe-movements/replace', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId: 'org_a', employeeId: 'employee_01', oldMovementId: 'delivery_old', newPpeId: 'ppe_new', movementDate: '2026-11-25', notes: 'Desgaste do equipamento.' }),
    });
    assert.equal(response.status, 201);
    const movements = [...docs.entries()].filter(([path]) => path.startsWith('safety_ppe_movements/')).map(([, value]) => value);
    assert.equal(movements.length, 3);
    assert.ok(movements.some((item) => item.eventType === 'devolvido' && item.referenceMovementId === 'delivery_old'));
    assert.ok(movements.some((item) => item.eventType === 'entregue' && item.ppeId === 'ppe_new'));
  });
});

test('official training records require a trusted role, active RH employee and allowed NR', async () => {
  const seed: Seed = {
    'rh_directory/employee_01': { id: 'employee_01', orgId: 'org_a', name: 'Profissional SMS', active: true },
    'safety_training_catalog/rigger_01': {
      id: 'rigger_01', orgId: 'org_a', code: 'RIGGER', title: 'Sinaleiro e Amarrador',
      active: true, requiredForPermitTypes: ['icamento'],
    },
  };
  await withApi('Operacional', seed, async (base, docs) => {
    const denied = await fetch(base + '/api/safety/training-records', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orgId: 'org_a', recordId: 'record_denied', employeeId: 'employee_01',
        trainingCode: 'NR-35', issueDate: '2026-01-01', expirationDate: '2027-01-01',
        certificateUrl: 'https://certificados.exemplo.com/arquivo.pdf',
      }),
    });
    assert.equal(denied.status, 403);
    assert.equal(docs.has('safety_training_records/record_denied'), false);
  });

  await withApi('Supervisor', seed, async (base, docs) => {
    const invalidCode = await fetch(base + '/api/safety/training-records', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orgId: 'org_a', recordId: 'record_fake', employeeId: 'employee_01',
        trainingCode: 'NR-99', issueDate: '2026-01-01', expirationDate: '2027-01-01',
        certificateUrl: 'https://certificados.exemplo.com/arquivo.pdf',
      }),
    });
    assert.equal(invalidCode.status, 409);
    assert.equal(docs.has('safety_training_records/record_fake'), false);
    const dismissed = await fetch(base + '/api/safety/training-records', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orgId: 'org_a', recordId: 'record_dismissed', employeeId: 'employee_dismissed',
        trainingCode: 'NR-35', issueDate: '2026-01-01', expirationDate: '2028-01-01',
        certificateUrl: 'https://certificados.exemplo.com/arquivo.pdf',
      }),
    });
    assert.equal(dismissed.status, 409);


    const invalidUrl = await fetch(base + '/api/safety/training-records', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orgId: 'org_a', recordId: 'record_bad_url', employeeId: 'employee_01',
        trainingCode: 'NR-35', issueDate: '2026-01-01', expirationDate: '2027-01-01',
        certificateUrl: 'javascript:alert(1)',
      }),
    });
    assert.equal(invalidUrl.status, 400);

    const saved = await fetch(base + '/api/safety/training-records', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orgId: 'org_a', recordId: 'record_nr35', employeeId: 'employee_01',
        trainingCode: 'nr-35', issueDate: '2026-01-01', expirationDate: '2028-01-01',
        certificateUrl: 'https://certificados.exemplo.com/arquivo.pdf',
        certificateNumber: 'CERT-2026-01', issuingEntity: 'Centro de Treinamento',
      }),
    });
    assert.equal(saved.status, 201);
    const record = docs.get('safety_training_records/record_nr35');
    assert.equal(record?.trainingCode, 'NR-35');
    assert.equal(record?.title, 'Trabalho em Altura');
    assert.equal(record?.employeeId, 'employee_01');

    const unknownEmployee = await fetch(base + '/api/safety/training-records', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orgId: 'org_a', recordId: 'record_foreign', employeeId: 'employee_org_b',
        trainingCode: 'NR-35', issueDate: '2026-01-01', expirationDate: '2028-01-01',
        certificateUrl: 'https://certificados.exemplo.com/arquivo.pdf',
      }),
    });
    assert.equal(unknownEmployee.status, 409);
  });
});

test('training certificate storage paths must match company, employee and record', async () => {
  const seed: Seed = {
    'rh_directory/employee_01': { id: 'employee_01', orgId: 'org_a', name: 'Profissional SMS', active: true },
  };
  await withApi('Supervisor', seed, async (base, docs) => {
    const response = await fetch(base + '/api/safety/training-records', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orgId: 'org_a', recordId: 'record_01', employeeId: 'employee_01',
        trainingCode: 'NR-33', issueDate: '2026-01-01', expirationDate: '2027-01-01',
        certificatePath: 'safety-certificates/org_b/employee_01/record_01_certificate.pdf',
      }),
    });
    assert.equal(response.status, 400);
    assert.equal(docs.has('safety_training_records/record_01'), false);
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
