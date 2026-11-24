import test from 'node:test';
import assert from 'node:assert/strict';
import { AREA_IDS, ROLE_DEFAULTS, resolveAreas, areaOfSection, canSeeSection } from '../src/permissions/areas';

test('padrões por perfil: RH fechado para a maioria, Admin edita tudo', () => {
  assert.equal(ROLE_DEFAULTS.Admin.rh, 2);
  assert.equal(ROLE_DEFAULTS.Gerente.rh, 1);
  assert.equal(ROLE_DEFAULTS.Supervisor.rh, 0);
  assert.equal(ROLE_DEFAULTS.Operacional.rh, 0);
  assert.equal(ROLE_DEFAULTS.Visualizador.rh, 0);
  assert.ok(AREA_IDS.every((a) => ROLE_DEFAULTS.Admin[a] === 2));
  assert.equal(ROLE_DEFAULTS.Operacional.financeiro, 0);
  assert.equal(ROLE_DEFAULTS.Operacional.operacoes, 2);
});

test('ajuste por pessoa vence o padrão da empresa, que vence o do perfil', () => {
  const r = resolveAreas('Operacional', { Operacional: { financeiro: 1, estoque: 2 } }, { financeiro: 2 });
  assert.equal(r.financeiro, 2);
  assert.equal(r.estoque, 2);
  assert.equal(r.rh, 0);
});

test('Painel e Suporte: todo mundo vê, mesmo que alguém tente tirar', () => {
  const r = resolveAreas('Visualizador', { Visualizador: { painel: 0 } }, { suporte: 0 });
  assert.equal(r.painel, 1);
  assert.equal(r.suporte, 1);
});

test('Admin nunca perde Configurações (não se tranca para fora)', () => {
  assert.equal(resolveAreas('Admin', { Admin: { configuracoes: 0 } }, { configuracoes: 1 }).configuracoes, 2);
});

test('valores inválidos são ignorados', () => {
  const r = resolveAreas('Operacional', { Operacional: { rh: 7 as never } }, { financeiro: 'x' as never });
  assert.equal(r.rh, 0);
  assert.equal(r.financeiro, 0);
});

test('cada seção do menu pertence a uma área', () => {
  assert.equal(areaOfSection('rh-funcionarios'), 'rh');
  assert.equal(areaOfSection('rh-salarios'), 'rh');
  assert.equal(areaOfSection('ops-diario'), 'operacoes');
  assert.equal(areaOfSection('obras'), 'operacoes');
  assert.equal(areaOfSection('viagens-painel'), 'operacoes');
  assert.equal(areaOfSection('financeiro-contas'), 'financeiro');
  assert.equal(areaOfSection('whatsapp-central'), 'whatsapp');
  assert.equal(areaOfSection('painel'), 'painel');
  assert.equal(areaOfSection('qualquer-coisa'), null);
});

test('canSeeSection: sem acesso some do menu; seção sem área continua visível', () => {
  const lv = resolveAreas('Operacional');
  assert.equal(canSeeSection('rh-funcionarios', lv), false);
  assert.equal(canSeeSection('ops-diario', lv), true);
  assert.equal(canSeeSection('qualquer-coisa', lv), true);
});
