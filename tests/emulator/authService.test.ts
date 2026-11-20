import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { getAdmin, type AdminHandles } from '../../server/firebaseAdmin.ts';
import { hashPassword, verifyPassword } from '../../server/passwords.ts';
import {
  credentialLogin, syncSession, migratePlaintextPassword, revokeMemberSessions, issueFirstAccessToken, checkFirstAccessToken, completeFirstAccess,
} from '../../server/authService.ts';

const PROJECT = 'demo-agueroflow';
const MASTER = 'gustavo@agueroinox.com.br';
const h = getAdmin() as AdminHandles;
assert.ok(h, 'firebase-admin must init against the emulator');

beforeEach(async () => {
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

const tokenUid = (t: string) => JSON.parse(Buffer.from(t.split('.')[1], 'base64url').toString()).uid as string;

test('logs in with migrated hash', async () => {
  await member('m1', { passwordSet: true });
  await h.db.doc('member_credentials/m1').set({ hash: await hashPassword('secret1') });
  const r = await credentialLogin(h, { nameOrEmail: 'M1@x.com', password: 'secret1' });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.uid, 'member_m1');
  assert.equal(tokenUid(r.token), 'member_m1');
  assert.equal(r.isMaster, false);
  assert.equal(r.org?.id, 'org_a');
  assert.deepEqual((await h.auth.getUser('member_m1')).customClaims, { master: false, orgs: { org_a: 'Operacional' } });
});

test('rejects wrong password', async () => {
  await member('m1', { passwordSet: true });
  await h.db.doc('member_credentials/m1').set({ hash: await hashPassword('secret1') });
  const r = await credentialLogin(h, { nameOrEmail: 'm1@x.com', password: 'wrong12' });
  assert.deepEqual(r, { ok: false, error: 'Senha incorreta. Verifique os dados digitados ou utilize "Continuar com Google".' });
});

test('migrates plaintext password on first login', async () => {
  await member('m1', { passwordHash: 'plain99', passwordSet: true, userId: 'uid_m1' });
  assert.equal((await credentialLogin(h, { nameOrEmail: 'User m1', password: 'bad999' })).ok, false);
  const r = await credentialLogin(h, { nameOrEmail: 'User m1', password: 'plain99' });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.uid, 'member_m1');
  const m = (await h.db.doc('org_members/m1').get()).data()!;
  assert.equal('passwordHash' in m, false);
  const cred = (await h.db.doc('member_credentials/m1').get()).data()!;
  assert.match(cred.hash, /^scrypt\$/);
  assert.equal(await verifyPassword('plain99', cred.hash), true);
  assert.equal((await credentialLogin(h, { nameOrEmail: 'User m1', password: 'plain99' })).ok, true);
});

test('first access detected when no password', async () => {
  await member('m1');
  const r = await credentialLogin(h, { nameOrEmail: 'm1@x.com', password: '' });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.isFirstAccess, true);
  assert.equal(r.memberName, 'User m1');
  assert.equal('token' in r, false);
});

test('inactive member rejected', async () => {
  await member('m1', { active: false });
  await h.db.doc('member_credentials/m1').set({ hash: await hashPassword('secret1') });
  const r = await credentialLogin(h, { nameOrEmail: 'm1@x.com', password: 'secret1' });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /não possui cadastro ativo/);
});

test('company filter mismatch rejected', async () => {
  await member('m1');
  await h.db.doc('member_credentials/m1').set({ hash: await hashPassword('secret1') });
  const r = await credentialLogin(h, { nameOrEmail: 'm1@x.com', password: 'secret1', company: 'beta' });
  assert.deepEqual(r, { ok: false, error: "Este e-mail está vinculado exclusivamente à empresa 'Aguero Inox'." });
  assert.equal((await credentialLogin(h, { nameOrEmail: 'm1@x.com', password: 'secret1', company: 'AGUERO-INOX' })).ok, true);
});

test('master hardcoded passwords rejected', async () => {
  await h.db.doc('system_security/master_auth').set({ passwordHash: 'x9Secret' });
  const r = await credentialLogin(h, { nameOrEmail: MASTER, password: 'admin123' });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /Senha do Usuário Master incorreta/);
});

