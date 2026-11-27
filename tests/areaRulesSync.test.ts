import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AREAS, AREA_IDS, ROLE_DEFAULTS, encodeAreas, resolveAreas } from '../src/permissions/areas.ts';
import type { UserRole } from '../src/types/index.ts';

const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
const storageRules = readFileSync(new URL('../storage.rules', import.meta.url), 'utf8');
const waMiddleware = readFileSync(new URL('../server/whatsappMiddleware.ts', import.meta.url), 'utf8');
const pontoRhRoutes = readFileSync(new URL('../server/ponto/rhRoutes.ts', import.meta.url), 'utf8');

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
    ['A_EST', 'estrutura'],
  ]) {
    const v = new RegExp(`function ${fn}\(\) \{ return (\d+); \}`).exec(rules)![1];
    assert.equal(Number(v), AREA_IDS.indexOf(id as never), fn);
  }
});

test('salário da equipe de campo só com acesso ao RH', () => {
  const block = /match \/field_worker_pay\/\{id\} \{([\s\S]*?)\n    \}/.exec(rules)?.[1] || '';
  assert.match(block, /allow read: if resource == null \? signedIn\(\) : moduleOk\(payOrg\(resource\.data\), 'rh-holerites', A_RH\(\), 1\)/);
  assert.match(block, /allow create: if moduleOk\(payOrg\(request\.resource\.data\), 'rh-holerites', A_RH\(\), 2\)/);
});

test('itens de proposta conferem a área pela proposta-mãe (a lista filtra só por proposalId)', () => {
  const block = /match \/commercial_proposal_items\/\{itemId\} \{([\s\S]*?)\n    \}/.exec(rules)?.[1] || '';
  assert.match(block, /moduleOk\(parentOrg\(resource\.data\), 'comercial-composicao', A_COM\(\), 1\)/);
  assert.doesNotMatch(block, /itemOrg/);
});

test('acesso por área só muda pelo servidor', () => {
  assert.match(rules, /hasAny\(\['areaDefaults', 'moduleAccessDefaults'\]\)/);
  assert.match(rules, /hasAny\(\['passwordHash', 'userId', 'areaOverrides', 'moduleAccessOverrides', 'areasUpdatedAt'\]\)/);
});

test('enforcedInDatabase está reconciliado com firestore.rules, storage.rules e APIs', () => {
  const enforcedIds = AREAS.filter((a) => a.enforcedInDatabase).map((a) => a.id).sort();
  assert.deepEqual(enforcedIds, ['comercial', 'configuracoes', 'estoque', 'estrutura', 'financeiro', 'operacoes', 'rh', 'whatsapp']);

  // WhatsApp collections must not use legacy cross-tenant waMember()
  assert.doesNotMatch(rules, /function waMember\(/);
  assert.match(rules, /function waCanRead\(res, section\)/);
  assert.match(rules, /moduleOk\(orgOf\(res\.data\), section, A_WA\(\), 1\)/);
  assert.match(rules, /match \/org_module_access\/\{id\}/);
  assert.match(rules, /function moduleMap\(org\)/);
  assert.match(waMiddleware, /moduleLevelOf\(req\.user, org, section, deps\.getAdminHandles\)/);

  // Estrutura collections enforce A_EST()
  assert.match(rules, /function A_EST\(\) \{ return 8; \}/);
  assert.match(rules, /\['assets', 'contracts', 'cost_centers', 'teams', 'units'\] \? A_EST\(\)/);
  assert.match(rules, /coll == 'audit_logs'\s*&&\s*moduleOk\(orgOf\(d\), 'auditoria', A_EST\(\), 1\)/);

  // Storage rules enforce Operações (index 1) and RH onboardings (index 5)
  assert.match(storageRules, /moduleLevel\(orgId, 'ordens', 1\)/);
  assert.match(storageRules, /match \/hr-onboardings\/\{orgId\}\/\{onboardingId\}\/\{fileId\}/);
  assert.match(storageRules, /moduleLevel\(orgId, 'rh-admissoes', 5\)/);
});



test('Firestore routes contracts through the Contratos module grant', () => {
  assert.match(rules, /coll == 'contracts' \? 'contratos'/);
});

test('RH collections honor their granular submodule grants', () => {
  assert.match(rules, /function rhRead\(d\)/);
  assert.match(rules, /function rhWrite\(d\)/);
  assert.match(rules, /moduleOk\(o, 'rh-importacao', A_RH\(\), 2\)/);
  assert.match(rules, /moduleOk\(o, 'rh-calculo', A_RH\(\), 2\)/);
});

test('Ponto REP-P retains multi-pose biometrics and protects only its RH administration routes', () => {
  assert.match(pontoRhRoutes, /requireModuleAccess\('rh-ponto', 1\)/);
  assert.match(pontoRhRoutes, /requireModuleAccess\('rh-ponto', 2\)/);
  assert.match(pontoRhRoutes, /requireModuleAccess\('rh-ponto-admin', 4\)/);
  assert.match(pontoRhRoutes, /openFaceDescriptors/);
  assert.match(pontoRhRoutes, /FACE_MAX_POSES/);
});


test('legacy field and operations collections remain available only through their granular submodules', () => {
  assert.match(rules, /function auxiliaryRead\(d\)/);
  assert.match(rules, /function auxiliaryWrite\(d\)/);
  assert.match(rules, /coll == 'worker_time_logs'[\s\S]*?moduleOk\(o, 'ops-diario', A_OPS\(\), 1\)/);
  assert.match(rules, /coll == 'support_tickets'[\s\S]*?moduleOk\(o, 'suporte', 10, 1\)/);
});
