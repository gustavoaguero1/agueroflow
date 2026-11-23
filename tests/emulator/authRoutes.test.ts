import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express from 'express';
import { getAdmin, type AdminHandles } from '../../server/firebaseAdmin.ts';
import { hashPassword } from '../../server/passwords.ts';
import { createAuthRouter } from '../../server/authRoutes.ts';
import type { Claims } from '../../server/authService.ts';

const PROJECT = 'demo-agueroflow';
const h = getAdmin() as AdminHandles;
assert.ok(h, 'firebase-admin must init against the emulator');

const servers: Server[] = [];
async function serve(router = createAuthRouter()): Promise<string> {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', router);
  const s = app.listen(0);
  servers.push(s);
  await new Promise((r) => s.once('listening', r));
  return `http://127.0.0.1:${(s.address() as AddressInfo).port}/api/auth`;
}
let base: string;
after(() => { for (const s of servers) s.close(); });

beforeEach(async () => {
  base = await serve(); // fresh rate-limit buckets per test
  await fetch(`http://127.0.0.1:8085/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
  await h.db.doc('organizations/org_a').set({ id: 'org_a', name: 'Aguero Inox', slug: 'aguero-inox' });
  await h.db.doc('organizations/org_b').set({ id: 'org_b', name: 'Beta', slug: 'beta' });
});

function member(id: string, extra: Record<string, unknown> = {}) {
  return h.db.doc(`org_members/${id}`).set({
    id, orgId: 'org_a', userEmail: `${id}@x.com`, userName: `User ${id}`, role: 'Operacional', active: true, ...extra,
  });
}

async function idToken(uid: string, claims?: Claims): Promise<string> {
  await h.auth.createUser({ uid }).catch(() => undefined);
  if (claims) await h.auth.setCustomUserClaims(uid, claims);
  const r = await fetch('http://localhost:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token: await h.auth.createCustomToken(uid), returnSecureToken: true }),
  });
  return (await r.json()).idToken;
}

async function post(path: string, body: unknown = {}, token?: string, url = base) {
  const r = await fetch(`${url}/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json() };
}

const asGerente = (org: string) => idToken('boss', { master: false, orgs: { [org]: 'Gerente' } });

test('credential-login returns custom token', async () => {
  await member('m1', { passwordSet: true });
  await h.db.doc('member_credentials/m1').set({ hash: await hashPassword('secret1') });
  const r = await post('credential-login', { nameOrEmail: 'm1@x.com', password: 'secret1' });
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
  assert.equal(r.body.isMaster, false);
  assert.equal(r.body.member.id, 'm1');
  assert.equal(r.body.org.id, 'org_a');
  assert.equal(JSON.parse(Buffer.from(r.body.token.split('.')[1], 'base64url').toString()).uid, 'member_m1');
  const bad = await post('credential-login', { nameOrEmail: 'm1@x.com', password: 'wrong12' });
  assert.equal(bad.body.ok, false);
  assert.match(bad.body.error, /Senha incorreta/);
});

test('set-password by Gerente of other org 403', async () => {
  await member('m1');
  const r = await post('set-password', { memberId: 'm1', newPassword: 'newpass1' }, await asGerente('org_b'));
  assert.equal(r.status, 403);
  assert.equal((await h.db.doc('member_credentials/m1').get()).exists, false);
  const op = await post('set-password', { memberId: 'm1', newPassword: 'newpass1' },
    await idToken('op', { master: false, orgs: { org_a: 'Operacional' } }));
  assert.equal(op.status, 403);
  assert.equal((await post('set-password', { memberId: 'm1', newPassword: 'newpass1' })).status, 401);
});

test('set-password by Gerente of same org and by master', async () => {
  await member('m1');
  const short = await post('set-password', { memberId: 'm1', newPassword: '123' }, await asGerente('org_a'));
  assert.deepEqual(short, { status: 400, body: { ok: false, error: 'A nova senha deve ter no mínimo 6 caracteres.' } });
  assert.deepEqual(await post('set-password', { memberId: 'm1', newPassword: 'newpass1' }, await asGerente('org_a')),
    { status: 200, body: { ok: true } });
  assert.equal((await post('credential-login', { nameOrEmail: 'm1@x.com', password: 'newpass1' })).body.ok, true);
  const m = await post('set-password', { memberId: 'm1', newPassword: 'newpass2' }, await idToken('mst', { master: true, orgs: {} }));
  assert.equal(m.status, 200);
});

test('gerente cannot set admin password', async () => {
  await member('a1', { role: 'Admin' });
  const g = await post('set-password', { memberId: 'a1', newPassword: 'newpass1' }, await asGerente('org_a'));
  assert.equal(g.status, 403);
  assert.equal((await h.db.doc('member_credentials/a1').get()).exists, false);
  const admin = await idToken('adm', { master: false, orgs: { org_a: 'Admin' } });
  assert.equal((await post('set-password', { memberId: 'a1', newPassword: 'newpass1' }, admin)).status, 200);
});

test('gerente cannot issue first-access link for admin', async () => {
  await member('a1', { role: 'Admin' });
  assert.equal((await post('first-access/link', { memberId: 'a1' }, await asGerente('org_a'))).status, 403);
  assert.equal((await h.db.collection('first_access_tokens').get()).size, 0);
});

test('set-password self requires current password', async () => {
  await member('m1', { role: 'Admin' });
  await h.db.doc('member_credentials/m1').set({ hash: await hashPassword('secret1') });
  const tok = await idToken('member_m1', { master: false, orgs: { org_a: 'Admin' } });
  assert.equal((await post('set-password', { newPassword: 'newpass1' }, tok)).status, 403);
  assert.equal((await post('set-password', { memberId: 'm1', currentPassword: 'wrong12', newPassword: 'newpass1' }, tok)).status, 403);
  assert.equal((await post('set-password', { currentPassword: 'secret1', newPassword: 'newpass1' }, tok)).status, 200);
  assert.equal((await post('credential-login', { nameOrEmail: 'm1@x.com', password: 'newpass1' })).body.ok, true);
});

test('first-access link then complete', async () => {
  await member('m1');
  assert.equal((await post('first-access/link', { memberId: 'm1' }, await asGerente('org_b'))).status, 403);
  const link = await post('first-access/link', { memberId: 'm1' }, await asGerente('org_a'));
  assert.equal(link.status, 200);
  assert.match(link.body.token, /^[0-9a-f]{64}$/);
  assert.equal(link.body.url, `/?primeiro-acesso=${link.body.token}`);
  assert.equal((await h.db.doc(`first_access_tokens/${link.body.token}`).get()).get('createdBy'), 'boss');

  const check = await fetch(`${base}/first-access/check/${link.body.token}`);
  assert.equal(check.status, 200);
  assert.deepEqual(await check.json(), { memberName: 'User m1', orgName: 'Aguero Inox' });

  const done = await post('first-access/complete', { token: link.body.token, newPassword: 'newpass1' });
  assert.equal(done.status, 200);
  assert.equal(done.body.ok, true);
  assert.equal(typeof done.body.token, 'string');
  const again = await post('first-access/complete', { token: link.body.token, newPassword: 'newpass1' });
  assert.equal(again.status, 400);
  assert.equal((await fetch(`${base}/first-access/check/${link.body.token}`)).status, 400);
  assert.equal((await post('credential-login', { nameOrEmail: 'm1@x.com', password: 'newpass1' })).body.ok, true);
});

test('session syncs claims and returns member and org', async () => {
  await member('m1', { userId: 'g1', role: 'Gerente' });
  const r = await post('session', {}, await idToken('g1'));
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.claims, { master: false, orgs: { org_a: 'Gerente' } });
  assert.equal(r.body.member.id, 'm1');
  assert.equal(r.body.org.name, 'Aguero Inox');
  assert.deepEqual((await h.auth.getUser('g1')).customClaims, r.body.claims);
  assert.equal((await post('session', {})).status, 401);
});