test('master plaintext migrated', async () => {
  await h.db.doc('system_security/master_auth').set({ passwordHash: 'x9Secret', masterEmail: MASTER });
  const r = await credentialLogin(h, { nameOrEmail: MASTER.toUpperCase(), password: 'x9Secret' });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.isMaster, true);
  assert.match(r.uid, /^master_[0-9a-f]{16}$/);
  assert.deepEqual((await h.auth.getUser(r.uid)).customClaims, { master: true, orgs: {} });
  const sec = (await h.db.doc('system_security/master_auth').get()).data()!;
  assert.equal('passwordHash' in sec, false);
  const cred = (await h.db.doc('member_credentials/_master_').get()).data()!;
  assert.equal(await verifyPassword('x9Secret', cred.hash), true);
  const again = await credentialLogin(h, { nameOrEmail: MASTER, password: 'x9Secret' });
  assert.equal(again.ok && again.uid, r.uid);
});

test('master uses existing auth uid', async () => {
  await h.auth.importUsers([{ uid: 'google_master', email: MASTER, emailVerified: true,
    providerData: [{ uid: 'g-sub', providerId: 'google.com', email: MASTER }] }]);
  await h.db.doc('member_credentials/_master_').set({ hash: await hashPassword('x9Secret') });
  const r = await credentialLogin(h, { nameOrEmail: MASTER, password: 'x9Secret' });
  assert.equal(r.ok && r.uid, 'google_master');
});

test('master without any password gets Google-only error', async () => {
  const r = await credentialLogin(h, { nameOrEmail: MASTER, password: 'whatever1' });
  assert.deepEqual(r, { ok: false, error: 'Senha master ainda não definida. Entre com "Continuar com Google" e defina sua senha.' });
});

test('session resolves member by uid without email', async () => {
  await member('m1', { userId: 'u1', role: 'Gerente' });
  await h.auth.createUser({ uid: 'u1' });
  const r = await syncSession(h, 'u1');
  assert.equal(r.member?.id, 'm1');
  assert.deepEqual(r.claims, { master: false, orgs: { org_a: 'Gerente' } });
  assert.deepEqual((await h.auth.getUser('u1')).customClaims, r.claims);
});

test('binds userId by email on session', async () => {
  await member('m1');
  await h.auth.createUser({ uid: 'g1', email: 'm1@x.com' });
  const r = await syncSession(h, 'g1', 'M1@X.com', true);
  assert.equal(r.member?.id, 'm1');
  assert.equal((await h.db.doc('org_members/m1').get()).data()!.userId, 'g1');
});

test('claims include every active membership with role', async () => {
  await member('m1', { userId: 'u1', role: 'Admin' });
  await h.db.doc('org_members/m2').set({ id: 'm2', organizationId: 'org_b', userEmail: 'u1@x.com', userName: 'U', role: 'Supervisor', active: true });
  await member('m3', { orgId: 'org_c', userId: 'u1', active: false });
  await h.auth.createUser({ uid: 'u1', email: 'u1@x.com' });
  const r = await syncSession(h, 'u1', 'u1@x.com', true);
  assert.deepEqual(r.claims, { master: false, orgs: { org_a: 'Admin', org_b: 'Supervisor' } });
  const master = await syncSession(h, 'u1', MASTER, true);
  assert.equal(master.claims.master, true);
});

test('first access token single use', async () => {
  await member('m1');
  const { token, url, expiresAt } = await issueFirstAccessToken(h, 'm1', 'admin_uid');
  assert.match(token, /^[0-9a-f]{64}$/);
  assert.equal(url, `/?primeiro-acesso=${token}`);
  assert.ok(Date.parse(expiresAt) > Date.now() + 6.9 * 86400e3);
  assert.deepEqual(await checkFirstAccessToken(h, token), { memberName: 'User m1', orgName: 'Aguero Inox' });
  assert.equal((await completeFirstAccess(h, token, 'newpass1')).ok, true);
  assert.equal((await completeFirstAccess(h, token, 'other12')).ok, false);
  assert.ok('error' in (await checkFirstAccessToken(h, token)));
  assert.ok('error' in (await checkFirstAccessToken(h, 'nope/../x')));
});

test('first access token expired after 7 days', async () => {
  await member('m1');
  const { token } = await issueFirstAccessToken(h, 'm1', 'admin_uid');
  await h.db.doc(`first_access_tokens/${token}`).update({ expiresAt: new Date(Date.now() - 1000).toISOString() });
  assert.ok('error' in (await checkFirstAccessToken(h, token)));
  const r = await completeFirstAccess(h, token, 'newpass1');
  assert.equal(r.ok, false);
  assert.equal((await h.db.doc('member_credentials/m1').get()).exists, false);
});

