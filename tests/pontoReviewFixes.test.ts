import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { scryptSync } from 'node:crypto';
import express from 'express';
import type { Server } from 'node:http';
import { webcrypto } from 'node:crypto';
import { memoryPontoStore } from '../server/ponto/store.ts';
import { registrarMarcacao, PontoErro, type MarcacaoInput } from '../server/ponto/registrar.ts';
import { recalcularPontoDia } from '../server/ponto/diarioSync.ts';
import { horasDoDia } from '../src/ponto/jornada.ts';
import { resolveConfig } from '../src/ponto/config.ts';
import { createPontoRouter } from '../server/pontoRoutes.ts';
import { criarPareamento } from '../server/ponto/devices.ts';

const NOW = new Date('2026-11-25T10:00:05Z'); // 07:00:05 BRT
const now = () => NOW;

async function base() {
  const store = memoryPontoStore();
  await store.saveEstab({ id: 'e1', orgId: 'org', cnpj: '11222333000181', razaoSocial: 'A' });
  const pin = `scrypt$c2FsdA==$${scryptSync('4321', 'c2FsdA==', 32).toString('base64')}`;
  await store.savePessoa({ orgId: 'org', rhId: 'r1', nome: 'Ana', cpf: '52998224725', estabelecimentoId: 'e1', vinculo: 'CLT', pinHash: pin });
  await store.savePessoa({ orgId: 'org', rhId: 'r2', nome: 'Bia', cpf: '15350946056', estabelecimentoId: 'e1', vinculo: 'CLT' });
  store.obras.set('org', [{ id: 'u1', nome: 'Obra', geo: { lat: -23.5505, lng: -46.6333 } }]);
  return store;
}
const inp = (o: Partial<MarcacaoInput> = {}): MarcacaoInput => ({
  clientId: 'c1', deviceId: 'd1', rhId: 'r1', tipo: 'entrada', dataHora: '2026-11-25T07:00:00-03:00', offline: false,
  gps: { lat: -23.5505, lng: -46.6333 }, face: { score: 0.9, modelo: 'm' }, relogio: null, ...o,
});

test('I1: mesmo clientId em aparelhos diferentes são marcações diferentes; no mesmo aparelho com outra pessoa → 409', async () => {
  const s = await base();
  const a = await registrarMarcacao(s, 'org', inp(), now);
  const b = await registrarMarcacao(s, 'org', inp({ deviceId: 'd2', rhId: 'r2' }), now);
  assert.equal(b.duplicada, false);
  assert.notEqual(b.registro.nsr, a.registro.nsr);
  assert.equal(b.comprovante.pessoa.nome, 'Bia');
  await assert.rejects(registrarMarcacao(s, 'org', inp({ rhId: 'r2' }), now), (e: any) => e instanceof PontoErro && e.status === 409);
});

test('I2: horário do aparelho longe da hora do servidor gera alerta de relógio (online, futuro, offline sem relógio)', async () => {
  const s = await base();
  const atrasada = await registrarMarcacao(s, 'org', inp({ clientId: 'x1', dataHora: '2026-11-25T05:00:00-03:00' }), now);
  assert.ok(atrasada.registro.alertas.includes('relogio'));
  const futuro = await registrarMarcacao(s, 'org', inp({ clientId: 'x2', dataHora: '2026-12-30T07:00:00-03:00', offline: true, relogio: { sincronizadoEm: '2026-12-30T06:00:00-03:00', decorridoMs: 3600_000 } }), now);
  assert.ok(futuro.registro.alertas.includes('relogio'));
  const offSemRelogio = await registrarMarcacao(s, 'org', inp({ clientId: 'x3', dataHora: '2026-11-24T07:00:00-03:00', offline: true, relogio: null }), now);
  assert.ok(offSemRelogio.registro.alertas.includes('relogio'));
  const ok = await registrarMarcacao(s, 'org', inp({ clientId: 'x4' }), now);
  assert.ok(!ok.registro.alertas.includes('relogio'));
});

