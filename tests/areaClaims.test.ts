import test from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import {
  AREA_IDS, ROLE_DEFAULTS, encodeAreas, decodeAreas, sanitizeOverrides, sanitizeOrgDefaults,
} from '../src/permissions/areas.ts';
import { claimsFromMembers } from '../server/authService.ts';
import { areaLevelOf, moduleLevelOf, requireArea, requireModuleAccess } from '../server/authMiddleware.ts';

test('áreas viram um texto curto no token e voltam iguais', () => {
  const s = encodeAreas(ROLE_DEFAULTS.Supervisor);
  assert.equal(s.length, AREA_IDS.length);
  assert.match(s, /^[012]+$/);
  assert.deepEqual(decodeAreas(s), ROLE_DEFAULTS.Supervisor);
});

test('texto inválido no token não vira acesso', () => {
  for (const bad of [undefined, null, 7, '', '123', '2'.repeat(AREA_IDS.length + 1), 'x'.repeat(AREA_IDS.length)]) {
    assert.equal(decodeAreas(bad as never), null, String(bad));
  }
});

test('ajuste por pessoa aceita só áreas e níveis válidos', () => {
  assert.deepEqual(sanitizeOverrides({ rh: 1, financeiro: 2, foo: 2, estoque: 3, painel: '2' }), { rh: 1, financeiro: 2 });
  assert.deepEqual(sanitizeOverrides(null), {});
  assert.deepEqual(sanitizeOverrides([1, 2]), {});
});

test('padrões da empresa aceitam só perfis conhecidos', () => {
  assert.deepEqual(sanitizeOrgDefaults({ Supervisor: { rh: 1, x: 2 }, Chefe: { rh: 2 }, Admin: 'x' }), { Supervisor: { rh: 1 }, Admin: {} });
});

test('token: cada empresa leva perfil e áreas (padrão da empresa + ajuste da pessoa)', () => {
  const c = claimsFromMembers(
    [
      { orgId: 'a', role: 'Supervisor', areaOverrides: { financeiro: 2 } },
      { orgId: 'b', role: 'Operacional' },
    ],
    { a: { Supervisor: { rh: 1 } } },
  );
  assert.deepEqual(c.orgs, { a: 'Supervisor', b: 'Operacional' });
  const a = decodeAreas(c.areas!.a)!;
  assert.equal(a.rh, 1);
  assert.equal(a.financeiro, 2);
  // Sem ajuste, a empresa não ocupa o token: o servidor e as regras usam o padrão do perfil.
  assert.equal(c.areas!.b, undefined);
});

test('ninguém ajustado: o token fica como era (sem áreas)', () => {
  assert.deepEqual(claimsFromMembers([{ orgId: 'a', role: 'Gerente' }], {}), { master: false, orgs: { a: 'Gerente' } });
});

test('ajuste fixado igual ao padrão continua no token (se o padrão do sistema mudar, o ajuste vale)', () => {
  const c = claimsFromMembers([{ orgId: 'a', role: 'Gerente', areaOverrides: { rh: 1 } }], {});
  assert.equal(decodeAreas(c.areas!.a)!.rh, 1);
  const d = claimsFromMembers([{ orgId: 'a', role: 'Gerente' }], { a: { Gerente: { rh: 1 } } });
  assert.ok(d.areas?.a);
  // padrão da empresa para OUTRO perfil não afeta este
  assert.deepEqual(claimsFromMembers([{ orgId: 'a', role: 'Gerente' }], { a: { Supervisor: { rh: 1 } } }), { master: false, orgs: { a: 'Gerente' } });
});

test('token grande demais: tira primeiro as liberações extras (nunca dá acesso a mais)', () => {
  const orgs = Array.from({ length: 30 }, (_, i) => `o${String(i).padStart(2, "0")}`);
  // metade com acesso a mais (RH liberado), metade com acesso a menos (sem Operações)
  const members = orgs.map((o, i) => ({ orgId: o, role: 'Operacional' as const, areaOverrides: i % 2 ? { rh: 1 } : { operacoes: 0 } }));
  const c = claimsFromMembers(members, {});
  assert.ok(JSON.stringify(c).length <= 1000, String(JSON.stringify(c).length));
  for (const [o, code] of Object.entries(c.areas || {})) {
    const lv = decodeAreas(code)!;
    assert.equal(lv.rh, 0, `${o} manteve liberação`);
  }
});

test('nem tirando liberações cabe: erro claro', () => {
  const orgs = Array.from({ length: 30 }, (_, i) => `o${String(i).padStart(2, "0")}`);
  const members = orgs.map((o) => ({ orgId: o, role: 'Operacional' as const, areaOverrides: { operacoes: 0 } }));
  assert.throws(() => claimsFromMembers(members, {}), /empresas demais/);
});

