import test from 'node:test';
import assert from 'node:assert/strict';
import { sugestoesDoDia } from '../src/ponto/diario.ts';
import { resolveConfig } from '../src/ponto/config.ts';
import { recalcularPontoDia } from '../server/ponto/diarioSync.ts';
import { memoryPontoStore } from '../server/ponto/store.ts';
import { registrarMarcacao } from '../server/ponto/registrar.ts';

const cfg = resolveConfig();
const m = (tipo: any, hh: string, unitId: string | null = 'u1') => ({ tipo, dataHora: `2026-11-25T${hh}:00-03:00`, unitId });

test('sugestão do dia: horas pela jornada e obra da primeira marcação com obra', () => {
  const s = sugestoesDoDia({ dataISO: '2026-11-25', porPessoa: [{ rhId: 'r1', cfg, marcacoes: [m('entrada', '07:00', null), m('saida_almoco', '12:00', 'u2'), m('volta_almoco', '13:00'), m('saida', '18:30')] }] });
  assert.deepEqual(s.r1, { hn: 9, h50: 1.5, h100: 0, obra: 'u2', incompleto: false, marcacoes: ['07:00', '12:00', '13:00', '18:30'] });
});

test('dia incompleto: horas 0 e incompleto true; sem marcação a pessoa não aparece', () => {
  const s = sugestoesDoDia({ dataISO: '2026-11-25', porPessoa: [{ rhId: 'r1', cfg, marcacoes: [m('entrada', '07:00')] }, { rhId: 'r2', cfg, marcacoes: [] }] });
  assert.deepEqual([s.r1.hn, s.r1.incompleto, s.r1.obra], [0, true, 'u1']);
  assert.equal('r2' in s, false);
});

test('recalcularPontoDia grava as sugestões do dia com os ajustes aplicados', async () => {
  const store = memoryPontoStore();
  await store.saveEstab({ id: 'e1', orgId: 'org', cnpj: '11222333000181', razaoSocial: 'A' });
  await store.savePessoa({ orgId: 'org', rhId: 'r1', nome: 'Ana', cpf: '52998224725', estabelecimentoId: 'e1', vinculo: 'CLT' });
  store.obras.set('org', [{ id: 'u1', nome: 'Obra', geo: { lat: -23.5505, lng: -46.6333 } }]);
  const now = () => new Date('2026-11-25T22:00:00Z');
  await registrarMarcacao(store, 'org', { clientId: 'a', deviceId: 'd', rhId: 'r1', tipo: 'entrada', dataHora: '2026-11-25T07:00:00-03:00', offline: false, gps: { lat: -23.5505, lng: -46.6333 }, face: null, relogio: null }, now);
  await store.addAjuste({ id: 'aj', orgId: 'org', rhId: 'r1', data: '2026-11-25', acao: 'incluir', tipo: 'saida', dataHora: '2026-11-25T11:00:00-03:00', justificativa: 'saiu cedo', autorUid: 'u', criadoEm: 'x' });
  const gravados: any[] = [];
  await recalcularPontoDia(store, async (orgId, dia, doc) => { gravados.push({ orgId, dia, doc }); }, 'org', '2026-11-25', now);
  assert.equal(gravados.length, 1);
  assert.equal(gravados[0].doc.linhas.r1.obra, 'u1');
  assert.equal(gravados[0].doc.linhas.r1.hn, 4);
  assert.ok(gravados[0].doc.atualizadoEm);
});
