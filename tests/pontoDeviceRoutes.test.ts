import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { Server } from 'node:http';
import { webcrypto } from 'node:crypto';
import { createPontoRouter } from '../server/pontoRoutes.ts';
import { memoryPontoStore } from '../server/ponto/store.ts';
import { criarPareamento } from '../server/ponto/devices.ts';
import { isPublicPath } from '../server/authMiddleware.ts';

const subtle = webcrypto.subtle;
const NOW = new Date('2026-11-25T10:00:05Z');

async function setup() {
  const store = memoryPontoStore();
  await store.saveEstab({ id: 'e1', orgId: 'org', cnpj: '11222333000181', razaoSocial: 'AGUERO' });
  for (const [rhId, nome] of [['r1', 'Ana'], ['r2', 'Bia']]) {
    await store.savePessoa({ orgId: 'org', rhId, nome, cpf: '52998224725', estabelecimentoId: 'e1', vinculo: 'CLT' });
  }
  store.rh.set('org', [{ id: 'r1', name: 'Ana', unitId: 'u1', active: true }, { id: 'r2', name: 'Bia', unitId: 'u2', active: true }]);
  store.obras.set('org', [{ id: 'u1', nome: 'Obra 1', geo: { lat: -23.5505, lng: -46.6333 } }]);
  const dias: string[] = [];
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use('/api/ponto', createPontoRouter({ store: () => store, now: () => NOW, afterRegistro: async (_o, d) => { dias.push(d); } }));
  const server: Server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const port = (server.address() as { port: number }).port;
  const call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
    const res = await fetch(`http://127.0.0.1:${port}/api/ponto${path}`, { method, headers: { 'content-type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };
  return { store, call, dias, close: () => new Promise((r) => server.close(r)) };
}

async function device(a: Awaited<ReturnType<typeof setup>>, p: { modo: 'pessoal' | 'totem'; rhId?: string; unitId?: string }) {
  const kp = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = await subtle.exportKey('jwk', kp.publicKey);
  const pr = await criarPareamento(a.store, { orgId: 'org', criadoPor: 'u', ...p }, () => NOW);
  const r = await a.call('POST', '/device/pair', { code: pr.code, publicKeyJwk: jwk, nome: 'Moto' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const sign = async (s: string) => Buffer.from(await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, kp.privateKey, new TextEncoder().encode(s))).toString('base64');
  return { id: r.body.deviceId as string, pair: r.body, sign };
}

const payload = (o: Record<string, unknown> = {}) => JSON.stringify({
  clientId: 'c1', rhId: 'r1', tipo: 'entrada', dataHora: '2026-11-25T07:00:00-03:00', offline: false,
  gps: { lat: -23.5506, lng: -46.6334 }, face: { score: 0.9, modelo: 'm' }, relogio: null, ...o,
});

test('hora oficial do servidor', async () => {
  const a = await setup();
  try { assert.equal((await a.call('GET', '/device/time')).body.agora, '2026-11-25T07:00:05-03:00'); } finally { await a.close(); }
});

test('parear e registrar uma marcação online devolve comprovante', async () => {
  const a = await setup();
  try {
    const d = await device(a, { modo: 'pessoal', rhId: 'r1' });
    assert.equal(d.pair.pessoa.nome, 'Ana');
    assert.equal(d.pair.config.marcacoesPorDia, 4);
    const p = payload();
    const r = await a.call('POST', '/device/marcacoes', { items: [{ payload: p, signature: await d.sign(p) }] }, { 'x-ponto-device': d.id });
    assert.equal(r.status, 200);
    assert.equal(r.body.results[0].ok, true);
    assert.equal(r.body.results[0].comprovante.nsr, 1);
    assert.deepEqual(a.dias, ['2026-11-25']);
  } finally { await a.close(); }
});

test('lote offline com 3 itens, um com assinatura errada: 2 ok, 1 erro, status 200; reenvio devolve os mesmos NSRs', async () => {
  const a = await setup();
  try {
    const d = await device(a, { modo: 'pessoal', rhId: 'r1' });
    const p1 = payload({ clientId: 'a', offline: true });
    const p2 = payload({ clientId: 'b', tipo: 'saida_almoco', offline: true });
    const p3 = payload({ clientId: 'c', tipo: 'volta_almoco' });
    const items = [{ payload: p1, signature: await d.sign(p1) }, { payload: p2, signature: await d.sign(p2) }, { payload: p3, signature: await d.sign(p1) }];
    const r = await a.call('POST', '/device/marcacoes', { items }, { 'x-ponto-device': d.id });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.results.map((x: any) => x.ok), [true, true, false]);
    assert.equal(r.body.results[2].clientId, 'c');
    const again = await a.call('POST', '/device/marcacoes', { items: items.slice(0, 2) }, { 'x-ponto-device': d.id });
    assert.deepEqual(again.body.results.map((x: any) => x.comprovante.nsr), r.body.results.slice(0, 2).map((x: any) => x.comprovante.nsr));
  } finally { await a.close(); }
});

test('aparelho revogado ou desconhecido → 401', async () => {
  const a = await setup();
  try {
    const d = await device(a, { modo: 'pessoal', rhId: 'r1' });
    const p = payload();
    const body = { items: [{ payload: p, signature: await d.sign(p) }] };
    assert.equal((await a.call('POST', '/device/marcacoes', body, { 'x-ponto-device': 'dev_x' })).status, 401);
    assert.equal((await a.call('POST', '/device/marcacoes', body)).status, 401);
    await a.store.revokeDevice(d.id, 'agora');
    assert.equal((await a.call('POST', '/device/marcacoes', body, { 'x-ponto-device': d.id })).status, 401);
  } finally { await a.close(); }
});

test('celular pessoal não marca para outra pessoa; totem marca para qualquer um com cadastro de ponto', async () => {
  const a = await setup();
  try {
    const d = await device(a, { modo: 'pessoal', rhId: 'r1' });
    const p = payload({ rhId: 'r2' });
    const r = await a.call('POST', '/device/marcacoes', { items: [{ payload: p, signature: await d.sign(p) }] }, { 'x-ponto-device': d.id });
    assert.equal(r.body.results[0].ok, false);
    const t = await device(a, { modo: 'totem', unitId: 'u1' });
    const q = payload({ rhId: 'r2', clientId: 'z' });
    const rt = await a.call('POST', '/device/marcacoes', { items: [{ payload: q, signature: await t.sign(q) }] }, { 'x-ponto-device': t.id });
    assert.equal(rt.body.results[0].ok, true);
  } finally { await a.close(); }
});

test('me: celular traz pessoa e marcações do dia; totem traz quem é da obra primeiro', async () => {
  const a = await setup();
  try {
    const d = await device(a, { modo: 'pessoal', rhId: 'r1' });
    const minuto = String(Math.floor(NOW.getTime() / 60000));
    const sig = await d.sign(`GET /device/me|${minuto}`);
    const me = await a.call('GET', '/device/me', undefined, { 'x-ponto-device': d.id, 'x-ponto-sig': sig });
    assert.equal(me.status, 200);
    assert.equal(me.body.pessoa.nome, 'Ana');
    assert.deepEqual(me.body.ultimasDoDia, []);
    assert.equal((await a.call('GET', '/device/me', undefined, { 'x-ponto-device': d.id, 'x-ponto-sig': await d.sign('GET /device/me|1') })).status, 401);
    const t = await device(a, { modo: 'totem', unitId: 'u1' });
    const mt = await a.call('GET', '/device/me', undefined, { 'x-ponto-device': t.id, 'x-ponto-sig': await t.sign(`GET /device/me|${minuto}`) });
    assert.deepEqual(mt.body.pessoas.map((p: any) => [p.rhId, p.daObra]), [['r1', true], ['r2', false]]);
  } finally { await a.close(); }
});

test('mais de 200 itens → 400; código de pareamento errado → 400', async () => {
  const a = await setup();
  try {
    const d = await device(a, { modo: 'pessoal', rhId: 'r1' });
    const items = Array.from({ length: 201 }, () => ({ payload: '{}', signature: '' }));
    assert.equal((await a.call('POST', '/device/marcacoes', { items }, { 'x-ponto-device': d.id })).status, 400);
    assert.equal((await a.call('POST', '/device/pair', { code: 'XXXX', publicKeyJwk: {}, nome: 'x' })).status, 400);
  } finally { await a.close(); }
});

test('a rota do aparelho não exige login (está em PUBLIC_API_PATTERNS)', () => {
  assert.ok(isPublicPath('/api/ponto/device/marcacoes'));
  assert.ok(!isPublicPath('/api/ponto/espelho'));
});
