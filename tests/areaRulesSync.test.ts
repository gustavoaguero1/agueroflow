import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AREA_IDS, ROLE_DEFAULTS, encodeAreas, resolveAreas } from '../src/permissions/areas.ts';
import type { UserRole } from '../src/types/index.ts';

const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');

test('as regras do banco usam a mesma tabela de padrões por perfil que o app', () => {
  for (const role of Object.keys(ROLE_DEFAULTS) as UserRole[]) {
    const m = new RegExp(`'${role}': '([012]+)'`).exec(rules);
    assert.ok(m, `perfil ${role} ausente em roleAreas()`);
    assert.equal(m![1], encodeAreas(resolveAreas(role)), role);
  }
});

test('as regras numeram as áreas na mesma ordem do app', () => {
  const order = /\/\/ Ordem: (.+)/.exec(rules)![1].split(', ').map((s) => s.split(' '));
  assert.deepEqual(order.map(([id]) => id), [...AREA_IDS]);
  order.forEach(([, i], n) => assert.equal(Number(i), n));
  for (const [fn, id] of [['A_OPS', 'operacoes'], ['A_COM', 'comercial'], ['A_FIN', 'financeiro'], ['A_RH', 'rh']]) {
    const v = new RegExp(`function ${fn}\\(\\) \\{ return (\\d+); \\}`).exec(rules)![1];
    assert.equal(Number(v), AREA_IDS.indexOf(id as never), fn);
  }
});

test('acesso por área só muda pelo servidor', () => {
  assert.match(rules, /hasAny\(\['areaDefaults'\]\)/);
  assert.match(rules, /hasAny\(\['passwordHash', 'userId', 'areaOverrides', 'areasUpdatedAt'\]\)/);
});
