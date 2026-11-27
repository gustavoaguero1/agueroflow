import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { Server } from 'node:http';
import { createPontoRouter } from '../server/pontoRoutes.ts';
import { memoryPontoStore } from '../server/ponto/store.ts';
import { registrarMarcacao } from '../server/ponto/registrar.ts';

const NOW = new Date('2026-11-25T21:00:00Z');

async function setup(role = 'Admin', store = memoryPontoStore()) {
  store.rh.set('org_a', [{ id: 'r1', name: 'Ana Souza', unitId: 'u1', active: true }, { id: 'r2', name: 'Bia', unitId: null, active: true }]);
  store.obras.set('org_a', [{ id: 'u1', nome: 'Obra 1', geo: { lat: -23.5505, lng: -46.6333 } }]);
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { (req as any).user = { uid: 'u_rh', master: false, orgs: { org_a: role } }; next(); });
  app.use('/api/ponto', createPontoRouter({ store: () => store, now: () => NOW }));
  const server: Server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const port = (server.address() as { port: number }).port;
  const raw = (method: string, path: string, body?: unknown) =>
    fetch(`http://127.0.0.1:${port}/api/ponto${path}`, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const call = async (method: string, path: string, body?: unknown) => {
    const res = await raw(method, path, body);
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };
  return { store, call, raw, close: () => new Promise((r) => server.close(r)) };
}

const estab = { orgId: 'org_a', cnpj: '11.222.333/0001-81', razaoSocial: 'AGUERO INOX LTDA', endereco: 'Rua A, 1' };
const pessoa = { orgId: 'org_a', cpf: '529.982.247-25', vinculo: 'CLT', batePonto: true, estabelecimentoId: 'e1', pin: '1234' };

async function preparado(a: Awaited<ReturnType<typeof setup>>) {
  assert.equal((await a.call('PUT', '/estabelecimentos/e1', estab)).status, 200);
  assert.equal((await a.call('PUT', '/pessoas/r1', pessoa)).status, 200);
}

test('estabelecimento: CNPJ inválido → 400; criado aparece na lista', async () => {
  const a = await setup();
  try {
    assert.equal((await a.call('PUT', '/estabelecimentos/e1', { ...estab, cnpj: '123' })).status, 400);
    await preparado(a);
    const l = await a.call('GET', '/estabelecimentos?orgId=org_a');
    assert.equal(l.body.items[0].cnpj, '11222333000181');
  } finally { await a.close(); }
});

test('CPF inválido → 400; válido volta mascarado na lista; PIN não volta', async () => {
  const a = await setup();
  try {
    await a.call('PUT', '/estabelecimentos/e1', estab);
    assert.equal((await a.call('PUT', '/pessoas/r1', { ...pessoa, cpf: '111.111.111-11' })).status, 400);
    assert.equal((await a.call('PUT', '/pessoas/r1', { ...pessoa, estabelecimentoId: 'nao' })).status, 400);
    assert.equal((await a.call('PUT', '/pessoas/r1', { ...pessoa, pin: '12' })).status, 400);
    assert.equal((await a.call('PUT', '/pessoas/nao-existe', pessoa)).status, 404);
    await a.call('PUT', '/pessoas/r1', pessoa);
    const l = await a.call('GET', '/pessoas?orgId=org_a');
    const ana = l.body.items.find((p: any) => p.rhId === 'r1');
    assert.equal(ana.cpfMascarado, '***.982.247-**');
    assert.equal(ana.batePonto, true);
    assert.equal(ana.vinculo, 'CLT');
    assert.equal(JSON.stringify(l.body).includes('52998224725'), false);
    assert.equal(JSON.stringify(l.body).includes('pinHash'), false);
    const bia = l.body.items.find((p: any) => p.rhId === 'r2');
    assert.equal(bia.cpfMascarado, null);
    assert.equal(bia.batePonto, true);
  } finally { await a.close(); }
});

test('Operações (sem área RH) → 403 nas rotas do RH; Gerente lê mas não grava', async () => {
  const sup = await setup('Supervisor');
  try {
    for (const p of ['/pessoas?orgId=org_a', '/estabelecimentos?orgId=org_a', '/dia?orgId=org_a&data=2026-11-25', '/aparelhos?orgId=org_a', '/afd?orgId=org_a&estabId=e1&inicio=2026-11-01&fim=2026-11-30']) {
      assert.equal((await sup.call('GET', p)).status, 403, p);
    }
  } finally { await sup.close(); }
  const ger = await setup('Gerente');
  try {
    assert.equal((await ger.call('GET', '/pessoas?orgId=org_a')).status, 200);
    assert.equal((await ger.call('PUT', '/pessoas/r1', pessoa)).status, 403);
    assert.equal((await ger.call('POST', '/pareamentos/totem', { orgId: 'org_a', unitId: 'u1' })).status, 200);
  } finally { await ger.close(); }
});

test('pareamento pessoal pelo RH devolve código; pessoa sem CPF → 400', async () => {
  const a = await setup();
  try {
    await preparado(a);
    const ok = await a.call('POST', '/pareamentos/pessoal', { orgId: 'org_a', rhId: 'r1' });
    assert.match(ok.body.code, /^[A-Z2-9]{8}$/);
    assert.ok(ok.body.expiraEm);
    assert.equal((await a.call('POST', '/pareamentos/pessoal', { orgId: 'org_a', rhId: 'r2' })).status, 400);
  } finally { await a.close(); }
});