type Out = { status?: number; nexted: boolean };
async function run(h: (req: Request, res: Response, next: () => void) => unknown, req: Partial<Request>): Promise<Out & { orgId?: string }> {
  const out: Out = { nexted: false };
  const res = { status(c: number) { out.status = c; return this; }, json() { return this; } } as unknown as Response;
  const r = { headers: {}, params: {}, query: {}, body: {}, originalUrl: '/api/x', ...req } as Request;
  await h(r, res, () => { out.nexted = true; });
  return { ...out, orgId: r.orgId };
}

const userWith = (role: string, areas?: string) => ({
  uid: 'u', master: false, orgs: { a: role }, ...(areas !== undefined ? { areas: { a: areas } } : {}),
}) as never;

test('requireArea: passa com o nível pedido, recusa abaixo dele', async () => {
  const lv = { ...ROLE_DEFAULTS.Operacional, rh: 1 as const };
  const user = userWith('Operacional', encodeAreas(lv));
  assert.equal((await run(requireArea('rh', 1), { user, query: { orgId: 'a' } as never })).nexted, true);
  const denied = await run(requireArea('rh', 2), { user, query: { orgId: 'a' } as never });
  assert.equal(denied.status, 403);
  assert.equal(denied.nexted, false);
});

test('requireArea: token antigo sem áreas → RH só Admin e Gerente (Gerente só vê)', async () => {
  assert.equal(areaLevelOf(userWith('Admin'), 'a', 'rh'), 2);
  assert.equal(areaLevelOf(userWith('Gerente'), 'a', 'rh'), 1);
  assert.equal(areaLevelOf(userWith('Supervisor'), 'a', 'rh'), 0);
  assert.equal(areaLevelOf(userWith('Supervisor', 'lixo'), 'a', 'rh'), 0);
});

test('requireArea: master sempre passa; quem não é da empresa não passa', async () => {
  const master = { uid: 'm', master: true, orgs: {} } as never;
  assert.equal((await run(requireArea('rh', 2), { user: master, query: { orgId: 'z' } as never })).nexted, true);
  const out = await run(requireArea('painel', 1), { user: userWith('Admin'), query: { orgId: 'z' } as never });
  assert.equal(out.status, 403);
  assert.equal((await run(requireArea('rh', 1), {})).status, 401);
});

test('requireArea marca a empresa autorizada na requisição', async () => {
  const out = await run(requireArea('rh', 1), { user: userWith('Admin'), query: { orgId: 'a' } as never });
  assert.equal(out.orgId, 'a');
});

function moduleStore(uid: string, modules?: Record<string, number>) {
  const data = modules ? { orgId: 'a', uid, modules } : undefined;
  return () => ({
    db: {
      collection: () => ({
        doc: () => ({
          get: async () => ({ exists: data !== undefined, data: () => data }),
        }),
      }),
    },
  }) as never;
}

test('submódulos herdam a área, mas uma exceção individual bloqueia só o submódulo configurado', async () => {
  const supervisor = userWith('Supervisor');
  assert.equal(await moduleLevelOf(supervisor, 'a', 'ops-diario', moduleStore('u')), 2);
  const getH = moduleStore('u', { 'ops-diario': 0, 'ops-contratacao': 3 });
  assert.equal(await moduleLevelOf(supervisor, 'a', 'ops-diario', getH), 0);
  assert.equal(await moduleLevelOf(supervisor, 'a', 'ops-contratacao', getH), 3);
  assert.equal(await moduleLevelOf(supervisor, 'z', 'ops-diario', getH), 0);
  assert.equal(await moduleLevelOf(supervisor, 'a', 'ops-diario', () => null), 0);
});

test('requireModuleAccess exige o nível granular e falha fechado quando não consegue validar', async () => {
  const user = userWith('Operacional');
  const overrides = moduleStore('u', { ordens: 0, checklists: 2, 'ops-contratacao': 3 });
  assert.equal((await run(requireModuleAccess('checklists', 2, overrides), { user, query: { orgId: 'a' } as never })).nexted, true);
  const blocked = await run(requireModuleAccess('ordens', 1, overrides), { user, query: { orgId: 'a' } as never });
  assert.equal(blocked.status, 403);
  const delegated = await run(requireModuleAccess('ops-contratacao', 3, overrides), { user, query: { orgId: 'a' } as never });
  assert.equal(delegated.nexted, true);
  const unavailable = await run(requireModuleAccess('checklists', 1, () => null), { user, query: { orgId: 'a' } as never });
  assert.equal(unavailable.status, 503);
  assert.equal((await run(requireModuleAccess('checklists', 1, overrides), {})).status, 401);
});

