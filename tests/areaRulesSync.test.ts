import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AREAS, AREA_IDS, ROLE_DEFAULTS, encodeAreas, resolveAreas } from '../src/permissions/areas.ts';
import type { UserRole } from '../src/types/index.ts';

const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
const storageRules = readFileSync(new URL('../storage.rules', import.meta.url), 'utf8');
const waMiddleware = readFileSync(new URL('../server/whatsappMiddleware.ts', import.meta.url), 'utf8');

test('as regras do banco usam a mesma tabela de padrões por perfil que o app', () => {
  for (const role of Object.keys(ROLE_DEFAULTS) as UserRole[]) {
    const m = new RegExp(`'${role}': '([012]+)'`).exec(rules);
    assert.ok(m, `perfil ${role} ausente em roleAreas()`);
    assert.equal(m![1], encodeAreas(resolveAreas(role)), role);
  }
});

test('perfil desconhecido: regras e app dão o mesmo (só os mínimos)', () => {
  const m = /\}\.get\(role, '([012]+)'\)/.exec(rules);
  assert.equal(m?.[1], encodeAreas(resolveAreas('Desconhecido' as never)));
});

test('as regras numeram as áreas na mesma ordem do app', () => {
  const order = /\/\/ Ordem: (.+)/.exec(rules)![1].split(', ').map((s) => s.split(' '));
  assert.deepEqual(order.map(([id]) => id), [...AREA_IDS]);
  order.forEach(([, i], n) => assert.equal(Number(i), n));
  for (const [fn, id] of [
    ['A_OPS', 'operacoes'],
    ['A_STOCK', 'estoque'],
    ['A_COM', 'comercial'],
    ['A_FIN', 'financeiro'],
    ['A_RH', 'rh'],
    ['A_WA', 'whatsapp'],
  ]) {
    const v = new RegExp(`function ${fn}\\(\\) \\{ return (\\d+); \\}`).exec(rules)![1];
    assert.equal(Number(v), AREA_IDS.indexOf(id as never), fn);
  }
});

test('salário da equipe de campo só com acesso ao RH', () => {
  const block = /match \/field_worker_pay\/\{id\} \{([\s\S]*?)\n    \}/.exec(rules)?.[1] || '';
  assert.match(block, /allow read: if resource == null \? signedIn\(\) : areaOk\(payOrg\(resource\.data\), A_RH\(\), 1\)/);
  assert.match(block, /allow create: if areaOk\(payOrg\(request\.resource\.data\), A_RH\(\), 2\)/);
});

test('itens de proposta conferem a área pela proposta-mãe (a lista filtra só por proposalId)', () => {
  const block = /match \/commercial_proposal_items\/\{itemId\} \{([\s\S]*?)\n    \}/.exec(rules)?.[1] || '';
  assert.match(block, /areaOk\(parentOrg\(resource\.data\), A_COM\(\), 1\)/);
  assert.doesNotMatch(block, /itemOrg/);
});

test('acesso por área só muda pelo servidor', () => {
  assert.match(rules, /hasAny\(\['areaDefaults'\]\)/);
  assert.match(rules, /hasAny\(\['passwordHash', 'userId', 'areaOverrides', 'areasUpdatedAt'\]\)/);
});

test('enforcedInDatabase está reconciliado com firestore.rules, storage.rules e APIs', () => {
  const enforcedIds = AREAS.filter((a) => a.enforcedInDatabase).map((a) => a.id).sort();
  assert.deepEqual(enforcedIds, ['comercial', 'configuracoes', 'estoque', 'financeiro', 'operacoes', 'rh', 'whatsapp']);

  // WhatsApp collections must not use legacy cross-tenant waMember()
  assert.doesNotMatch(rules, /function waMember\(/);
  assert.match(rules, /function waCanRead\(res\)/);
  assert.match(rules, /areaOk\(orgOf\(res\.data\), A_WA\(\), 1\)/);
  assert.match(waMiddleware, /areaLevelOf\(req\.user, org, 'whatsapp'\)/);

  // Storage rules enforce Operações (index 1) and RH onboardings (index 5)
  assert.match(storageRules, /areaCode\(orgId\)\[1:2\]/);
  assert.match(storageRules, /match \/hr-onboardings\/\{orgId\}\/\{onboardingId\}\/\{fileId\}/);
  assert.match(storageRules, /areaCode\(orgId\)\[5:6\]/);
});
