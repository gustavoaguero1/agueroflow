import test from 'node:test';
import assert from 'node:assert/strict';
import { ROLE_DEFAULTS, resolveAreas } from '../src/permissions/areas.ts';
import {
  MODULE_PERMISSIONS, MODULE_ACCESS_LABELS, resolveModuleLevel, resolveModuleLevels,
  sanitizeModuleOverrides, sanitizeModuleDefaults, canAccessModule,
} from '../src/permissions/modules.ts';

test('catálogo cobre as áreas e não contém identificadores duplicados', () => {
  const ids = MODULE_PERMISSIONS.map(([id]) => id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes('ops-contratacao'));
  assert.ok(ids.includes('rh-holerites'));
  assert.ok(ids.includes('compras-recebimento'));
  assert.ok(ids.includes('rh-ponto-admin'));
});

test('níveis granulares preservam o acesso herdado da área', () => {
  const areas = resolveAreas('Operacional');
  assert.equal(resolveModuleLevel('ops-diario', 'Operacional', areas), 2);
  assert.equal(resolveModuleLevel('rh-holerites', 'Operacional', areas), 0);
});

test('exceção individual vence o padrão da empresa e ambos vencem a área', () => {
  const areas = resolveAreas('Operacional');
  const defaults = { Operacional: { 'ops-diario': 1 as const, 'ops-config': 0 as const } };
  const personal = { 'ops-diario': 4 as const, 'ops-config': 2 as const };
  assert.equal(resolveModuleLevel('ops-diario', 'Operacional', areas, defaults, personal), 4);
  assert.equal(resolveModuleLevel('ops-config', 'Operacional', areas, defaults, personal), 2);
});

test('níveis inválidos e seções desconhecidas não viram liberações', () => {
  assert.deepEqual(sanitizeModuleOverrides({ 'ops-diario': 4, 'rh-holerites': 99, desconhecido: 4 }), { 'ops-diario': 4 });
  assert.deepEqual(sanitizeModuleDefaults({ Supervisor: { 'ops-diario': 3 }, hacker: { painel: 4 } }), { Supervisor: { 'ops-diario': 3 } });
  const areas = resolveAreas('Visualizador');
  assert.equal(canAccessModule('ops-diario', areas, { 'ops-diario': 0 }), false);
  assert.equal(resolveModuleLevel('unknown-module', 'Admin', areas, null, { 'unknown-module': 4 }), 0);
  assert.equal(canAccessModule('unknown-module', areas, { 'unknown-module': 4 }), false);
  assert.equal(resolveModuleLevel('estrutura', 'Admin', areas), 4);
  assert.equal(resolveModuleLevel('estrutura', 'Admin', { ...areas, estrutura: 1 }), 1);
  assert.equal(resolveModuleLevel('configuracoes', 'Admin', areas, null, { configuracoes: 0 }), 4);
  const managerAreas = resolveAreas('Gerente');
  assert.equal(resolveModuleLevel('rh-ponto-admin', 'Gerente', managerAreas), 4);
  assert.equal(resolveModuleLevel('viagens-configuracoes', 'Gerente', managerAreas), 4);
  assert.equal(resolveModuleLevel('rh-ponto-admin', 'Gerente', managerAreas, null, { 'rh-ponto-admin': 0 }), 0);
  assert.equal(sanitizeModuleDefaults({ Admin: { configuracoes: 0, estrutura: 2 } }).Admin?.configuracoes, 4);
});

test('matriz devolve apenas níveis válidos e apresenta cinco capacidades', () => {
  const all = resolveModuleLevels('Admin', resolveAreas('Admin'), null, { 'ops-config': 4 });
  assert.ok(Object.values(all).every((v) => [0, 1, 2, 3, 4].includes(v)));
  assert.deepEqual(Object.keys(MODULE_ACCESS_LABELS).sort(), ['0','1','2','3','4']);
});
