import test from 'node:test';
import assert from 'node:assert/strict';
import { moduleLevelOf } from '../server/authMiddleware.ts';

function getAdminWithGrant(grant: Record<string, unknown> | null) {
  return () => ({
    db: {
      collection: (_name: string) => ({
        doc: (_id: string) => ({
          get: async () => ({
            exists: grant !== null,
            data: () => grant || undefined,
          }),
        }),
      }),
    },
  }) as never;
}

test('unknown module identifiers fail closed, even when the member can edit the area', async () => {
  const user = { uid: 'uid-operacional', master: false, orgs: { aguero: 'Operacional' } } as never;
  assert.equal(await moduleLevelOf(user, 'aguero', 'ops-modulo-inexistente', getAdminWithGrant(null)), 0);
});

test('revoked grants block inherited area access while an old token remains valid', async () => {
  const user = { uid: 'uid-operacional', master: false, orgs: { aguero: 'Operacional' } } as never;
  assert.equal(await moduleLevelOf(user, 'aguero', 'ops-diario', getAdminWithGrant({ revoked: true })), 0);
});

test('an explicit zero overrides the inherited area permission', async () => {
  const user = { uid: 'uid-operacional', master: false, orgs: { aguero: 'Operacional' } } as never;
  assert.equal(await moduleLevelOf(user, 'aguero', 'ops-diario', getAdminWithGrant({
    modules: { 'ops-diario': 0 },
    explicitModules: ['ops-diario'],
  })), 0);
});

test('Admin inherits level 4 where the area is editable and cannot lock itself out of access settings', async () => {
  const user = { uid: 'uid-admin', master: false, orgs: { aguero: 'Admin' } } as never;
  assert.equal(await moduleLevelOf(user, 'aguero', 'estrutura', getAdminWithGrant(null)), 4);
  assert.equal(await moduleLevelOf(user, 'aguero', 'configuracoes', getAdminWithGrant({
    modules: { configuracoes: 0 },
    explicitModules: ['configuracoes'],
  })), 4);
});


test('legacy Gerente capabilities remain available unless an explicit submodule grant restricts them', async () => {
  const manager = { uid: 'uid-manager', master: false, orgs: { aguero: 'Gerente' } } as never;
  assert.equal(await moduleLevelOf(manager, 'aguero', 'rh-ponto-admin', getAdminWithGrant(null)), 4);
  assert.equal(await moduleLevelOf(manager, 'aguero', 'viagens-configuracoes', getAdminWithGrant(null)), 4);
  assert.equal(await moduleLevelOf(manager, 'aguero', 'rh-ponto-admin', getAdminWithGrant({
    modules: { 'rh-ponto-admin': 0 },
    explicitModules: ['rh-ponto-admin'],
  })), 0);
});
