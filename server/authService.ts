import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { FieldValue, type DocumentSnapshot } from 'firebase-admin/firestore';
import type { AdminHandles } from './firebaseAdmin.ts';
import { hashPassword, verifyPassword } from './passwords.ts';
import type { OrgMember, Organization, UserRole } from '../src/types/index.ts';

export type Role = UserRole;
export type Claims = { master: boolean; orgs: { [orgId: string]: Role } };

type LoginResult =
  | { ok: true; token: string; uid: string; isMaster: boolean; member?: OrgMember; org?: Organization }
  | { ok: false; error: string; isFirstAccess?: boolean; memberName?: string };

const MIN_PASSWORD = 6;
const FIRST_ACCESS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
// Plan said '__master__', but Firestore reserves ids matching __.*__ (INVALID_ARGUMENT).
export const MASTER_CRED_ID = '_master_';
const MASTER_CRED = `member_credentials/${MASTER_CRED_ID}`;
const MASTER_LEGACY = 'system_security/master_auth';
const ERR_SHORT_NEW = 'A nova senha deve ter no mínimo 6 caracteres.';
const ERR_NO_MEMBER = 'Cadastro do colaborador não localizado no sistema.';
const ERR_TOKEN_INVALID = 'Link de primeiro acesso inválido ou já utilizado. Solicite um novo ao administrador.';
const ERR_TOKEN_EXPIRED = 'Link de primeiro acesso expirado. Solicite um novo ao administrador.';

const norm = (s: string | null | undefined) => (s ?? '').toLowerCase().trim();
const sha256 = (s: string) => createHash('sha256').update(s).digest();
const sameText = (a: string, b: string) => timingSafeEqual(sha256(a), sha256(b));
const now = () => new Date().toISOString();

export const masterEmails = () =>
  (process.env.MASTER_EMAILS || 'gustavo@agueroinox.com.br').split(',').map(norm).filter(Boolean);
const fallbackMasterUid = (email: string) => `master_${sha256(norm(email)).toString('hex').slice(0, 16)}`;
const isMasterEmail = (email?: string | null) => !!email && masterEmails().includes(norm(email));

const orgOf = (m: Partial<OrgMember> & { organizationId?: string }) => m.orgId || m.organizationId || '';
const memberUid = (m: OrgMember) => m.userId || `member_${m.id}`;
const toMember = (d: DocumentSnapshot): OrgMember => {
  const { passwordHash: _omit, ...data } = d.data() as OrgMember;
  return { ...data, id: d.id, orgId: orgOf(data) };
};

async function ensureUser(h: AdminHandles, uid: string, props: { email?: string; displayName?: string }) {
  try {
    await h.auth.getUser(uid);
  } catch (e) {
    if ((e as { code?: string }).code !== 'auth/user-not-found') throw e;
    await h.auth.createUser({ uid, ...props });
  }
}

async function mintMemberToken(h: AdminHandles, m: OrgMember): Promise<{ uid: string; token: string }> {
  const uid = memberUid(m);
  await ensureUser(h, uid, { displayName: m.userName });
  await h.auth.setCustomUserClaims(uid, await buildClaims(h, uid, m.userEmail));
  return { uid, token: await h.auth.createCustomToken(uid) };
}

export async function resolveMember(
  h: AdminHandles, nameOrEmail: string, company?: string,
): Promise<{ member: OrgMember; org: Organization } | { error: string }> {
  const clean = (nameOrEmail ?? '').trim();
  const id = norm(clean);
  if (!id) return { error: 'Por favor, informe seu E-mail ou Nome cadastrado.' };
  const members = h.db.collection('org_members');
  let found: DocumentSnapshot | undefined =
    (await members.where('userEmail', '==', id).where('active', '==', true).limit(1).get()).docs[0];
  if (!found) {
    // shortcut: full scan of active members for case-insensitive email/userName, like the old client; index a normalized field if org_members grows large
    found = (await members.where('active', '==', true).get()).docs.find((d) => {
      const m = d.data();
      return norm(m.userEmail) === id || norm(m.userName) === id;
    });
  }
  const notFound = { error: `O e-mail ou usuário '${clean}' não possui cadastro ativo em nenhuma empresa. Solicite seu acesso ao administrador.` };
  if (!found) return notFound;
  const member = toMember(found);
  const orgSnap = member.orgId ? await h.db.doc(`organizations/${member.orgId}`).get() : undefined;
  if (!orgSnap?.exists) return notFound;
  const org = { ...orgSnap.data(), id: orgSnap.id } as Organization;

  const co = norm(company);
  if (co && norm(org.slug) !== co && norm(org.name) !== co) {
    return { error: `Este e-mail está vinculado exclusivamente à empresa '${org.name}'.` };
  }
  return { member, org };
}