test('completeFirstAccess sets password and returns token', async () => {
  await member('m1', { passwordHash: 'oldplain' });
  const { token } = await issueFirstAccessToken(h, 'm1', 'admin_uid');
  assert.equal((await completeFirstAccess(h, token, '123')).ok, false); // too short, token not consumed
  const r = await completeFirstAccess(h, token, 'newpass1');
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(tokenUid(r.token), 'member_m1');
  const m = (await h.db.doc('org_members/m1').get()).data()!;
  assert.equal(m.passwordSet, true);
  assert.equal('passwordHash' in m, false);
  assert.equal((await credentialLogin(h, { nameOrEmail: 'm1@x.com', password: 'newpass1' })).ok, true);
});

test('unverified or password-only auth user with master email is not used as master uid', async () => {
  await h.auth.createUser({ uid: 'attacker', email: MASTER, password: 'whatever1' });
  await h.db.doc('member_credentials/_master_').set({ hash: await hashPassword('x9Secret') });
  const r = await credentialLogin(h, { nameOrEmail: MASTER, password: 'x9Secret' });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.match(r.uid, /^master_[0-9a-f]{16}$/);
  assert.equal((await h.auth.getUser('attacker')).customClaims, undefined);
});

test('member with master email does not get master claim', async () => {
  await member('m1', { userEmail: MASTER });
  await h.db.doc('member_credentials/m1').set({ hash: await hashPassword('secret1') });
  const r = await credentialLogin(h, { nameOrEmail: 'User m1', password: 'secret1' });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.isMaster, false);
  assert.deepEqual((await h.auth.getUser(r.uid)).customClaims, { master: false, orgs: { org_a: 'Operacional' } });
});

test('member email of other org does not grant that org', async () => {
  await member('m1', { userEmail: 'victim@x.com' });
  await h.db.doc('member_credentials/m1').set({ hash: await hashPassword('secret1') });
  await h.db.doc('org_members/v1').set({ id: 'v1', orgId: 'org_b', userEmail: 'victim@x.com', userName: 'Victim', role: 'Admin', active: true });
  const r = await credentialLogin(h, { nameOrEmail: 'User m1', password: 'secret1' });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.deepEqual((await h.auth.getUser(r.uid)).customClaims, { master: false, orgs: { org_a: 'Operacional' } });
  assert.equal((await h.db.doc('org_members/v1').get()).get('userId'), undefined);
});

test('unverified email grants nothing', async () => {
  await member('m1');
  await h.auth.createUser({ uid: 'g1', email: 'm1@x.com' });
  const r = await syncSession(h, 'g1', 'm1@x.com');
  assert.deepEqual(r, { claims: { master: false, orgs: {} }, member: null });
  assert.equal((await h.db.doc('org_members/m1').get()).get('userId'), undefined);
  await h.auth.createUser({ uid: 'g2', email: MASTER });
  assert.equal((await syncSession(h, 'g2', MASTER, false)).claims.master, false);
});

test('email-matched doc bound to other uid ignored', async () => {
  await member('m1', { userId: 'other' });
  await h.auth.createUser({ uid: 'g1', email: 'm1@x.com' });
  const r = await syncSession(h, 'g1', 'm1@x.com', true);
  assert.deepEqual(r, { claims: { master: false, orgs: {} }, member: null });
  assert.equal((await h.db.doc('org_members/m1').get()).get('userId'), 'other');
});

test('first access failure does not consume token', async () => {
  await member('m1');
  const { token } = await issueFirstAccessToken(h, 'm1', 'admin_uid');
  await h.db.doc('org_members/m1').delete();
  const r = await completeFirstAccess(h, token, 'newpass1');
  assert.equal(r.ok, false);
  assert.equal((await h.db.doc(`first_access_tokens/${token}`).get()).get('used'), false);
  assert.equal((await h.db.doc('member_credentials/m1').get()).exists, false);
});

test('migration skips when plaintext changed', async () => {
  await member('m1', { passwordHash: 'newer99' });
  assert.equal(await migratePlaintextPassword(h, 'm1', 'older99'), false);
  assert.equal((await h.db.doc('org_members/m1').get()).get('passwordHash'), 'newer99');
  assert.equal((await h.db.doc('member_credentials/m1').get()).exists, false);
  assert.equal(await migratePlaintextPassword(h, 'm1', 'newer99'), true);
});

