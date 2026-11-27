import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const load = () => {
  const ctx: any = { window: {} };
  vm.runInNewContext(readFileSync('public/operacoes/ponto.js', 'utf8'), ctx);
  return ctx.window.PontoDiario;
};

const obras = [{ id: 'un_u1', unitId: 'u1', nome: 'Obra 1' }, { id: 'ov9', unitId: 'u9', nome: 'Obra 9' }];

test('PontoDiario.sugestao acha pela rhId, troca unitId pela obra do Diário e devolve null sem dado', () => {
  const P = load();
  const dia = { linhas: { r1: { hn: 9, h50: 1.5, h100: 0, obra: 'u9', incompleto: false, marcacoes: ['07:00', '12:00', '13:00', '18:30'] } } };
  const s = P.sugestao(dia, { id: 'rh_r1', rhId: 'r1' }, obras);
  assert.equal(s.obra, 'ov9');
  assert.equal(s.sit, 'Trabalhou');
  assert.deepEqual([s.hn, s.h50, s.h100], [9, 1.5, 0]);
  assert.equal(s.doPonto, true);
  assert.match(s.obs, /ponto: 07:00 12:00 13:00 18:30/);
  assert.equal(P.sugestao(dia, { id: 'x', rhId: 'r2' }, obras), null);
  assert.equal(P.sugestao(null, { id: 'x', rhId: 'r1' }, obras), null);
  assert.equal(P.sugestao(dia, { id: 'x' }, obras), null);
});

test('ponto incompleto não preenche horas nem situação', () => {
  const P = load();
  const s = P.sugestao({ linhas: { r1: { hn: 0, h50: 0, h100: 0, obra: 'u1', incompleto: true, marcacoes: ['07:00'] } } }, { id: 'a', rhId: 'r1' }, obras);
  assert.deepEqual([s.hn, s.sit, s.incompleto, s.obra], ['', '', true, 'un_u1']);
  assert.match(s.obs, /ponto incompleto/);
});

test('index.html carrega ponto.js e lê ponto_dia', () => {
  const html = readFileSync('public/operacoes/index.html', 'utf8');
  assert.match(html, /<script src="ponto\.js"><\/script>/);
  assert.match(html, /ponto_dia\//);
  assert.match(html, /PontoDiario\.sugestao\(/);
  assert.match(html, /data-act="dd-ponto"/);
  assert.match(html, /a==='dd-ponto'/);
});
