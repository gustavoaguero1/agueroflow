import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { Server } from 'node:http';
import type { AdminHandles } from '../server/firebaseAdmin.ts';
import { createChecklistRouter } from '../server/checklistRoutes.ts';

const template = {
  id: 'tpl_org_a_001',
  orgId: 'org_a',
  title: 'Checklist de teste',
  description: 'Verificação de campo',
  category: 'Operações',
  version: 1,
  items: [
    { id: 'protecao', title: 'Proteção instalada', type: 'sim_nao', required: true },
    { id: 'pressao', title: 'Pressão medida', type: 'numerico', required: true },
  ],
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
  app.use('/api/checklists', createChecklistRouter(() => mocked.handles));
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

async function post(base: string, path: string, body: unknown, method = 'POST') {
  return fetch(base + '/api/checklists' + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const validAnswers = {
  protecao: { itemId: 'tampered', itemTitle: 'Título falso', type: 'texto', value: 'nao', conforme: true },
  pressao: { value: '0' },
};

test('template creation is server validated, versioned and audited atomically', async () => {
  await withApi('Operacional', {}, async (base, docs) => {
    const response = await post(base, '/templates', {
      orgId: 'org_a',
      title: 'Checklist de recebimento',
      description: 'Conferência técnica',
      category: 'Qualidade',
      items: [
        { id: 'visual', title: 'Inspeção visual', type: 'sim_nao', required: true },
        { id: 'medida', title: 'Diâmetro medido', type: 'numerico', required: true },
      ],
    });
    assert.equal(response.status, 201);
    const body = await response.json() as { ok: boolean; template: Record<string, any> };
    assert.equal(body.ok, true);
    assert.equal(body.template.version, 1);
    assert.equal(body.template.orgId, 'org_a');
    assert.ok(docs.has('checklist_templates/' + body.template.id));
    assert.ok(docs.has('checklist_template_events/checklist_template_evt_' + body.template.id + '_v1'));
  });
});

test('template creation rejects duplicate item ids and invalid choice lists', async () => {
  await withApi('Operacional', {}, async (base) => {
    const duplicate = await post(base, '/templates', {
      orgId: 'org_a', title: 'Checklist inválido', category: 'Operações', description: '',
      items: [
        { id: 'same', title: 'Item 1', type: 'sim_nao', required: true },
        { id: 'same', title: 'Item 2', type: 'sim_nao', required: false },
      ],
    });
    assert.equal(duplicate.status, 400);
    const choices = await post(base, '/templates', {
      orgId: 'org_a', title: 'Checklist inválido', category: 'Operações', description: '',
      items: [
        { id: 'choice', title: 'Escolha o material', type: 'multipla_escolha', required: true, options: ['inox'] },
      ],
    });
    assert.equal(choices.status, 400);
  });
});

test('updating a template creates a new version and keeps the stable template id', async () => {
  await withApi('Operacional', { ['checklist_templates/' + template.id]: template }, async (base, docs) => {
    const response = await post(base, '/templates/' + template.id, {
      orgId: 'org_a',
      title: 'Checklist revisado',
      description: 'Revisão de critérios',
      category: 'Operações',
      items: [
        ...template.items,
        { id: 'identificacao', title: 'Identificação do equipamento', type: 'texto', required: true },
      ],
    }, 'PUT');
    assert.equal(response.status, 200);
    const body = await response.json() as { template: Record<string, any> };
    assert.equal(body.template.id, template.id);
    assert.equal(body.template.version, 2);
    const saved = docs.get('checklist_templates/' + template.id) as Record<string, any>;
    assert.equal(saved.version, 2);
    assert.equal(saved.items.length, 3);
    assert.ok(docs.has('checklist_template_events/checklist_template_evt_' + template.id + '_v2'));
  });
});

test('completion uses the current template version, validates answers, and stores a frozen snapshot', async () => {
  await withApi('Operacional', { ['checklist_templates/' + template.id]: template }, async (base, docs) => {
    const response = await post(base, '/templates/' + template.id + '/runs', {
      orgId: 'org_a',
      answers: validAnswers,
      idempotencyKey: 'checklist_complete_0001',
    });
    assert.equal(response.status, 201);
    const body = await response.json() as { ok: boolean; replayed: boolean; run: Record<string, any> };
    assert.equal(body.ok, true);
    assert.equal(body.replayed, false);
    assert.equal(body.run.status, 'concluido');
    assert.equal(body.run.progressPercent, 100);
    assert.equal(body.run.nonConformityCount, 1);
    assert.equal(body.run.templateVersion, 1);
    assert.equal(body.run.templateSnapshot.items[0].title, 'Proteção instalada');
    assert.equal(body.run.answers.protecao.itemTitle, 'Proteção instalada');
    assert.equal(body.run.answers.protecao.type, 'sim_nao');
    assert.equal(body.run.answers.protecao.conforme, false);
    assert.equal(body.run.answers.pressao.value, 0);
    assert.equal((docs.get('checklist_runs/' + body.run.id) as Record<string, any>).status, 'concluido');
    assert.equal([...docs.keys()].filter((key) => key.startsWith('checklist_run_events/')).length, 1);
  });
});

test('idempotent completion does not duplicate a checklist run or event', async () => {
  await withApi('Operacional', { ['checklist_templates/' + template.id]: template }, async (base, docs) => {
    const request = {
      orgId: 'org_a', answers: validAnswers, idempotencyKey: 'checklist_repeat_0001',
    };
    const first = await post(base, '/templates/' + template.id + '/runs', request);
    const firstBody = await first.json() as { run: Record<string, any> };
    const retry = await post(base, '/templates/' + template.id + '/runs', request);
    const retryBody = await retry.json() as { replayed: boolean; run: Record<string, any> };
    assert.equal(first.status, 201);
    assert.equal(retry.status, 200);
    assert.equal(retryBody.replayed, true);
    assert.equal(retryBody.run.id, firstBody.run.id);
    assert.equal([...docs.keys()].filter((key) => key.startsWith('checklist_runs/')).length, 1);
    assert.equal([...docs.keys()].filter((key) => key.startsWith('checklist_run_events/')).length, 1);
  });
});

test('server completion rejects missing, malformed and foreign answers', async () => {
  await withApi('Operacional', { ['checklist_templates/' + template.id]: template }, async (base) => {
    const missing = await post(base, '/templates/' + template.id + '/runs', {
      orgId: 'org_a', answers: { protecao: { value: 'sim' } }, idempotencyKey: 'checklist_missing_0001',
    });
    assert.equal(missing.status, 400);
    const malformedNumber = await post(base, '/templates/' + template.id + '/runs', {
      orgId: 'org_a',
      answers: { protecao: { value: 'sim' }, pressao: { value: 'abc' } },
      idempotencyKey: 'checklist_number_0001',
    });
    assert.equal(malformedNumber.status, 400);
    const foreignAnswer = await post(base, '/templates/' + template.id + '/runs', {
      orgId: 'org_a',
      answers: { ...validAnswers, foreign: { value: 'x' } },
      idempotencyKey: 'checklist_foreign_0001',
    });
    assert.equal(foreignAnswer.status, 400);
  });
});

test('template and execution endpoints enforce the requested company and area', async () => {
  await withApi('Operacional', {
    ['checklist_templates/' + template.id]: { ...template, orgId: 'org_b' },
  }, async (base) => {
    const response = await post(base, '/templates/' + template.id + '/runs', {
      orgId: 'org_a', answers: validAnswers, idempotencyKey: 'checklist_cross_org_001',
    });
    assert.equal(response.status, 404);
  });
  await withApi('Visualizador', {}, async (base) => {
    const response = await post(base, '/templates', {
      orgId: 'org_a', title: 'Checklist', category: 'Operações', description: '',
      items: [{ id: 'a', title: 'Item', type: 'sim_nao', required: true }],
    });
    assert.equal(response.status, 403);
  });
});
