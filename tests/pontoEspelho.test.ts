import test from 'node:test';
import assert from 'node:assert/strict';
import { montarEspelho } from '../server/ponto/espelho.ts';
import { resolveConfig } from '../src/ponto/config.ts';
import type { MarcacaoRegistro, Ajuste } from '../server/ponto/store.ts';

let nsr = 0;
const mk = (tipo: any, dataHora: string, o: Partial<MarcacaoRegistro> = {}): MarcacaoRegistro => ({
  id: 'e1__' + ++nsr, orgId: 'org', estabId: 'e1', nsr, rhId: 'r1', cpf: '52998224725', tipo, dataHora, dia: dataHora.slice(0, 10),
  gravadoEm: dataHora, diaGrav: dataHora.slice(0, 10), metodo: 'rosto', coletor: '01', offline: false, campos: '', hash: 'h', prevHash: null, clientId: 'c' + nsr, deviceId: 'd',
  gps: null, face: null, unitId: 'u1', distM: 5, alertas: [], ...o,
});
const aj = (o: Partial<Ajuste>): Ajuste => ({ id: 'a' + Math.random(), orgId: 'org', rhId: 'r1', data: '2026-11-25', acao: 'incluir', justificativa: 'esqueceu de bater', autorUid: 'u', criadoEm: 'x', ...o });
const cfg = resolveConfig();
const diaCompleto = () => [mk('entrada', '2026-11-25T07:00:00-03:00'), mk('saida_almoco', '2026-11-25T12:00:00-03:00'), mk('volta_almoco', '2026-11-25T13:00:00-03:00'), mk('saida', '2026-11-25T18:30:00-03:00')];

test('ajuste "desconsiderar" risca a marcação e recalcula as horas', () => {
  const ms = diaCompleto();
  const sem = montarEspelho({ marcacoes: ms, ajustes: [], cfg, inicio: '2026-11-25', fim: '2026-11-25' });
  assert.equal(sem.dias[0].horas.h50, 1.5);
  const com = montarEspelho({ marcacoes: ms, ajustes: [aj({ acao: 'desconsiderar', nsrRef: ms[3].nsr, estabId: 'e1' }), aj({ acao: 'incluir', tipo: 'saida', dataHora: '2026-11-25T17:00:00-03:00' })], cfg, inicio: '2026-11-25', fim: '2026-11-25' });
  const d = com.dias[0];
  assert.equal(d.marcacoes.find((m) => m.nsr === ms[3].nsr)?.desconsiderada, true);
  assert.equal(d.horas.h50, 0);
  assert.equal(d.horas.hn, 9);
});

test('ajuste "incluir" completa um dia incompleto', () => {
  const ms = [mk('entrada', '2026-11-25T07:00:00-03:00')];
  assert.equal(montarEspelho({ marcacoes: ms, ajustes: [], cfg, inicio: '2026-11-25', fim: '2026-11-25' }).dias[0].horas.incompleto, true);
  const e = montarEspelho({ marcacoes: ms, ajustes: [
    aj({ tipo: 'saida_almoco', dataHora: '2026-11-25T12:00:00-03:00' }), aj({ tipo: 'volta_almoco', dataHora: '2026-11-25T13:00:00-03:00' }), aj({ tipo: 'saida', dataHora: '2026-11-25T17:00:00-03:00' }),
  ], cfg, inicio: '2026-11-25', fim: '2026-11-25' });
  assert.equal(e.dias[0].horas.incompleto, false);
  assert.equal(e.dias[0].horas.hn, 9);
  assert.deepEqual(e.dias[0].marcacoes.map((m) => m.origem), ['ponto', 'ajuste', 'ajuste', 'ajuste']);
});

test('marcação offline de ontem gravada hoje aparece no dia de ontem', () => {
  const ms = [mk('entrada', '2026-11-24T07:00:00-03:00', { gravadoEm: '2026-11-25T08:00:00-03:00', offline: true, alertas: ['offline'] })];
  const e = montarEspelho({ marcacoes: ms, ajustes: [], cfg, inicio: '2026-11-24', fim: '2026-11-25' });
  assert.equal(e.dias.length, 2);
  assert.equal(e.dias[0].data, '2026-11-24');
  assert.equal(e.dias[0].marcacoes.length, 1);
  assert.deepEqual(e.dias[0].marcacoes[0].alertas, ['offline']);
  assert.equal(e.dias[1].marcacoes.length, 0);
});

test('totais somam hn/h50/h100 e contam dias incompletos', () => {
  const ms = [...diaCompleto(), mk('entrada', '2026-11-26T07:00:00-03:00')];
  const e = montarEspelho({ marcacoes: ms, ajustes: [], cfg, inicio: '2026-11-25', fim: '2026-11-26' });
  assert.deepEqual(e.totais, { hn: 9, h50: 1.5, h100: 0, diasIncompletos: 1 });
});