test('session ignores email in body', async () => {
  await member('m1');
  const r = await post('session', { email: 'm1@x.com', emailVerified: true, email_verified: true }, await idToken('g1'));
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { claims: { master: false, orgs: {} }, member: null, org: null });
  assert.equal((await h.db.doc('org_members/m1').get()).get('userId'), undefined);
});

test('revoked token rejected', async () => {
  const tok = await idToken('g1');
  assert.equal((await post('session', {}, tok)).status, 200);
  await new Promise((r) => setTimeout(r, 1100)); // tokensValidAfterTime has 1s resolution
  await h.auth.revokeRefreshTokens('g1');
  assert.deepEqual(await post('session', {}, tok), { status: 401, body: { error: 'invalid_token', code: 'auth/id-token-revoked' } });
});

test('refresh-claims by admin of other org 403', async () => {
  await member('m1');
  const tok = await idToken('boss', { master: false, orgs: { org_b: 'Admin' } });
  assert.equal((await post('refresh-claims/m1', {}, tok)).status, 403);
  assert.equal((await post('refresh-claims/missing', {}, tok)).status, 403);
});

test('refresh-claims recomputes and revokes', async () => {
  await member('m1', { role: 'Supervisor', userId: 'g1' });
  await h.auth.createUser({ uid: 'member_m1' });
  await h.auth.createUser({ uid: 'g1' });
  const tok = await asGerente('org_a');
  assert.deepEqual(await post('refresh-claims/m1', {}, tok), { status: 200, body: { ok: true } });
  assert.deepEqual((await h.auth.getUser('member_m1')).customClaims, { master: false, orgs: { org_a: 'Supervisor' } });
  assert.deepEqual((await h.auth.getUser('g1')).customClaims, { master: false, orgs: { org_a: 'Supervisor' } });
  await h.db.doc('org_members/m1').update({ active: false });
  assert.equal((await post('refresh-claims/m1', {}, tok)).status, 200);
  assert.deepEqual((await h.auth.getUser('member_m1')).customClaims, { master: false, orgs: {} });
  assert.deepEqual((await h.auth.getUser('g1')).customClaims, { master: false, orgs: {} });
  await member('m2'); // never logged in: no Auth user, no error
  assert.equal((await post('refresh-claims/m2', {}, tok)).status, 200);
});

