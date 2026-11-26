import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { Server } from 'node:http';
import { randomBytes } from 'node:crypto';
import { createTravelProviderRouter, memoryTravelProviderStore, loadMarTravelCredentials } from '../server/travelProviderRoutes.ts';

const KEY = randomBytes(32).toString('base64');

async function api(opts: { uid?: string; role?: string; orgs?: Record<string, string>; key?: string | undefined; store?: ReturnType<typeof memoryTravelProviderStore> } = {}) {
  const store = opts.store ?? memoryTravelProviderStore();
  const uid = opts.uid ?? 'u1';
  const role = opts.role ?? 'Admin';
  const moduleGrants = new Map<string, any>();
  if (role === 'Admin') moduleGrants.set(`org_a__${uid}`, {
    orgId: 'org_a', uid, modules: { 'viagens-configuracoes': 4 },
  });
  const getAdminHandles = () => ({
    db: { collection: () => ({ doc: (id: string) => ({ get: async () => {
      const data = moduleGrants.get(id);
      return { exists: data !== undefined, data: () => data };
    } }) }) },
  }) as any;
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { (req as any).user = { uid, master: false, orgs: opts.orgs ?? { org_a: role } }; next(); });
  app.use('/api/travel', createTravelProviderRouter({ store: () => store, secretKey: () => ('key' in opts ? opts.key : KEY), getAdminHandles }));
  const server: Server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const port = (server.address() as { port: number }).port;
  const call = async (method: string, path: string, body?: unknown) => {
    const res = await fetch(`http://127.0.0.1:${port}/api/travel${path}`, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };
  return { call, store, close: () => new Promise((r) => server.close(r)) };
}

test('configuração de viagens: buscas antigas começam desligadas', async () => {
  const a = await api();
  try {
    const r = await a.call('GET', '/settings?orgId=org_a');
    assert.equal(r.status, 200);
    assert.equal(r.body.legacySourcesEnabled, false);
  } finally { await a.close(); }
});

test('somente o nível Administrar em Configurações de Viagens pode religar fontes antigas', async () => {
  const store = memoryTravelProviderStore();
  const sup = await api({ role: 'Supervisor', store });
  try {
    assert.equal((await sup.call('PUT', '/settings', { orgId: 'org_a', legacySourcesEnabled: true })).status, 403);
  } finally { await sup.close(); }
  const adm = await api({ role: 'Admin', store });
  try {
    assert.equal((await adm.call('PUT', '/settings', { orgId: 'org_a', legacySourcesEnabled: true })).status, 200);
    assert.equal((await adm.call('GET', '/settings?orgId=org_a')).body.legacySourcesEnabled, true);
    assert.equal((await adm.call('PUT', '/settings', { orgId: 'org_a', legacySourcesEnabled: 'sim' })).status, 400);
  } finally { await adm.close(); }
});

test('quem não é da empresa não vê nem grava nada de viagens dela', async () => {
  const a = await api({ role: 'Admin', orgs: { org_b: 'Admin' } });
  try {
    assert.equal((await a.call('GET', '/settings?orgId=org_a')).status, 403);
    assert.equal((await a.call('PUT', '/martravel/account', { orgId: 'org_a', login: 'x', password: 'y' })).status, 403);
  } finally { await a.close(); }
});

test('conta Mar Travel: grava o login de cada um e nunca devolve a senha', async () => {
  const store = memoryTravelProviderStore();
  const a = await api({ uid: 'u1', store });
  try {
    assert.deepEqual((await a.call('GET', '/martravel/account?orgId=org_a')).body, { connected: false });
    const put = await a.call('PUT', '/martravel/account', { orgId: 'org_a', login: ' derek@exemplo.com ', password: 'S3nha!' });
    assert.equal(put.status, 200);
    const got = await a.call('GET', '/martravel/account?orgId=org_a');
    assert.equal(got.body.connected, true);
    assert.equal(got.body.login, 'derek@exemplo.com');
    assert.ok(!JSON.stringify(got.body).includes('S3nha!'));
    assert.ok(!JSON.stringify([...store.dump()]).includes('S3nha!'), 'senha não pode ficar em texto puro no banco');
    assert.deepEqual(await loadMarTravelCredentials(store, KEY, 'org_a', 'u1'), { login: 'derek@exemplo.com', password: 'S3nha!' });
  } finally { await a.close(); }
  const b = await api({ uid: 'u2', store });
  try {
    assert.deepEqual((await b.call('GET', '/martravel/account?orgId=org_a')).body, { connected: false }, 'cada colaborador vê só a própria conta');
  } finally { await b.close(); }
});

test('conta Mar Travel: campos obrigatórios, remover e cofre sem chave', async () => {
  const store = memoryTravelProviderStore();
  const a = await api({ store });
  try {
    assert.equal((await a.call('PUT', '/martravel/account', { orgId: 'org_a', login: 'x@y.com', password: '' })).status, 400);
    assert.equal((await a.call('PUT', '/martravel/account', { orgId: 'org_a', login: '', password: 'p' })).status, 400);
    await a.call('PUT', '/martravel/account', { orgId: 'org_a', login: 'x@y.com', password: 'p' });
    assert.equal((await a.call('DELETE', '/martravel/account?orgId=org_a')).status, 200);
    assert.deepEqual((await a.call('GET', '/martravel/account?orgId=org_a')).body, { connected: false });
  } finally { await a.close(); }
  const semChave = await api({ key: undefined });
  try {
    const r = await semChave.call('PUT', '/martravel/account', { orgId: 'org_a', login: 'x@y.com', password: 'p' });
    assert.equal(r.status, 503);
    assert.equal(r.body.error, 'cofre_indisponivel');
  } finally { await semChave.close(); }
});
