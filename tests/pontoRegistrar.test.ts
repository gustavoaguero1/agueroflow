import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryPontoStore } from '../server/ponto/store.ts';
import { registrarMarcacao, PontoErro, type MarcacaoInput } from '../server/ponto/registrar.ts';
import { camposTipo7, hashTipo7 } from '../server/ponto/afd.ts';

const now = () => new Date('2026-11-25T10:00:05Z'); // 07:00:05 em Brasília

async function fixture() {
  const store = memoryPontoStore();
  await store.saveEstab({ id: 'e1', orgId: 'org', cnpj: '11222333000181', razaoSocial: 'AGUERO INOX LTDA' });
  await store.savePessoa({ orgId: 'org', rhId: 'r1', nome: 'Ana Souza', cpf: '52998224725', estabelecimentoId: 'e1', vinculo: 'CLT' });
  store.obras.set('org', [{ id: 'u1', nome: 'Yakult Lorena', geo: { lat: -23.5505, lng: -46.6333 } }]);
  return store;
}

const inp = (o: Partial<MarcacaoInput> = {}): MarcacaoInput => ({
  clientId: 'c1', deviceId: 'd1', rhId: 'r1', tipo: 'entrada', dataHora: '2026-11-25T07:00:00-03:00', offline: false,
  gps: { lat: -23.5506, lng: -46.6334, precisaoM: 10 }, face: { score: 0.9, liveness: 0.95, modelo: 'sface-2021' },
  relogio: { sincronizadoEm: '2026-11-25T06:00:00-03:00', decorridoMs: 3600_000 }, ...o,
});

test('primeira marcação: NSR 1, hash sem anterior, comprovante completo', async () => {
  const store = await fixture();
  const r = await registrarMarcacao(store, 'org', inp(), now);
  assert.equal(r.duplicada, false);
  assert.equal(r.registro.nsr, 1);
  assert.equal(r.registro.prevHash, null);
  assert.equal(r.registro.hash, hashTipo7(r.registro.campos, null));
  assert.equal(r.registro.campos, camposTipo7({ nsr: 1, dataHora: '2026-11-25T07:00:00-03:00', cpf: '52998224725', gravadoEm: '2026-11-25T07:00:05-03:00', coletor: '01', offline: false }));
  assert.equal(r.comprovante.pessoa.cpf, '52998224725');
  assert.equal(r.comprovante.empresa.cnpj, '11222333000181');
  assert.equal(r.comprovante.obra?.unitId, 'u1');
  assert.deepEqual(r.comprovante.alertas, []);
});

test('NSR sobe de 1 em 1 e o hash encadeia', async () => {
  const store = await fixture();
  const r1 = await registrarMarcacao(store, 'org', inp(), now);
  const r2 = await registrarMarcacao(store, 'org', inp({ clientId: 'c2', tipo: 'saida_almoco', dataHora: '2026-11-25T12:00:00-03:00', relogio: null }), now);
  assert.equal(r2.registro.nsr, 2);
  assert.equal(r2.registro.prevHash, r1.registro.hash);
});

test('mesmo clientId devolve o mesmo registro, sem duplicar', async () => {
  const store = await fixture();
  const a = await registrarMarcacao(store, 'org', inp(), now);
  const b = await registrarMarcacao(store, 'org', inp(), now);
  assert.equal(b.duplicada, true);
  assert.equal(b.registro.nsr, a.registro.nsr);
  assert.equal(b.comprovante.hash, a.comprovante.hash);
  assert.equal((await store.listMarcacoesEstab('e1', '2026-11-01', '2026-11-30')).length, 1);
});

test('20 marcações simultâneas: NSRs 1..20 sem buraco e corrente íntegra', async () => {
  const store = await fixture();
  const rs = await Promise.all(Array.from({ length: 20 }, (_, i) => registrarMarcacao(store, 'org', inp({ clientId: 'c' + i }), now)));
  assert.deepEqual(rs.map((r) => r.registro.nsr).sort((a, b) => a - b), Array.from({ length: 20 }, (_, i) => i + 1));
  const todos = (await store.listMarcacoesEstab('e1', '2026-11-01', '2026-11-30')).sort((a, b) => a.nsr - b.nsr);
  todos.forEach((r, i) => assert.equal(r.prevHash, i ? todos[i - 1].hash : null));
});

test('fora da cerca, sem GPS, rosto baixo, relógio > 30 s e offline: grava com alertas', async () => {
  const store = await fixture();
  const fora = await registrarMarcacao(store, 'org', inp({ clientId: 'a', gps: { lat: -23.6, lng: -46.7 } }), now);
  assert.ok(fora.registro.alertas.includes('fora_da_cerca'));
  assert.equal(fora.registro.unitId, null);
  const semGps = await registrarMarcacao(store, 'org', inp({ clientId: 'b', gps: null }), now);
  assert.ok(semGps.registro.alertas.includes('sem_gps'));
  const rosto = await registrarMarcacao(store, 'org', inp({ clientId: 'c', face: { score: 0.3, modelo: 'x' } }), now);
  assert.ok(rosto.registro.alertas.includes('rosto'));
  const off = await registrarMarcacao(store, 'org', inp({ clientId: 'd', offline: true }), now);
  assert.ok(off.registro.alertas.includes('offline'));
  assert.equal(off.registro.offline, true);
  const semFace = await registrarMarcacao(store, 'org', inp({ clientId: 'e', face: null }), now);
  assert.ok(!semFace.registro.alertas.includes('rosto'));
});

test('relógio: esperado = sincronizadoEm + decorridoMs; 30 s de folga', async () => {
  const store = await fixture();
  const ok = await registrarMarcacao(store, 'org', inp({ clientId: 'x', relogio: { sincronizadoEm: '2026-11-25T06:00:00-03:00', decorridoMs: 3600_000 - 29_000 } }), now);
  assert.ok(!ok.registro.alertas.includes('relogio'));
  const ruim = await registrarMarcacao(store, 'org', inp({ clientId: 'y', relogio: { sincronizadoEm: '2026-11-25T06:00:00-03:00', decorridoMs: 3600_000 - 31_000 } }), now);
  assert.ok(ruim.registro.alertas.includes('relogio'));
});

test('horário em outro fuso é guardado em Brasília', async () => {
  const store = await fixture();
  const r = await registrarMarcacao(store, 'org', inp({ dataHora: '2026-11-25T10:00:00Z', relogio: null }), now);
  assert.equal(r.registro.dataHora, '2026-11-25T07:00:00-03:00');
});

test('pessoa sem cadastro de ponto → 404; tipo ou data inválidos → 400', async () => {
  const store = await fixture();
  await assert.rejects(registrarMarcacao(store, 'org', inp({ rhId: 'nao' }), now), (e: any) => e instanceof PontoErro && e.status === 404);
  await assert.rejects(registrarMarcacao(store, 'org', inp({ tipo: 'almoco' as any }), now), (e: any) => e instanceof PontoErro && e.status === 400);
  await assert.rejects(registrarMarcacao(store, 'org', inp({ dataHora: 'ontem' }), now), (e: any) => e instanceof PontoErro && e.status === 400);
  await assert.rejects(registrarMarcacao(store, 'org', inp({ clientId: '' }), now), (e: any) => e instanceof PontoErro && e.status === 400);
});
