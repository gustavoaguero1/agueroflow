import test from 'node:test';
import assert from 'node:assert/strict';
import { createAreaService, type AreaStore } from '../server/areaService.ts';
import { encodeAreas, resolveAreas } from '../src/permissions/areas.ts';

type M = { id: string; orgId: string; role: string; userName: string; active: boolean; areaOverrides?: unknown };

function memStore(members: M[]) {
  const orgs: Record<string, unknown> = {};
  const refreshed: string[] = [];
  const store: AreaStore = {
    getOrgDefaults: async (o) => orgs[o],
    setOrgDefaults: async (o, d) => { orgs[o] = d; },
    listMembers: async (o) => members.filter((m) => m.orgId === o && m.active) as never,
    getMember: async (id) => (members.find((m) => m.id === id) as never) || null,
    setMemberOverrides: async (id, ov) => { members.find((m) => m.id === id)!.areaOverrides = ov; },
    refreshClaims: async (id) => { refreshed.push(id); },
  };
  return { store, orgs, refreshed, members };
}

const admin = (org: string) => ({ uid: 'a', master: false, orgs: { [org]: 'Admin' } }) as never;
const gerente = (org: string) => ({ uid: 'g', master: false, orgs: { [org]: 'Gerente' } }) as never;

test('mudar o padrão da empresa grava limpo e renova o login de todos da empresa', async () => {
  const s = memStore([
    { id: 'm1', orgId: 'a', role: 'Supervisor', userName: 'Ana', active: true },
    { id: 'm2', orgId: 'a', role: 'Operacional', userName: 'Bia', active: true },
    { id: 'm3', orgId: 'b', role: 'Operacional', userName: 'Cid', active: true },
  ]);
  const svc = createAreaService(s.store);
  const r = await svc.setOrgDefaults(admin('a'), 'a', { Supervisor: { rh: 1, lixo: 2 } });
  assert.equal(r.ok, true);
  assert.deepEqual(s.orgs.a, { Supervisor: { rh: 1 } });
  assert.deepEqual(s.refreshed.sort(), ['m1', 'm2']);
});

test('só quem edita Configurações muda acessos (Gerente só vê)', async () => {
  const s = memStore([{ id: 'm1', orgId: 'a', role: 'Supervisor', userName: 'Ana', active: true }]);
  const svc = createAreaService(s.store);
  assert.equal((await svc.setOrgDefaults(gerente('a'), 'a', {})).ok, false);
  assert.equal((await svc.setMemberOverrides(gerente('a'), 'm1', { rh: 2 })).ok, false);
  assert.equal(s.members[0].areaOverrides, undefined);
  assert.equal((await svc.setOrgDefaults(admin('b'), 'a', {})).ok, false); // outra empresa
});

test('ajuste por pessoa grava limpo e renova só o login dela', async () => {
  const s = memStore([{ id: 'm1', orgId: 'a', role: 'Supervisor', userName: 'Ana', active: true }]);
  const svc = createAreaService(s.store);
  const r = await svc.setMemberOverrides(admin('a'), 'm1', { rh: 1, foo: 2 });
  assert.equal(r.ok, true);
  assert.deepEqual(s.members[0].areaOverrides, { rh: 1 });
  assert.deepEqual(s.refreshed, ['m1']);
});

test('quem não é Admin não mexe no acesso de um Admin', async () => {
  const s = memStore([{ id: 'm1', orgId: 'a', role: 'Admin', userName: 'Dono', active: true }]);
  const svc = createAreaService(s.store);
  const editor = { uid: 'x', master: false, orgs: { a: 'Supervisor' }, areas: { a: encodeAreas({ ...resolveAreas('Supervisor'), configuracoes: 2 }) } } as never;
  assert.equal((await svc.setMemberOverrides(editor, 'm1', { rh: 0 })).ok, false);
  assert.equal((await svc.setMemberOverrides(admin('a'), 'm1', { rh: 1 })).ok, true);
});

