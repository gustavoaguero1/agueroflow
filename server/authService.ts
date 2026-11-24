import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { FieldValue, type DocumentSnapshot, type Transaction, type WriteBatch } from 'firebase-admin/firestore';
import type { AdminHandles } from './firebaseAdmin.ts';
import { hashPassword, verifyPassword } from './passwords.ts';
import type { OrgMember, Organization, UserRole } from '../src/types/index.ts';
import { encodeAreas, resolveAreas, sanitizeOrgDefaults, sanitizeOverrides } from '../src/permissions/areas.ts';

export type Role = UserRole;
/** `areas`: níveis por área em cada empresa, codificados por encodeAreas (um dígito por área). */
export type Claims = { master: boolean; orgs: { [orgId: string]: Role }; areas?: { [orgId: string]: string } };

type MemberAccess = { orgId: string; role: Role; areaOverrides?: unknown };

/** Perfil e áreas de cada empresa da pessoa: padrão do perfil → padrão da empresa → ajuste da pessoa. */
export function claimsFromMembers(members: MemberAccess[], orgDefaults: Record<string, unknown>): Claims {
  const orgs: Claims['orgs'] = {};
  const areas: NonNullable<Claims['areas']> = {};
  for (const m of members) {
    if (!m.orgId) continue;
    orgs[m.orgId] = m.role;
    const code = encodeAreas(resolveAreas(m.role, sanitizeOrgDefaults(orgDefaults[m.orgId]), sanitizeOverrides(m.areaOverrides)));
    // Igual ao padrão do perfil: fica fora do token (quem lê cai no mesmo padrão).
    if (code !== encodeAreas(resolveAreas(m.role))) areas[m.orgId] = code;
  }
  return Object.keys(areas).length ? { master: false, orgs, areas } : { master: false, orgs };
}

type LoginResult =
  | { ok: true; token: string; uid: string; isMaster: boolean; member?: OrgMember; org?: Organization }
  | { ok: false; error: string; isFirstAccess?: boolean; memberName?: string };

const MIN_PASSWORD = 6;
const FIRST_ACCESS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
// Plan said '__master__', but Firestore reserves ids matching __.*__ (INVALID_ARGUMENT).
export const MASTER_CRED_ID = '_master_';
const MASTER_CRED = `member_credentials/${MASTER_CRED_ID}`;
const MASTER_LEGACY = 'system_security/master_auth';
export const ERR_SHORT_NEW = 'A nova senha deve ter no mínimo 6 caracteres.';
export const ERR_NO_MEMBER = 'Cadastro do colaborador não localizado no sistema.';
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
  // Always member_<id>: userId/userEmail on org_members are admin-writable, so they must not pick the uid or grant claims.
  // Only our master path mints master_* uids, which is what makes the uid check in claimsFor safe.
  const uid = `member_${m.id}`;
  await ensureUser(h, uid, { displayName: m.userName });
  await h.auth.setCustomUserClaims(uid, await buildClaims(h, uid));
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

function writePassword(w: Transaction | WriteBatch, h: AdminHandles, memberId: string, hash: string, flags: object) {
  const at = now();
  (w as WriteBatch).set(h.db.doc(`member_credentials/${memberId}`), { hash, updatedAt: at });
  // Always drop legacy plaintext so it can never shadow the new hash.
  (w as WriteBatch).update(h.db.doc(`org_members/${memberId}`), { ...flags, passwordHash: FieldValue.delete() });
}

/** Migrates only if the stored plaintext still equals `expectedPlain` (when given), atomically. */
export async function migratePlaintextPassword(h: AdminHandles, memberId: string, expectedPlain?: string): Promise<boolean> {
  const ref = h.db.doc(`org_members/${memberId}`);
  const plain = expectedPlain ?? (await ref.get()).get('passwordHash');
  if (typeof plain !== 'string' || !plain) return false;
  const hash = await hashPassword(plain);
  return h.db.runTransaction(async (tx) => {
    if ((await tx.get(ref)).get('passwordHash') !== plain) return false;
    writePassword(tx, h, memberId, hash, {});
    return true;
  });
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

  // Reuse an existing Auth user only if Google verified it; anyone can sign up an unverified account with this email.
  const existing = await h.auth.getUserByEmail(email).catch((e) => {
    if ((e as { code?: string }).code !== 'auth/user-not-found') throw e;
    return null;
  });
  let uid: string;
  if (existing?.emailVerified && existing.providerData.some((p) => p.providerId === 'google.com')) {
    uid = existing.uid;
  } else {
    uid = fallbackMasterUid(email);
    await ensureUser(h, uid, { displayName: email }); // no email: it may already belong to another Auth user
  }
  await h.auth.setCustomUserClaims(uid, { master: true, orgs: {} } satisfies Claims);
  return { ok: true, token: await h.auth.createCustomToken(uid), uid, isMaster: true };
}

type Secret = { plain: string } | { hash: string };