test('I9: dia com 2 marcações num estabelecimento de 4 desconta o almoço (não vira hora extra)', () => {
  const r = horasDoDia([{ tipo: 'entrada', dataHora: '2026-11-25T07:00:00-03:00' }, { tipo: 'saida', dataHora: '2026-11-25T17:00:00-03:00' }], '2026-11-25', resolveConfig());
  assert.deepEqual([r.hn, r.h50, r.trabalhadoMin], [9, 0, 540]);
});

test('I4: recálculos do Diário de duas pessoas em paralelo não apagam um ao outro', async () => {
  const s = await base();
  await registrarMarcacao(s, 'org', inp({ clientId: 'a' }), now);
  await registrarMarcacao(s, 'org', inp({ clientId: 'b', deviceId: 'd2', rhId: 'r2', dataHora: '2026-11-25T08:00:00-03:00' }), now);
  const doc: Record<string, unknown> = {};
  const writer = async (_o: string, _d: string, linhas: Record<string, unknown>) => {
    await new Promise((r) => setTimeout(r, Object.keys(linhas)[0] === 'r1' ? 30 : 1));
    Object.assign(doc, linhas);
  };
  await Promise.all([recalcularPontoDia(s, writer, 'org', '2026-11-25', now, 'r1'), recalcularPontoDia(s, writer, 'org', '2026-11-25', now, 'r2')]);
  assert.deepEqual(Object.keys(doc).sort(), ['r1', 'r2']);
});

test('I11: método de identificação fica registrado; sem rosto gera "sem_biometria"; PIN errado → 403, certo grava', async () => {
  const s = await base();
  const semFace = await registrarMarcacao(s, 'org', inp({ clientId: 'n1', face: null, metodo: 'nenhum' }), now);
  assert.ok(semFace.registro.alertas.includes('sem_biometria'));
  assert.equal(semFace.registro.metodo, 'nenhum');
  await assert.rejects(registrarMarcacao(s, 'org', inp({ clientId: 'n2', face: null, metodo: 'pin', pin: '0000' }), now), (e: any) => e instanceof PontoErro && e.status === 403);
  const pin = await registrarMarcacao(s, 'org', inp({ clientId: 'n3', face: null, metodo: 'pin', pin: '4321' }), now);
  assert.equal(pin.registro.metodo, 'pin');
  const rosto = await registrarMarcacao(s, 'org', inp({ clientId: 'n4' }), now);
  assert.equal(rosto.registro.metodo, 'rosto');
  assert.ok(!rosto.registro.alertas.includes('sem_biometria'));
});