test('quem não é Admin não muda o padrão do perfil Admin', async () => {
  const s = memStore([{ id: 'm1', orgId: 'a', role: 'Admin', userName: 'Dono', active: true }]);
  const svc = createAreaService(s.store);
  const editor = { uid: 'x', master: false, orgs: { a: 'Gerente' }, areas: { a: encodeAreas({ ...resolveAreas('Gerente'), configuracoes: 2 }) } } as never;
  const r = await svc.setOrgDefaults(editor, 'a', { Admin: { rh: 0 }, Supervisor: { rh: 1 } });
  assert.equal(r.ok, true);
  assert.deepEqual(s.orgs.a, { Supervisor: { rh: 1 } }); // Admin mantido como estava
  s.orgs.a = { Admin: { financeiro: 1 } };
  await svc.setOrgDefaults(editor, 'a', { Supervisor: { rh: 1 } });
  assert.deepEqual(s.orgs.a, { Admin: { financeiro: 1 }, Supervisor: { rh: 1 } });
});

test('renovar o login de todos: uma falha não para os outros e é informada', async () => {
  const s = memStore([
    { id: 'm1', orgId: 'a', role: 'Supervisor', userName: 'Ana', active: true },
    { id: 'm2', orgId: 'a', role: 'Operacional', userName: 'Bia', active: true },
    { id: 'm3', orgId: 'a', role: 'Operacional', userName: 'Cid', active: true },
  ]);
  const base = s.store.refreshClaims;
  s.store.refreshClaims = async (id) => { if (id === 'm2') throw new Error('x'); await base(id); };
  const r = await createAreaService(s.store).setOrgDefaults(admin('a'), 'a', {});
  assert.equal(r.ok, true);
  assert.deepEqual(s.refreshed.sort(), ['m1', 'm3']);
  if (r.ok) assert.deepEqual(r.data, { refreshFailed: 1 });
});

test('tirar acesso derruba o login antigo da pessoa; liberar não', async () => {
  const s = memStore([{ id: 'm1', orgId: 'a', role: 'Supervisor', userName: 'Ana', active: true }]);
  const revoked: string[] = [];
  s.store.revokeTokens = async (id) => { revoked.push(id); };
  const svc = createAreaService(s.store);
  await svc.setMemberOverrides(admin('a'), 'm1', { rh: 1 });
  assert.deepEqual(revoked, []);
  await svc.setMemberOverrides(admin('a'), 'm1', { rh: 1, operacoes: 0 });
  assert.deepEqual(revoked, ['m1']);
});

test('padrão da empresa que tira acesso derruba o login só de quem perdeu', async () => {
  const s = memStore([
    { id: 'm1', orgId: 'a', role: 'Supervisor', userName: 'Ana', active: true },
    { id: 'm2', orgId: 'a', role: 'Operacional', userName: 'Bia', active: true },
  ]);
  const revoked: string[] = [];
  s.store.revokeTokens = async (id) => { revoked.push(id); };
  await createAreaService(s.store).setOrgDefaults(admin('a'), 'a', { Supervisor: { estoque: 0 } });
  assert.deepEqual(revoked, ['m1']);
});

test('ver a tela de acessos: Admin, Gerente ou quem edita Configurações', async () => {
  const s = memStore([{ id: 'm1', orgId: 'a', role: 'Supervisor', userName: 'Ana', active: true }]);
  const svc = createAreaService(s.store);
  assert.equal((await svc.read(gerente('a'), 'a')).ok, true);
  const sup = { uid: 's', master: false, orgs: { a: 'Supervisor' } } as never;
  assert.equal((await svc.read(sup, 'a')).ok, false); // Supervisor abre Configurações, mas não vê os acessos
});

test('pessoa inexistente: erro claro, nada gravado', async () => {
  const s = memStore([]);
  const r = await createAreaService(s.store).setMemberOverrides(admin('a'), 'zz', { rh: 1 });
  assert.equal(r.ok, false);
  assert.equal(r.status, 404);
});

test('leitura traz padrões do perfil, da empresa e o acesso final de cada pessoa', async () => {
  const s = memStore([{ id: 'm1', orgId: 'a', role: 'Supervisor', userName: 'Ana', active: true, areaOverrides: { financeiro: 2 } }]);
  s.orgs.a = { Supervisor: { rh: 1 } };
  const r = await createAreaService(s.store).read(gerente('a'), 'a');
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.deepEqual(r.data.orgDefaults, { Supervisor: { rh: 1 } });
  const ana = r.data.members[0];
  assert.deepEqual(ana.areaOverrides, { financeiro: 2 });
  assert.equal(ana.levels.rh, 1);
  assert.equal(ana.levels.financeiro, 2);
  assert.equal(r.data.canEdit, false);
});