test('espelho e painel do dia mostram as marcações; ajuste sem justificativa → 400; com justificativa recalcula', async () => {
  const a = await setup();
  try {
    await preparado(a);
    await registrarMarcacao(a.store, 'org_a', { clientId: 'c1', deviceId: 'd', rhId: 'r1', tipo: 'entrada', dataHora: '2026-11-25T07:00:00-03:00', offline: false, gps: { lat: -23.5505, lng: -46.6333 }, face: null, relogio: null }, () => NOW);
    const dia = await a.call('GET', '/dia?orgId=org_a&data=2026-11-25');
    const ana = dia.body.pessoas.find((p: any) => p.rhId === 'r1');
    assert.equal(ana.marcacoes.length, 1);
    assert.equal(ana.proxima, 'saida_almoco');
    assert.equal(ana.incompleto, true);
    assert.equal(dia.body.pessoas.some((p: any) => p.rhId === 'r2'), false);
    assert.equal((await a.call('POST', '/ajustes', { orgId: 'org_a', rhId: 'r1', data: '2026-11-25', acao: 'incluir', tipo: 'saida', dataHora: '2026-11-25T16:00:00-03:00', justificativa: '' })).status, 400);
    assert.equal((await a.call('POST', '/ajustes', { orgId: 'org_a', rhId: 'r1', data: '2026-11-25', acao: 'incluir', tipo: 'saida', dataHora: '2026-11-25T16:00:00-03:00', justificativa: 'Esqueceu de bater a saída' })).status, 200);
    const esp = await a.call('GET', '/espelho?orgId=org_a&rhId=r1&inicio=2026-11-25&fim=2026-11-25');
    assert.equal(esp.status, 200);
    assert.equal(esp.body.pessoa.nome, 'Ana Souza');
    assert.equal(esp.body.dias[0].horas.incompleto, false);
    assert.equal((await a.call('GET', '/espelho?orgId=org_a&rhId=r1&inicio=2026-01-01&fim=2026-12-31')).status, 400);
  } finally { await a.close(); }
});

test('AFD baixa em latin1 com o nome AFD_<cnpj>_<inicio>_<fim>.txt; tipo 5, tipo 2 e tipo 7 na mesma sequência de NSR', async () => {
  const a = await setup();
  try {
    await preparado(a); // tipo 2 (NSR 1) + tipo 5 'I' (NSR 2)
    await a.call('PUT', '/pessoas/r1', { ...pessoa, cpf: '153.509.460-56' }); // tipo 5 'A' (NSR 3)
    const m = await registrarMarcacao(a.store, 'org_a', { clientId: 'c1', deviceId: 'd', rhId: 'r1', tipo: 'entrada', dataHora: '2026-11-25T07:00:00-03:00', offline: false, gps: null, face: null, relogio: null }, () => NOW);
    assert.equal(m.registro.nsr, 4);
    const res = await a.raw('GET', '/afd?orgId=org_a&estabId=e1&inicio=2026-11-01&fim=2026-11-30');
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') ?? '', /ISO-8859-1/i);
    assert.match(res.headers.get('content-disposition') ?? '', /AFD_11222333000181_2026-11-01_2026-11-30\.txt/);
    const linhas = Buffer.from(await res.arrayBuffer()).toString('latin1').split('\r\n');
    assert.deepEqual(linhas.slice(1, 5).map((l) => [l.slice(0, 9), l[9]]), [['000000001', '2'], ['000000002', '5'], ['000000003', '5'], ['000000004', '7']]);
    assert.equal(linhas[2][34], 'I');
    assert.equal(linhas[3][34], 'A');
    assert.equal((await a.call('GET', '/afd?orgId=org_a&estabId=outro&inicio=2026-11-01&fim=2026-11-30')).status, 404);
  } finally { await a.close(); }
});

test('desligar "bate ponto" grava tipo 5 E; revogar aparelho mantém o registro com revogadoEm', async () => {
  const a = await setup();
  try {
    await preparado(a);
    await a.call('PUT', '/pessoas/r1', { ...pessoa, batePonto: false });
    const ev = (await a.store.listEventosEstab('e1', '2026-11-01', '2026-11-30')).sort((x, y) => x.nsr - y.nsr);
    assert.deepEqual(ev.map((e) => e.tipo), [2, 5, 5]);
    assert.deepEqual([ev[1].linha[34], ev[2].linha[34]], ['I', 'E']);
    await a.store.saveDevice({ id: 'dev1', orgId: 'org_a', modo: 'pessoal', rhId: 'r1', publicKeyJwk: { kty: 'EC' }, nome: 'Moto', criadoEm: 'x' });
    assert.equal((await a.call('DELETE', '/aparelhos/dev1?orgId=org_a')).status, 200);
    const l = await a.call('GET', '/aparelhos?orgId=org_a');
    assert.ok(l.body.items[0].revogadoEm);
    assert.equal(JSON.stringify(l.body).includes('publicKeyJwk'), false);
  } finally { await a.close(); }
});
