import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { Server } from 'node:http';
import { createTravelProviderRouter, memoryTravelProviderStore } from '../server/travelProviderRoutes.ts';

const RAW = [
  { idSolicitacao: '1', status: 'CONCLUIDA', centroDeCusto: { codigo: '1040/24' }, aereos: { aereo: { valorTotal: '500' } } },
  { idSolicitacao: '2', status: 'CANCELADA' },
];

async function api(opts: { role?: string; orgs?: Record<string, string>; lemon?: any; orgLock?: string } = {}) {
  const store = memoryTravelProviderStore();
  store.units.set('org_a', [{ id: 'unit1', code: '1040/24', name: 'Yakult' }]);
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { (req as any).user = { uid: 'u1', master: false, orgs: opts.orgs ?? { org_a: opts.role ?? 'Admin' } }; next(); });
  const client = { async pesquisarSolicitacao(p: any) { return p.registroInicial === 0 && p.dataInicial.endsWith('-01') ? RAW : []; } };
  app.use('/api/travel', createTravelProviderRouter({
    store: () => store,
    secretKey: () => undefined,
    lemontech: () => ('lemon' in opts ? opts.lemon : { client, orgId: opts.orgLock }),
    sleep: async () => {},
  }));
  const server: Server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const port = (server.address() as { port: number }).port;
  const call = async (method: string, path: string, body?: unknown) => {
    const res = await fetch(`http://127.0.0.1:${port}/api/travel${path}`, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };
  return { call, store, close: () => new Promise((r) => server.close(r)) };
}

test('status mostra se a API está configurada', async () => {
  const off = await api({ lemon: null });
  try { assert.deepEqual((await off.call('GET', '/lemontech/status?orgId=org_a')).body, { configured: false }); } finally { await off.close(); }
  const on = await api();
  try {
    const r = await on.call('GET', '/lemontech/status?orgId=org_a');
    assert.equal(r.body.configured, true);
    assert.equal(r.body.lastSync, null);
  } finally { await on.close(); }
});

test('sincronizar grava todas as solicitações, ligadas à obra, e a lista devolve', async () => {
  const a = await api();
  try {
    const s = await a.call('POST', '/lemontech/sync', { orgId: 'org_a', desde: '2026-11-01', ate: '2026-11-26' });
    assert.equal(s.status, 200);
    assert.equal(s.body.total, 2);
    const l = await a.call('GET', '/lemontech/solicitacoes?orgId=org_a');
    assert.equal(l.body.items.length, 2);
    const um = l.body.items.find((i: any) => i.id === '1');
    assert.equal(um.unitId, 'unit1');
    assert.equal(um.valorTotal, 500);
    assert.equal(um.raw, undefined, 'a lista não manda o XML bruto para a tela');
    assert.ok((await a.call('GET', '/lemontech/status?orgId=org_a')).body.lastSync);
  } finally { await a.close(); }
});

test('só Admin ou Gerente sincronizam; quem é de fora não vê', async () => {
  const sup = await api({ role: 'Supervisor' });
  try { assert.equal((await sup.call('POST', '/lemontech/sync', { orgId: 'org_a' })).status, 403); } finally { await sup.close(); }
  const fora = await api({ orgs: { org_b: 'Admin' } });
  try { assert.equal((await fora.call('GET', '/lemontech/solicitacoes?orgId=org_a')).status, 403); } finally { await fora.close(); }
});

test('sem a API configurada, sincronizar responde 503', async () => {
  const a = await api({ lemon: null });
  try { assert.equal((await a.call('POST', '/lemontech/sync', { orgId: 'org_a' })).status, 503); } finally { await a.close(); }
});

test('com LEMONTECH_WS_ORG_ID, outra empresa do sistema não usa a conta da Aguero', async () => {
  const a = await api({ orgLock: 'org_x' });
  try {
    assert.deepEqual((await a.call('GET', '/lemontech/status?orgId=org_a')).body, { configured: false });
    assert.equal((await a.call('POST', '/lemontech/sync', { orgId: 'org_a' })).status, 503);
  } finally { await a.close(); }
});

test('datas inválidas na sincronização dão 400', async () => {
  const a = await api();
  try { assert.equal((await a.call('POST', '/lemontech/sync', { orgId: 'org_a', desde: 'ontem' })).status, 400); } finally { await a.close(); }
});
