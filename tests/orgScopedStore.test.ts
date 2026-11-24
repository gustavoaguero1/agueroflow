import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrgScopedArray, createOrgScopedObject, createOrgScopedMap } from '../server/orgScopedStore';

let org = 'A';
const orgOf = () => org;

test('lista antiga (sem empresa) vai toda para a empresa padrão; visão segue a empresa do contexto', () => {
  const s = createOrgScopedArray<{ id: string }>({ orgOf, defaultOrg: 'A', initial: [{ id: '1' }, { id: '2', organizationId: 'B' }] });
  org = 'A';
  assert.deepEqual(s.view.map((x) => x.id), ['1']);
  org = 'B';
  assert.deepEqual(s.view.map((x) => x.id), ['2']);
  org = 'C';
  assert.equal(s.view.length, 0);
});

test('a visão se comporta como array: push, unshift, splice, índice, find, some, espalhar, for..of, JSON', () => {
  const s = createOrgScopedArray<{ id: string; v?: number }>({ orgOf, defaultOrg: 'A', initial: [] });
  org = 'A';
  s.view.push({ id: 'a1' });
  s.view.unshift({ id: 'a0' });
  s.view[1] = { id: 'a1', v: 9 };
  s.view.splice(0, 0, { id: 'z' });
  assert.equal(s.view.length, 3);
  assert.equal(s.view.find((x) => x.id === 'a1')?.v, 9);
  assert.equal(s.view.some((x) => x.id === 'z'), true);
  assert.deepEqual([...s.view].map((x) => x.id), ['z', 'a0', 'a1']);
  const ids: string[] = [];
  for (const x of s.view) ids.push(x.id);
  assert.deepEqual(ids, ['z', 'a0', 'a1']);
  assert.deepEqual(JSON.parse(JSON.stringify(s.view)).map((x: { id: string }) => x.id), ['z', 'a0', 'a1']);
  assert.equal(Array.isArray(s.view), true);
  assert.deepEqual(s.view.filter((x) => x.id !== 'z').map((x) => x.id), ['a0', 'a1']);
  org = 'B';
  assert.equal(s.view.length, 0);
});

test('set troca só a lista da empresa atual; all() carimba a empresa em cada registro', () => {
  const s = createOrgScopedArray<{ id: string }>({ orgOf, defaultOrg: 'A', initial: [{ id: 'a' }, { id: 'b', organizationId: 'B' }] });
  org = 'B';
  s.set([{ id: 'b2' }]);
  org = 'A';
  assert.deepEqual(s.view.map((x) => x.id), ['a']);
  assert.deepEqual(s.all(), [{ id: 'a', organizationId: 'A' }, { id: 'b2', organizationId: 'B' }]);
  assert.deepEqual(s.orgs().sort(), ['A', 'B']);
});

test('configuração: objeto simples antigo = empresa padrão; empresa nova nasce com os padrões', () => {
  const c = createOrgScopedObject<{ status: string; phones: string[] }>({
    orgOf, defaultOrg: 'A', defaults: () => ({ status: 'desconectado', phones: [] }), initial: { status: 'conectado', phones: ['1'] },
  });
  org = 'A';
  assert.equal(c.view.status, 'conectado');
  org = 'B';
  assert.equal(c.view.status, 'desconectado');
  c.view.status = 'conectado';
  c.view.phones.push('9');
  org = 'A';
  assert.deepEqual(c.view.phones, ['1']);
  assert.deepEqual(c.all().B, { status: 'conectado', phones: ['9'] });
  c.set({ ...c.view, status: 'erro' });
  assert.equal(c.view.status, 'erro');
  assert.deepEqual({ ...c.view }, { status: 'erro', phones: ['1'] });
});

test('configuração: formato novo { __porEmpresa } carrega cada empresa', () => {
  const c = createOrgScopedObject<{ status: string }>({
    orgOf, defaultOrg: 'A', defaults: () => ({ status: 'x' }), initial: { __porEmpresa: { A: { status: 'a' }, B: { status: 'b' } } },
  });
  org = 'B';
  assert.equal(c.view.status, 'b');
  assert.deepEqual(Object.keys(c.all()).sort(), ['A', 'B']);
});

// effectiveOrg de produção: o id antigo vira a empresa real (DEFAULT_ORG_ID).
const norm = (o?: string) => (!o || o === 'org_aguero_default' ? 'REAL' : o);

test('id antigo da empresa (org_aguero_default) cai na empresa real, tanto nos dados quanto no contexto', () => {
  const s = createOrgScopedArray<{ id: string }>({ orgOf, defaultOrg: 'REAL', normalize: norm, initial: [{ id: 'm1', organizationId: 'org_aguero_default' }, { id: 'm2' }] });
  org = 'REAL';
  assert.deepEqual(s.view.map((x) => x.id), ['m1', 'm2']);
  org = 'org_aguero_default';
  assert.deepEqual(s.view.map((x) => x.id), ['m1', 'm2']);
  assert.deepEqual(s.all().map((x) => x.organizationId), ['REAL', 'REAL']);
});

test('configuração: padrões podem depender da empresa (empresa nova não herda a identidade da padrão)', () => {
  const c = createOrgScopedObject<{ phone: string }>({
    orgOf, defaultOrg: 'A', defaults: (o) => ({ phone: o === 'A' ? '5511' : '' }), initial: null,
  });
  org = 'A';
  assert.equal(c.view.phone, '5511');
  org = 'NOVA';
  assert.equal(c.view.phone, '');
});

test('registro que entra na lista ganha a empresa (push, unshift, índice, set) — e a cópia na nuvem também', () => {
  const s = createOrgScopedArray<{ id: string; organizationId?: string }>({ orgOf, defaultOrg: 'A', initial: [] });
  org = 'B';
  s.view.push({ id: 'p' });
  s.view.unshift({ id: 'u' });
  s.view[2] = { id: 'i' };
  assert.deepEqual(s.view.map((x) => x.organizationId), ['B', 'B', 'B']);
  s.set([{ id: 'n' }]);
  assert.equal(s.view[0].organizationId, 'B');
});

test('live(): os registros reais de todas as empresas (alterar um altera o depósito)', () => {
  const s = createOrgScopedArray<{ id: string; ok?: boolean }>({ orgOf, defaultOrg: 'A', initial: [{ id: 'a' }, { id: 'b', organizationId: 'B' }] });
  const b = s.live().find((x) => x.id === 'b')!;
  b.ok = true;
  org = 'B';
  assert.equal(s.view[0].ok, true);
});

test('mapa por empresa: get/set/has/delete/size/iterar só da empresa atual', () => {
  const m = createOrgScopedMap<{ name: string }>({ orgOf, defaultOrg: 'A', initial: [['g1', { name: 'G1' }], ['g2', { name: 'G2', organizationId: 'B' }]] });
  org = 'A';
  assert.equal(m.view.has('g1'), true);
  assert.equal(m.view.has('g2'), false);
  m.view.set('g3', { name: 'G3' });
  assert.equal(m.view.size, 2);
  assert.deepEqual([...m.view.keys()].sort(), ['g1', 'g3']);
  m.view.delete('g1');
  org = 'B';
  assert.equal(m.view.get('g2')?.name, 'G2');
  assert.deepEqual(m.all().map(([k, v]) => [k, v.organizationId]).sort(), [['g2', 'B'], ['g3', 'A']]);
});