test('credential login ignores member.userId', async () => {
  const masterUid = (await (async () => {
    await h.db.doc('member_credentials/_master_').set({ hash: await hashPassword('x9Secret') });
    const m = await credentialLogin(h, { nameOrEmail: MASTER, password: 'x9Secret' });
    return m.ok ? m.uid : '';
  })());
  assert.match(masterUid, /^master_/);
  await h.auth.createUser({ uid: 'victim' });
  for (const [id, userId] of [['m1', masterUid], ['m2', 'victim']]) {
    await member(id, { userId });
    await h.db.doc(`member_credentials/${id}`).set({ hash: await hashPassword('secret1') });
    const r = await credentialLogin(h, { nameOrEmail: `${id}@x.com`, password: 'secret1' });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.uid, `member_${id}`);
    assert.equal(tokenUid(r.token), `member_${id}`);
    assert.deepEqual((await h.auth.getUser(r.uid)).customClaims, { master: false, orgs: { org_a: 'Operacional' } });
  }
  assert.deepEqual((await h.auth.getUser(masterUid)).customClaims, { master: true, orgs: {} });
  assert.equal((await h.auth.getUser('victim')).customClaims, undefined);
});

test('first access ignores member.userId', async () => {
  await member('m1', { userId: 'victim' });
  await h.auth.createUser({ uid: 'victim' });
  const { token } = await issueFirstAccessToken(h, 'm1', 'admin_uid');
  const r = await completeFirstAccess(h, token, 'newpass1');
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(tokenUid(r.token), 'member_m1');
  assert.equal((await h.auth.getUser('victim')).customClaims, undefined);
});

test('member login claims come only from its own doc', async () => {
  await member('m1');
  await h.db.doc('member_credentials/m1').set({ hash: await hashPassword('secret1') });
  await h.db.doc('org_members/x1').set({ id: 'x1', orgId: 'org_b', userId: 'member_m1', userEmail: 'x@x.com', userName: 'X', role: 'Admin', active: true });
  const r = await credentialLogin(h, { nameOrEmail: 'm1@x.com', password: 'secret1' });
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual((await h.auth.getUser(r.uid)).customClaims, { master: false, orgs: { org_a: 'Operacional' } });
});

test('password login then sync keeps claims', async () => {
  await member('m1', { role: 'Gerente' });
  await h.db.doc('member_credentials/m1').set({ hash: await hashPassword('secret1') });
  const r = await credentialLogin(h, { nameOrEmail: 'm1@x.com', password: 'secret1' });
  assert.equal(r.ok, true);
  const s = await syncSession(h, 'member_m1');
  assert.deepEqual(s.claims, { master: false, orgs: { org_a: 'Gerente' } });
  assert.equal(s.member?.id, 'm1');
  assert.deepEqual((await h.auth.getUser('member_m1')).customClaims, s.claims);
  assert.equal((await h.db.doc('org_members/m1').get()).get('userId'), undefined);
});

test('inactive member sync clears claims', async () => {
  await member('m1');
  await h.db.doc('member_credentials/m1').set({ hash: await hashPassword('secret1') });
  assert.equal((await credentialLogin(h, { nameOrEmail: 'm1@x.com', password: 'secret1' })).ok, true);
  await h.db.doc('org_members/m1').update({ active: false });
  assert.deepEqual(await syncSession(h, 'member_m1'), { claims: { master: false, orgs: {} }, member: null });
  assert.deepEqual((await h.auth.getUser('member_m1')).customClaims, { master: false, orgs: {} });
});

test('revokeMemberSessions clears claims', async () => {
  await member('m1', { userId: 'g1' });
  await member('m2', { orgId: 'org_b', userId: 'g1', role: 'Admin' });
  await h.db.doc('member_credentials/m1').set({ hash: await hashPassword('secret1') });
  await h.auth.createUser({ uid: 'g1', email: 'm1@x.com', emailVerified: true });
  await syncSession(h, 'g1', 'm1@x.com', true);
  assert.equal((await credentialLogin(h, { nameOrEmail: 'm1@x.com', password: 'secret1' })).ok, true);
  const t0 = Math.floor(Date.now() / 1000) * 1000; // tokensValidAfterTime has 1s resolution
  await h.db.doc('org_members/m1').update({ active: false });
  await revokeMemberSessions(h, 'm1');
  assert.ok(Date.parse((await h.auth.getUser('g1')).tokensValidAfterTime ?? '') >= t0);
  const mu = await h.auth.getUser('member_m1');
  assert.deepEqual(mu.customClaims, { master: false, orgs: {} });
  assert.ok(Date.parse(mu.tokensValidAfterTime ?? '') >= t0);
  assert.deepEqual((await h.auth.getUser('g1')).customClaims, { master: false, orgs: { org_b: 'Admin' } });
  await revokeMemberSessions(h, 'm2'); // bound uid exists, member_m2 never logged in: no throw
});