export async function migratePlaintextPassword(h: AdminHandles, memberId: string): Promise<boolean> {
  const ref = h.db.doc(`org_members/${memberId}`);
  const plain = (await ref.get()).get('passwordHash');
  if (typeof plain !== 'string' || !plain) return false;
  const batch = h.db.batch();
  batch.set(h.db.doc(`member_credentials/${memberId}`), { hash: await hashPassword(plain), updatedAt: now() });
  batch.update(ref, { passwordHash: FieldValue.delete() });
  await batch.commit();
  return true;
}

async function masterLogin(h: AdminHandles, email: string, password: string): Promise<LoginResult> {
  if (!password || password.trim().length < MIN_PASSWORD) {
    return { ok: false, error: 'Por favor, informe sua Senha de acesso Master (mínimo 6 caracteres).' };
  }
  const credHash = (await h.db.doc(MASTER_CRED).get()).get('hash');
  let valid: boolean;
  if (typeof credHash === 'string') {
    valid = await verifyPassword(password, credHash);
  } else {
    const legacyRef = h.db.doc(MASTER_LEGACY);
    const legacy = (await legacyRef.get()).get('passwordHash');
    if (typeof legacy !== 'string' || !legacy) {
      return { ok: false, error: 'Senha master ainda não definida. Entre com "Continuar com Google" e defina sua senha.' };
    }
    valid = sameText(password, legacy);
    if (valid) {
      const batch = h.db.batch();
      batch.set(h.db.doc(MASTER_CRED), { hash: await hashPassword(legacy), updatedAt: now() });
      batch.update(legacyRef, { passwordHash: FieldValue.delete() });
      await batch.commit();
    }
  }
  if (!valid) {
    return { ok: false, error: 'Senha do Usuário Master incorreta. Utilize sua senha cadastrada ou clique em "Continuar com Google".' };
  }

  let uid: string;
  try {
    uid = (await h.auth.getUserByEmail(email)).uid;
  } catch (e) {
    if ((e as { code?: string }).code !== 'auth/user-not-found') throw e;
    uid = fallbackMasterUid(email);
    await ensureUser(h, uid, { email });
  }
  await h.auth.setCustomUserClaims(uid, { master: true, orgs: {} } satisfies Claims);
  return { ok: true, token: await h.auth.createCustomToken(uid), uid, isMaster: true };
}

export async function credentialLogin(
  h: AdminHandles, input: { nameOrEmail: string; password: string; company?: string },
): Promise<LoginResult> {
  const { password = '' } = input;
  if (isMasterEmail(input.nameOrEmail)) return masterLogin(h, norm(input.nameOrEmail), password);

  const resolved = await resolveMember(h, input.nameOrEmail, input.company);
  if ('error' in resolved) return { ok: false, error: resolved.error };
  const { member, org } = resolved;

  const [raw, cred] = await Promise.all([
    h.db.doc(`org_members/${member.id}`).get(),
    h.db.doc(`member_credentials/${member.id}`).get(),
  ]);
  const plain = raw.get('passwordHash');
  const hasPlain = typeof plain === 'string' && !!plain;
  const credHash = cred.get('hash');
  if (!hasPlain && typeof credHash !== 'string') {
    return {
      ok: false, isFirstAccess: true, memberName: member.userName,
      error: 'Primeiro acesso detectado: Cadastre sua senha pessoal para continuar.',
    };
  }
  if (!password || password.trim().length < MIN_PASSWORD) {
    return { ok: false, error: 'Por favor, informe sua senha de acesso (mínimo 6 caracteres).' };
  }
  // Plaintext left by the legacy client is newer than any stored hash (setPassword deletes it), so it wins.
  const valid = hasPlain ? sameText(password, plain) : await verifyPassword(password, credHash);
  if (!valid) {
    return { ok: false, error: 'Senha incorreta. Verifique os dados digitados ou utilize "Continuar com Google".' };
  }
  if (hasPlain) await migratePlaintextPassword(h, member.id);

  const { uid, token } = await mintMemberToken(h, member);
  return { ok: true, token, uid, isMaster: false, member, org };
}

async function activeMemberDocs(h: AdminHandles, uid: string, email?: string | null) {
  const members = h.db.collection('org_members');
  const byUid = (await members.where('userId', '==', uid).where('active', '==', true).get()).docs;
  const byEmail = email
    ? (await members.where('userEmail', '==', norm(email)).where('active', '==', true).get()).docs
    : [];
  const seen = new Set(byUid.map((d) => d.id));
  return [...byUid, ...byEmail.filter((d) => !seen.has(d.id))];
}

function claimsFor(uid: string, email: string | null | undefined, docs: DocumentSnapshot[]): Claims {
  const master = isMasterEmail(email) || masterEmails().some((e) => fallbackMasterUid(e) === uid);
  if (master) return { master: true, orgs: {} };
  const orgs: Claims['orgs'] = {};
  for (const d of docs) {
    const m = toMember(d);
    if (m.orgId) orgs[m.orgId] = m.role;
  }
  return { master: false, orgs };
}

