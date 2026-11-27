import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveConfig } from '../src/ponto/config.ts';
import { proximaMarcacao, horasDoDia } from '../src/ponto/jornada.ts';

test('defaults da empresa', () => {
  assert.deepEqual(resolveConfig(), { inicio: '07:00', fim: '17:00', almocoMin: 60, dias: [1, 2, 3, 4, 5], marcacoesPorDia: 4, raioM: 300, toleranciaMin: 10, feriados: [], batePonto: true });
});

test('pessoa sobrescreve estabelecimento, que sobrescreve padrão', () => {
  const c = resolveConfig({ raioM: 500, marcacoesPorDia: 2 }, { raioM: 100 });
  assert.equal(c.raioM, 100);
  assert.equal(c.marcacoesPorDia, 2);
  assert.equal(c.inicio, '07:00');
});

test('campo undefined na pessoa não apaga o do estabelecimento', () => {
  assert.equal(resolveConfig({ raioM: 500 }, { raioM: undefined }).raioM, 500);
});

test('próxima marcação no modo 4 e no modo 2', () => {
  const c4 = resolveConfig();
  assert.equal(proximaMarcacao([], c4), 'entrada');
  assert.equal(proximaMarcacao(['entrada'], c4), 'saida_almoco');
  assert.equal(proximaMarcacao(['entrada', 'saida_almoco'], c4), 'volta_almoco');
  assert.equal(proximaMarcacao(['entrada', 'saida_almoco', 'volta_almoco'], c4), 'saida');
  assert.equal(proximaMarcacao(['entrada', 'saida_almoco', 'volta_almoco', 'saida'], c4), 'entrada');
  assert.equal(proximaMarcacao(['entrada'], resolveConfig({ marcacoesPorDia: 2 })), 'saida');
});

const m = (tipo: any, hh: string) => ({ tipo, dataHora: `2026-11-25T${hh}:00-03:00` }); // quarta

test('dia normal 07–12, 13–17 = 9h normais', () => {
  assert.deepEqual(
    horasDoDia([m('entrada', '07:00'), m('saida_almoco', '12:00'), m('volta_almoco', '13:00'), m('saida', '17:00')], '2026-11-25', resolveConfig()),
    { hn: 9, h50: 0, h100: 0, trabalhadoMin: 540, incompleto: false },
  );
});

test('extra dentro da tolerância de 10 min não conta; acima vira h50', () => {
  const base = [m('entrada', '07:00'), m('saida_almoco', '12:00'), m('volta_almoco', '13:00')];
  assert.equal(horasDoDia([...base, m('saida', '17:08')], '2026-11-25', resolveConfig()).h50, 0);
  assert.equal(horasDoDia([...base, m('saida', '18:30')], '2026-11-25', resolveConfig()).h50, 1.5);
});

test('domingo e feriado: tudo h100; sábado (fora dos dias): tudo h50', () => {
  const dia = (d: string) => [{ tipo: 'entrada', dataHora: `${d}T07:00:00-03:00` }, { tipo: 'saida', dataHora: `${d}T11:00:00-03:00` }] as any;
  assert.equal(horasDoDia(dia('2026-11-29'), '2026-11-29', resolveConfig({ marcacoesPorDia: 2 })).h100, 4);
  assert.equal(horasDoDia(dia('2026-11-25'), '2026-11-25', resolveConfig({ marcacoesPorDia: 2, feriados: ['2026-11-25'] })).h100, 4);
  assert.equal(horasDoDia(dia('2026-11-28'), '2026-11-28', resolveConfig({ marcacoesPorDia: 2 })).h50, 4);
});

test('modo 2: desconta o almoço pré-assinalado', () => {
  const r = horasDoDia([m('entrada', '07:00'), m('saida', '17:00')], '2026-11-25', resolveConfig({ marcacoesPorDia: 2 }));
  assert.equal(r.hn, 9);
  assert.equal(r.trabalhadoMin, 540);
});

test('dia incompleto não inventa horas', () => {
  assert.deepEqual(horasDoDia([m('entrada', '07:00')], '2026-11-25', resolveConfig()), { hn: 0, h50: 0, h100: 0, trabalhadoMin: 0, incompleto: true });
});

test('menos horas que a jornada: tudo normal, sem negativo', () => {
  const r = horasDoDia([m('entrada', '07:00'), m('saida_almoco', '11:00'), m('volta_almoco', '12:00'), m('saida', '14:00')], '2026-11-25', resolveConfig());
  assert.deepEqual([r.hn, r.h50, r.trabalhadoMin], [6, 0, 360]);
});
