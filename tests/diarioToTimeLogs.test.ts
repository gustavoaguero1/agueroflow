import test from 'node:test';
import assert from 'node:assert/strict';
import { diarioToTimeLogs } from '../src/modules/operations/diarioToTimeLogs';

const colabs = new Map([
  ['c-ana', { rhId: 'e1', nome: 'Ana', funcao: 'Soldadora' }],
  ['c-bia', { rhId: 'e2', nome: 'Bia', funcao: 'Encanadora' }],
  ['c-semrh', { nome: 'Sem RH', funcao: 'Ajudante' }],
]);
const obras = new Map([['un_u1', { nome: 'Usina Norte', unitId: 'u1' }]]);

test('quem trabalhou vira um apontamento com id determinístico e o funcionário de campo do RH', () => {
  const logs = diarioToTimeLogs('org', '2026-11-23', { 'c-ana': { obra: 'un_u1', sit: 'Trabalhou', hn: 8, h50: 2 } }, colabs, obras);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].id, 'wtl_ops_2026-11-23_c-ana');
  assert.equal(logs[0].workerId, 'fw_e1');
  assert.equal(logs[0].workerName, 'Ana');
  assert.equal(logs[0].role, 'Soldadora');
  assert.equal(logs[0].siteName, 'Usina Norte');
  assert.equal(logs[0].unitId, 'u1');
  assert.equal(logs[0].normalHours, 8);
  assert.equal(logs[0].overtime50Hours, 2);
  assert.equal(logs[0].orgId, 'org');
});

test('folga, falta e linha sem horas não geram apontamento', () => {
  const logs = diarioToTimeLogs('org', '2026-11-23', {
    'c-ana': { obra: 'un_u1', sit: 'Folga', hn: 0 },
    'c-bia': { obra: 'un_u1', sit: 'Falta' },
  }, colabs, obras);
  assert.deepEqual(logs, []);
});

test('domingo com horas a 100% entra como hora extra 100%', () => {
  const logs = diarioToTimeLogs('org', '2026-11-22', { 'c-bia': { obra: 'un_u1', sit: 'Trabalhou', h100: 8 } }, colabs, obras);
  assert.equal(logs[0].overtime100Hours, 8);
  assert.equal(logs[0].normalHours, 0);
});

test('dia de viagem com horas entra como horas de viagem', () => {
  const logs = diarioToTimeLogs('org', '2026-11-23', { 'c-ana': { obra: 'un_u1', sit: 'Viagem', hn: 6 } }, colabs, obras);
  assert.equal(logs[0].travelHours, 6);
  assert.equal(logs[0].normalHours, 0);
});

test('pessoa sem funcionário no RH fica fora do apontamento', () => {
  const logs = diarioToTimeLogs('org', '2026-11-23', { 'c-semrh': { obra: 'un_u1', sit: 'Trabalhou', hn: 8 } }, colabs, obras);
  assert.deepEqual(logs, []);
});