export async function buildClaims(h: AdminHandles, uid: string, email?: string | null): Promise<Claims> {
  return claimsFor(uid, email, await activeMemberDocs(h, uid, email));
}

export async function syncSession(
  h: AdminHandles, uid: string, email?: string | null,
): Promise<{ claims: Claims; member: OrgMember | null }> {
  const docs = await activeMemberDocs(h, uid, email);
  await Promise.all(docs.filter((d) => !d.get('userId')).map((d) => d.ref.update({ userId: uid, updatedAt: now() })));
  const claims = claimsFor(uid, email, docs);
  await h.auth.setCustomUserClaims(uid, claims);
  return { claims, member: docs[0] ? { ...toMember(docs[0]), userId: docs[0].get('userId') || uid } : null };
}

export async function setPassword(h: AdminHandles, memberId: string, newPassword: string): Promise<void> {
  if (!newPassword || newPassword.trim().length < MIN_PASSWORD) throw new Error(ERR_SHORT_NEW);
  const ref = h.db.doc(`org_members/${memberId}`);
  if (!(await ref.get()).exists) throw new Error(ERR_NO_MEMBER);
  const at = now();
  const batch = h.db.batch();
  batch.set(h.db.doc(`member_credentials/${memberId}`), { hash: await hashPassword(newPassword), updatedAt: at });
  // Also drop any legacy plaintext so it can never shadow the new hash.
  batch.update(ref, { passwordSet: true, passwordSetAt: at, updatedAt: at, passwordHash: FieldValue.delete() });
  await batch.commit();
}

export async function issueFirstAccessToken(
  h: AdminHandles, memberId: string, createdBy: string,
): Promise<{ token: string; url: string; expiresAt: string }> {
  if (!(await h.db.doc(`org_members/${memberId}`).get()).exists) throw new Error(ERR_NO_MEMBER);
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + FIRST_ACCESS_TTL_MS).toISOString();
  await h.db.doc(`first_access_tokens/${token}`).set({ memberId, createdBy, createdAt: now(), expiresAt, used: false });
  const base = (process.env.APP_URL || '').replace(/\/+$/, '');
  return { token, url: `${base}/?primeiro-acesso=${token}`, expiresAt };
}

const TOKEN_RE = /^[0-9a-f]{64}$/;

function tokenError(snap: DocumentSnapshot): string | null {
  if (!snap.exists || snap.get('used')) return ERR_TOKEN_INVALID;
  if (!(Date.parse(snap.get('expiresAt')) > Date.now())) return ERR_TOKEN_EXPIRED;
  return null;
}

export async function checkFirstAccessToken(
  h: AdminHandles, token: string,
): Promise<{ memberName: string; orgName: string } | { error: string }> {
  if (typeof token !== 'string' || !TOKEN_RE.test(token)) return { error: ERR_TOKEN_INVALID };
  const snap = await h.db.doc(`first_access_tokens/${token}`).get();
  const err = tokenError(snap);
  if (err) return { error: err };
  const mSnap = await h.db.doc(`org_members/${snap.get('memberId')}`).get();
  if (!mSnap.exists || !mSnap.get('active')) return { error: ERR_NO_MEMBER };
  const m = toMember(mSnap);
  const org = m.orgId ? await h.db.doc(`organizations/${m.orgId}`).get() : undefined;
  return { memberName: m.userName, orgName: org?.get('name') ?? '' };
}

export async function completeFirstAccess(
  h: AdminHandles, token: string, newPassword: string,
): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  if (!newPassword || newPassword.trim().length < MIN_PASSWORD) return { ok: false, error: ERR_SHORT_NEW };
  if (typeof token !== 'string' || !TOKEN_RE.test(token)) return { ok: false, error: ERR_TOKEN_INVALID };
  const tokenRef = h.db.doc(`first_access_tokens/${token}`);
  // Consume atomically so two concurrent submits cannot both succeed.
  const consumed = await h.db.runTransaction(async (tx): Promise<{ error: string } | { memberId: string }> => {
    const snap = await tx.get(tokenRef);
    const err = tokenError(snap);
    if (err) return { error: err };
    const mSnap = await tx.get(h.db.doc(`org_members/${snap.get('memberId')}`));
    if (!mSnap.exists || !mSnap.get('active')) return { error: ERR_NO_MEMBER };
    tx.update(tokenRef, { used: true, usedAt: now() });
    return { memberId: mSnap.id };
  });
  if ('error' in consumed) return { ok: false, error: consumed.error };
  await setPassword(h, consumed.memberId, newPassword);
  const member = toMember(await h.db.doc(`org_members/${consumed.memberId}`).get());
  return { ok: true, token: (await mintMemberToken(h, member)).token };
}
