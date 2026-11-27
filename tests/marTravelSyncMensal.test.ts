import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { Server } from 'node:http';
import { monthRanges, lerRespostaSync } from '../src/services/marTravelCompras.ts';
import { createTravelProviderRouter, memoryTravelProviderStore } from '../server/travelProviderRoutes.ts';

test('faixas mensais vêm do mesmo helper no navegador e no servidor', () => {
  assert.deepEqual(monthRanges('2026-10-15', '2026-11-26'), [
    { dataInicial: '2026-10-15', dataFinal: '2026-10-31' },
    { dataInicial: '2026-11-01', dataFinal: '2026-11-26' },
  ]);
});

test('resposta que não é a do servidor vira erro legível (nada de "undefined")', async () => {
  const html = new Response('<!doctype html><html></html>', { status: 200, headers: { 'content-type': 'text/html' } });
  await assert.rejects(lerRespostaSync(html), /resposta inesperada \(HTTP 200\)/i);
  const timeout = new Response('', { status: 504 });
  await assert.rejects(lerRespostaSync(timeout), /HTTP 504/);
  const erro = new Response(JSON.stringify({ error: 'Lemontech: Usuário inválido' }), { status: 502 });
  await assert.rejects(lerRespostaSync(erro), /Usuário inválido/);
  const ok = new Response(JSON.stringify({ ok: true, total: 3, totalGeral: 10 }), { status: 200 });
  assert.deepEqual(await lerRespostaSync(ok), { total: 3, totalGeral: 10 });
});

async function api(opts: { pages?: number } = {}) {
  const store = memoryTravelProviderStore();
  const chamadas: number[] = [];
  const client = { async pesquisarSolicitacao(p: any) { chamadas.push(Date.now()); return p.registroInicial === 0 ? [{ idSolicitacao: p.dataInicial, status: 'CONCLUIDA' }] : []; } };
  const esperas: number[] = [];
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { (req as any).user = { uid: 'u1', master: false, orgs: { org_a: 'Admin' } }; next(); });
  const getAdminHandles = () => ({
    db: { collection: () => ({ doc: () => ({ get: async () => ({ exists: false, data: () => undefined }) }) }) },
  }) as any;
  app.use('/api/travel', createTravelProviderRouter({ store: () => store, secretKey: () => undefined, lemontech: () => ({ client }), sleep: async (ms) => { esperas.push(ms); }, getAdminHandles }));
  const server: Server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const port = (server.address() as { port: number }).port;
  const call = async (body: unknown) => {
    const res = await fetch(`http://127.0.0.1:${port}/api/travel/lemontech/sync`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };
  return { call, store, esperas, close: () => new Promise((r) => server.close(r)) };
}

test('servidor sincroniza um pedaço de até 62 dias por chamada e devolve o total do pedaço e o geral', async () => {
  const a = await api();
  try {
    assert.equal((await a.call({ orgId: 'org_a', desde: '2026-01-01', ate: '2026-11-26' })).status, 400);
    const r1 = await a.call({ orgId: 'org_a', desde: '2026-10-01', ate: '2026-10-31', inicioTotal: '2025-11-27' });
    assert.equal(r1.status, 200);
    assert.equal(r1.body.total, 1);
    const r2 = await a.call({ orgId: 'org_a', desde: '2026-11-01', ate: '2026-11-26', inicioTotal: '2025-11-27' });
    assert.equal(r2.body.totalGeral, 2);
    assert.equal(r2.body.desde, '2025-11-27');
    assert.ok(a.esperas.some((ms) => ms > 0), 'respeita 60/min entre chamadas seguidas');
  } finally { await a.close(); }
});