async function memberSecret(h: AdminHandles, memberId: string): Promise<Secret | null> {
  const [raw, cred] = await Promise.all([
    h.db.doc(`org_members/${memberId}`).get(),
    h.db.doc(`member_credentials/${memberId}`).get(),
  ]);
  const plain = raw.get('passwordHash');
  // Plaintext left by the legacy client is newer than any stored hash (setPassword deletes it), so it wins.
  if (typeof plain === 'string' && plain) return { plain };
  const hash = cred.get('hash');
  return typeof hash === 'string' ? { hash } : null;
}

async function checkSecret(h: AdminHandles, memberId: string, s: Secret, password: string): Promise<boolean> {
  if ('hash' in s) return verifyPassword(password, s.hash);
  if (!sameText(password, s.plain)) return false;
  await migratePlaintextPassword(h, memberId, s.plain);
  return true;
}

/** True only if the member has a password and `password` matches it (migrating legacy plaintext). */
export async function verifyMemberPassword(h: AdminHandles, memberId: string, password: string): Promise<boolean> {
  const s = await memberSecret(h, memberId);
  return !!s && !!password && checkSecret(h, memberId, s, password);
}

export async function credentialLogin(
  h: AdminHandles, input: { nameOrEmail: string; password: string; company?: string },
): Promise<LoginResult> {
  const { password = '' } = input;
  if (isMasterEmail(input.nameOrEmail)) return masterLogin(h, norm(input.nameOrEmail), password);

  const resolved = await resolveMember(h, input.nameOrEmail, input.company);
  if ('error' in resolved) return { ok: false, error: resolved.error };
  const { member, org } = resolved;

  const secret = await memberSecret(h, member.id);
  if (!secret) {
    return {
      ok: false, isFirstAccess: true, memberName: member.userName,
      error: 'Primeiro acesso detectado: Cadastre sua senha pessoal para continuar.',
    };
  }
  if (!password || password.trim().length < MIN_PASSWORD) {
    return { ok: false, error: 'Por favor, informe sua senha de acesso (mínimo 6 caracteres).' };
  }
  if (!(await checkSecret(h, member.id, secret, password))) {
    return { ok: false, error: 'Senha incorreta. Verifique os dados digitados ou utilize "Continuar com Google".' };
  }

  const { uid, token } = await mintMemberToken(h, member);
  return { ok: true, token, uid, isMaster: false, member, org };
}

// Old clients wrote placeholder userIds (uid_manual_<ts>, usr_...) that never named a real Auth user.
const PLACEHOLDER_UID = /^(uid_manual_|usr_)/;

/** A userId binds an email doc only if it names an existing Auth user other than a placeholder. */
async function unboundOrMine(h: AdminHandles, uid: string, bound: unknown): Promise<boolean> {
  if (!bound || bound === uid) return true;
  if (typeof bound !== 'string' || PLACEHOLDER_UID.test(bound)) return true;
  return h.auth.getUser(bound).then(() => false, (e) => { if (isNotFound(e)) return true; throw e; });
}

// `email` must already be verified by the caller; email matches bound to another existing uid are skipped.
async function activeMemberDocs(h: AdminHandles, uid: string, email: string | null) {
  const members = h.db.collection('org_members');
  const byUid = (await members.where('userId', '==', uid).where('active', '==', true).get()).docs;
  const emailDocs = email
    ? (await members.where('userEmail', '==', norm(email)).where('active', '==', true).get()).docs
    : [];
  const ok = await Promise.all(emailDocs.map((d) => unboundOrMine(h, uid, d.get('userId'))));
  const seen = new Set(byUid.map((d) => d.id));
  return [...byUid, ...emailDocs.filter((d, i) => ok[i] && !seen.has(d.id))];
}

async function claimsFor(h: AdminHandles, uid: string, email: string | null, docs: DocumentSnapshot[]): Promise<Claims> {
  const master = isMasterEmail(email) || masterEmails().some((e) => fallbackMasterUid(e) === uid);
  return master ? { master: true, orgs: {} } : orgClaims(h, docs);
}

async function orgClaims(h: AdminHandles, docs: DocumentSnapshot[]): Promise<Claims> {
  const members = docs.map((d) => ({ ...toMember(d), areaOverrides: d.get('areaOverrides') }));
  const orgIds = [...new Set(members.map((m) => m.orgId).filter((o) => o && !o.includes('/')))];
  const orgDocs = await Promise.all(orgIds.map((o) => h.db.doc(`organizations/${o}`).get()));
  const defaults = Object.fromEntries(orgDocs.map((d, i) => [orgIds[i], d.exists ? d.get('areaDefaults') : undefined]));
  return claimsFromMembers(members, defaults);
}

// Password users (uid member_<id>) carry exactly their own active doc; no email lookup, no binding.
async function ownMemberDocs(h: AdminHandles, uid: string): Promise<DocumentSnapshot[] | null> {
  const id = /^member_(.+)$/.exec(uid)?.[1];
  if (!id) return null;
  if (id.includes('/')) return [];
  const d = await h.db.doc(`org_members/${id}`).get();
  return d.exists && d.get('active') === true ? [d] : [];
}

const isNotFound = (e: unknown) => (e as { code?: string }).code === 'auth/user-not-found';

