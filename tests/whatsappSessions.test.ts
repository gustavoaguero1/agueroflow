import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createSessionRegistry, migrateLegacyAuth, sessionKeyForUser } from '../server/whatsappSessions';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'wa-reg-'));
/** Fábrica falsa: registra o que foi criado e o que foi parado. */
function fakeFactory() {
  const made: Array<{ key: string; authDir: string; stateFile: string }> = [];
  const stopped: string[] = [];
  const factory = (cfg: { key: string; authDir: string; stateFile: string }) => {
    made.push(cfg);
    return {
      key: cfg.key,
      stopWhatsAppBridgeSession: async () => { stopped.push(cfg.key); return {} as never; },
      hasPersistedBridgeSession: () => fs.existsSync(path.join(cfg.authDir, 'creds.json')),
    } as never;
  };
  return { factory, made, stopped };
}

test('sessionKeyForUser só deixa letras, números, _ e -', () => {
  assert.equal(sessionKeyForUser('member_ab/c.d'), 'u_member_ab_c_d');
});

test('ensure devolve a mesma sessão e usa pasta e arquivo próprios', () => {
  const base = tmp();
  const f = fakeFactory();
  const reg = createSessionRegistry({ baseDir: base, maxSessions: 5, factory: f.factory });
  const a1 = reg.ensure('u_a', { orgId: 'org1', uid: 'a' });
  const a2 = reg.ensure('u_a', { orgId: 'org1', uid: 'a' });
  assert.equal(a1, a2);
  assert.equal(f.made.length, 1);
  assert.equal(f.made[0].authDir, path.join(base, 'u_a'));
  assert.equal(f.made[0].stateFile, path.join(base, '..', 'data_whatsapp_bridge_state', 'u_a.json'));
  assert.deepEqual(reg.meta('u_a'), { orgId: 'org1', uid: 'a' });
});

test('acima do limite de sessões, ensure recusa com 429', () => {
  const f = fakeFactory();
  const reg = createSessionRegistry({ baseDir: tmp(), maxSessions: 1, factory: f.factory });
  reg.ensure('u_a', { orgId: 'o', uid: 'a' });
  assert.throws(() => reg.ensure('u_b', { orgId: 'o', uid: 'b' }), (e: { status?: number }) => e.status === 429);
});

test('restoreAll recria as sessões salvas depois de reiniciar', () => {
  const base = tmp();
  const f1 = fakeFactory();
  const r1 = createSessionRegistry({ baseDir: base, maxSessions: 5, factory: f1.factory });
  r1.ensure('u_a', { orgId: 'o1', uid: 'a' });
  r1.ensure('u_b', { orgId: 'o2', uid: 'b' });
  const f2 = fakeFactory();
  const r2 = createSessionRegistry({ baseDir: base, maxSessions: 5, factory: f2.factory });
  assert.deepEqual(r2.restoreAll().sort(), ['u_a', 'u_b']);
  assert.deepEqual(r2.meta('u_b'), { orgId: 'o2', uid: 'b' });
});

test('remove para a sessão, apaga as credenciais e esquece os dados', async () => {
  const base = tmp();
  const f = fakeFactory();
  const reg = createSessionRegistry({ baseDir: base, maxSessions: 5, factory: f.factory });
  reg.ensure('u_a', { orgId: 'o', uid: 'a' });
  fs.mkdirSync(path.join(base, 'u_a'), { recursive: true });
  fs.writeFileSync(path.join(base, 'u_a', 'creds.json'), '{}');
  await reg.remove('u_a');
  assert.deepEqual(f.stopped, ['u_a']);
  assert.equal(fs.existsSync(path.join(base, 'u_a')), false);
  assert.equal(reg.get('u_a'), undefined);
  assert.deepEqual(reg.list(), []);
});

test('rename leva credenciais, estado e dados da sessão antiga para a chave do usuário', async () => {
  const base = tmp();
  const f = fakeFactory();
  const reg = createSessionRegistry({ baseDir: base, maxSessions: 5, factory: f.factory });
  reg.ensure('legacy', { orgId: 'o', uid: null });
  fs.mkdirSync(path.join(base, 'legacy'), { recursive: true });
  fs.writeFileSync(path.join(base, 'legacy', 'creds.json'), '{"registered":true}');
  const b = await reg.rename('legacy', 'u_ana', { orgId: 'o', uid: 'ana' });
  assert.equal(b?.key, 'u_ana');
  assert.deepEqual(f.stopped, ['legacy']);
  assert.equal(fs.existsSync(path.join(base, 'u_ana', 'creds.json')), true);
  assert.equal(fs.existsSync(path.join(base, 'legacy')), false);
  assert.equal(reg.get('legacy'), undefined);
  assert.deepEqual(reg.meta('u_ana'), { orgId: 'o', uid: 'ana' });
});

test('rename não sobrescreve uma sessão que o usuário já tem', async () => {
  const f = fakeFactory();
  const reg = createSessionRegistry({ baseDir: tmp(), maxSessions: 5, factory: f.factory });
  reg.ensure('legacy', { orgId: 'o', uid: null });
  reg.ensure('u_ana', { orgId: 'o', uid: 'ana' });
  await assert.rejects(() => reg.rename('legacy', 'u_ana', { orgId: 'o', uid: 'ana' }), /já tem/);
});

test('migrateLegacyAuth move a sessão antiga da raiz para legacy/ uma vez só', () => {
  const base = tmp();
  fs.writeFileSync(path.join(base, 'creds.json'), '{"registered":true}');
  fs.writeFileSync(path.join(base, 'app-state-sync-key-1.json'), '{}');
  assert.equal(migrateLegacyAuth(base, 'org_padrao'), true);
  assert.equal(fs.existsSync(path.join(base, 'legacy', 'creds.json')), true);
  assert.equal(fs.existsSync(path.join(base, 'legacy', 'app-state-sync-key-1.json')), true);
  assert.equal(fs.existsSync(path.join(base, 'creds.json')), false);
  const reg = createSessionRegistry({ baseDir: base, maxSessions: 5, factory: fakeFactory().factory });
  assert.deepEqual(reg.restoreAll(), ['legacy']);
  assert.deepEqual(reg.meta('legacy'), { orgId: 'org_padrao', uid: null });
  assert.equal(migrateLegacyAuth(base, 'org_padrao'), false);
});