test('refresh-claims never touches a master bound uid', async () => {
  await h.auth.createUser({ uid: 'mst' });
  await h.auth.setCustomUserClaims('mst', { master: true, orgs: {} });
  await member('m1', { userId: 'mst' });
  const validAfter = (await h.auth.getUser('mst')).tokensValidAfterTime;
  const tok = await asGerente('org_a');
  assert.equal((await post('refresh-claims/m1', {}, tok)).status, 200);
  await h.db.doc('org_members/m1').update({ active: false });
  await new Promise((r) => setTimeout(r, 1100)); // so a revoke would visibly move tokensValidAfterTime
  assert.equal((await post('refresh-claims/m1', {}, tok)).status, 200);
  const u = await h.auth.getUser('mst');
  assert.deepEqual(u.customClaims, { master: true, orgs: {} });
  assert.equal(u.tokensValidAfterTime, validAfter);
});

test('set-password for missing member by master returns business error', async () => {
  const r = await post('set-password', { memberId: 'ghost', newPassword: 'newpass1' }, await idToken('mst', { master: true, orgs: {} }));
  assert.deepEqual(r, { status: 400, body: { ok: false, error: 'Cadastro do colaborador não localizado no sistema.' } });
});

test('set-password rate limited per IP', async () => {
  const url = await serve(createAuthRouter());
  for (let i = 0; i < 10; i++) assert.equal((await post('set-password', {}, undefined, url)).status, 401);
  assert.equal((await post('set-password', {}, undefined, url)).status, 429);
});

test('credential-login rate limited per IP', async () => {
  const url = await serve(createAuthRouter());
  for (let i = 0; i < 10; i++) assert.equal((await post('credential-login', {}, undefined, url)).status, 200);
  const r = await post('credential-login', {}, undefined, url);
  assert.equal(r.status, 429);
  assert.equal(r.body.ok, false);
  assert.equal((await post('first-access/complete', {}, undefined, url)).status, 400); // separate bucket
});

test('auth routes 503 when admin disabled', async () => {
  const url = await serve(createAuthRouter(() => null));
  assert.deepEqual(await post('credential-login', {}, undefined, url), { status: 503, body: { error: 'auth_unavailable' } });
  assert.equal((await post('session', {}, 'x', url)).status, 503);
});