export async function buildClaims(
  h: AdminHandles, uid: string, email?: string | null, emailVerified = false,
): Promise<Claims> {
  const own = await ownMemberDocs(h, uid);
  if (own) return orgClaims(h, own);
  const e = emailVerified ? email ?? null : null;
  return claimsFor(h, uid, e, await activeMemberDocs(h, uid, e));
}

export async function syncSession(
  h: AdminHandles, uid: string, rawEmail?: string | null, emailVerified = false,
): Promise<{ claims: Claims; member: OrgMember | null }> {
  const own = await ownMemberDocs(h, uid);
  if (own) {
    const claims = await orgClaims(h, own);
    await h.auth.setCustomUserClaims(uid, claims);
    return { claims, member: own[0] ? toMember(own[0]) : null };
  }
  const email = emailVerified ? rawEmail ?? null : null;
  const docs = await activeMemberDocs(h, uid, email);
  await Promise.all(docs.filter((d) => d.get('userId') !== uid).map((d) => d.ref.update({ userId: uid, updatedAt: now() })));
  const claims = await claimsFor(h, uid, email, docs);
  await h.auth.setCustomUserClaims(uid, claims);
  return { claims, member: docs[0] ? { ...toMember(docs[0]), userId: uid } : null };
}

// userId on org_members is admin-writable: never let it reach a master identity (forced logout / claim overwrite).
async function boundUser(h: AdminHandles, memberId: string) {
  const bound = (await h.db.doc(`org_members/${memberId}`).get()).get('userId');
  if (typeof bound !== 'string' || !bound || bound === `member_${memberId}`) return null;
  const u = await h.auth.getUser(bound).catch((e) => { if (isNotFound(e)) return null; throw e; });
  return u && u.customClaims?.master !== true ? u : null;
}

async function setClaimsIfExists(h: AdminHandles, uid: string, claims: () => Promise<Claims>) {
  try {
    await h.auth.setCustomUserClaims(uid, await claims());
  } catch (e) {
    if (!isNotFound(e)) throw e; // never logged in
  }
}

/** Call after a member's role/org changes. Inactive or missing members get their sessions revoked. */
export async function refreshMemberClaims(h: AdminHandles, memberId: string): Promise<void> {
  const snap = await h.db.doc(`org_members/${memberId}`).get();
  if (!snap.exists || snap.get('active') !== true) return revokeMemberSessions(h, memberId);
  const uid = `member_${memberId}`;
  await setClaimsIfExists(h, uid, () => buildClaims(h, uid));
  const bound = await boundUser(h, memberId);
  if (bound) await setClaimsIfExists(h, bound.uid, () => buildClaims(h, bound.uid, bound.email, bound.emailVerified));
}

/**
 * Call after deactivating/removing a member. Clears the password identity's claims, recomputes the bound
 * Google uid's claims (its next syncSession restores email-based ones), and revokes both refresh tokens.
 */
export async function revokeMemberSessions(h: AdminHandles, memberId: string): Promise<void> {
  const uid = `member_${memberId}`;
  const bound = await boundUser(h, memberId);
  const targets: [string, () => Promise<Claims>][] = [[uid, async () => ({ master: false, orgs: {} })]];
  if (bound) targets.push([bound.uid, () => buildClaims(h, bound.uid)]);
  for (const [u, claims] of targets) {
    try {
      await h.auth.setCustomUserClaims(u, await claims());
      await h.auth.revokeRefreshTokens(u);
    } catch (e) {
      if (!isNotFound(e)) throw e; // never logged in: nothing to revoke
    }
  }
}

export async function setPassword(h: AdminHandles, memberId: string, newPassword: string): Promise<void> {
  if (!newPassword || newPassword.trim().length < MIN_PASSWORD) throw new Error(ERR_SHORT_NEW);
  const ref = h.db.doc(`org_members/${memberId}`);
  if (!(await ref.get()).exists) throw new Error(ERR_NO_MEMBER);
  const batch = h.db.batch();
  writePassword(batch, h, memberId, await hashPassword(newPassword), passwordSetFlags());
  await batch.commit();
}

const passwordSetFlags = (at = now()) => ({ passwordSet: true, passwordSetAt: at, updatedAt: at });

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
  const hash = await hashPassword(newPassword);
  // Consume the token and write the password in one transaction: single use, and never burned on a failed write.
  const consumed = await h.db.runTransaction(async (tx): Promise<{ error: string } | { memberId: string }> => {
    const snap = await tx.get(tokenRef);
    const err = tokenError(snap);
    if (err) return { error: err };
    const mSnap = await tx.get(h.db.doc(`org_members/${snap.get('memberId')}`));
    if (!mSnap.exists || !mSnap.get('active')) return { error: ERR_NO_MEMBER };
    tx.update(tokenRef, { used: true, usedAt: now() });
    writePassword(tx, h, mSnap.id, hash, passwordSetFlags());
    return { memberId: mSnap.id };
  });
  if ('error' in consumed) return { ok: false, error: consumed.error };
  const member = toMember(await h.db.doc(`org_members/${consumed.memberId}`).get());
  return { ok: true, token: (await mintMemberToken(h, member)).token };
}