// ── rotas ──
async function api(store: ReturnType<typeof memoryPontoStore>, opts: Record<string, unknown> = {}) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { (req as any).user = { uid: 'u', master: false, orgs: { org: 'Admin' } }; next(); });
  app.use('/api/ponto', createPontoRouter({ store: () => store, now, afterRegistro: async () => {}, ...opts }));
  const server: Server = await new Promise((r) => { const sv = app.listen(0, () => r(sv)); });
  const port = (server.address() as { port: number }).port;
  const call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
    const res = await fetch(`http://127.0.0.1:${port}/api/ponto${path}`, { method, headers: { 'content-type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };
  return { call, close: () => new Promise((r) => server.close(r)) };
}
async function parear(store: ReturnType<typeof memoryPontoStore>, call: any) {
  const kp = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = await webcrypto.subtle.exportKey('jwk', kp.publicKey);
  const p = await criarPareamento(store, { orgId: 'org', modo: 'pessoal', rhId: 'r1', criadoPor: 'u' }, now);
  const r = await call('POST', '/device/pair', { code: p.code, publicKeyJwk: jwk, nome: 'x' });
  const sign = async (s: string) => Buffer.from(await webcrypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, kp.privateKey, new TextEncoder().encode(s))).toString('base64');
  return { id: r.body.deviceId as string, sign };
}
const pl = (o: Record<string, unknown>) => JSON.stringify({ clientId: 'c1', rhId: 'r1', tipo: 'entrada', dataHora: '2026-11-25T07:00:00-03:00', offline: false, gps: null, face: null, relogio: null, ...o });

test('I3: falha temporária do banco volta com retry:true; payload inválido volta com retry:false', async () => {
  const store = await base();
  const quebrado = { ...store, appendMarcacao: async () => { throw new Error('ABORTED: contention'); } } as typeof store;
  const a = await api(quebrado);
  try {
    const d = await parear(store, a.call);
    const p = pl({});
    const r = await a.call('POST', '/device/marcacoes', { items: [{ payload: p, signature: await d.sign(p) }, { payload: p, signature: 'x' }] }, { 'x-ponto-device': d.id });
    assert.deepEqual(r.body.results.map((x: any) => [x.ok, x.retry]), [[false, true], [false, false]]);
  } finally { await a.close(); }
});

test('I8: aparelho revogado ainda entrega marcações anteriores à revogação, com alerta; posteriores → erro', async () => {
  const store = await base();
  const a = await api(store);
  try {
    const d = await parear(store, a.call);
    await store.revokeDevice(d.id, '2026-11-25T07:00:03-03:00');
    const antes = pl({ clientId: 'v1', dataHora: '2026-11-25T06:59:00-03:00', offline: true });
    const depois = pl({ clientId: 'v2', dataHora: '2026-11-25T07:00:04-03:00', offline: true });
    const r = await a.call('POST', '/device/marcacoes', { items: [{ payload: antes, signature: await d.sign(antes) }, { payload: depois, signature: await d.sign(depois) }] }, { 'x-ponto-device': d.id });
    assert.equal(r.status, 200);
    assert.equal(r.body.results[0].ok, true);
    assert.ok(r.body.results[0].comprovante.alertas.includes('aparelho_revogado'));
    assert.equal(r.body.results[1].ok, false);
    assert.equal(r.body.results[1].retry, false);
  } finally { await a.close(); }
});

test('I6/I7: AFD usa o dia da gravação (marcação offline de ontem gravada hoje sai no AFD de hoje) e aceita no máximo 31 dias', async () => {
  const store = await base();
  await registrarMarcacao(store, 'org', inp({ clientId: 'o1', dataHora: '2026-11-24T17:00:00-03:00', offline: true }), now);
  assert.equal((await store.listMarcacoesEstab('e1', '2026-11-25', '2026-11-25')).length, 1);
  assert.equal((await store.listMarcacoesEstab('e1', '2026-11-24', '2026-11-24')).length, 0);
  assert.equal((await store.listMarcacoes('org', { desde: '2026-11-24', ate: '2026-11-24' })).length, 1); // espelho continua no dia da marcação
  const a = await api(store);
  try {
    assert.equal((await a.call('GET', '/afd?orgId=org&estabId=e1&inicio=2026-10-01&fim=2026-11-01')).status, 400);
  } finally { await a.close(); }
});

// ── Diário ──
test('I5: linha do ponto sem obra usa a obra atual do colaborador', () => {
  const html = readFileSync('public/operacoes/index.html', 'utf8');
  assert.match(html, /obra:pt\.obra\|\|c\.obraAtual\|\|''/);
});

test('I10: Diário recarrega o ponto do dia e acusa linhas lançadas diferentes do ponto', () => {
  const ctx: any = { window: {} };
  vm.runInNewContext(readFileSync('public/operacoes/ponto.js', 'utf8'), ctx);
  const P = ctx.window.PontoDiario;
  const pd = { linhas: { r1: { hn: 9, h50: 1, h100: 0, obra: null, incompleto: false, marcacoes: [] } } };
  assert.equal(P.diverge(pd, { rhId: 'r1' }, { hn: 9, h50: 1, h100: 0 }), false);
  assert.equal(P.diverge(pd, { rhId: 'r1' }, { hn: '9', h50: '1', h100: '' }), false);
  assert.equal(P.diverge(pd, { rhId: 'r1' }, { hn: 8, h50: 0, h100: 0 }), true);
  assert.equal(P.diverge(pd, { rhId: 'r2' }, { hn: 8 }), false);
  const html = readFileSync('public/operacoes/index.html', 'utf8');
  assert.match(html, /PontoDiario\.diverge\(/);
  assert.match(html, /diferem do ponto/);
  assert.match(html, /PONTO_TTL/);
});
