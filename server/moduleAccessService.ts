import type { AdminHandles } from './firebaseAdmin.ts';
import { resolveAreas } from '../src/permissions/areas.ts';
import {
  resolveModuleLevels, sanitizeModuleDefaults, sanitizeModuleOverrides,
  type ModuleAccessDefaults, type ModuleAccessOverrides,
} from '../src/permissions/modules.ts';
import type { UserRole } from '../src/types/index.ts';

export const moduleAccessDocId = (orgId: string, uid: string) => `${orgId}__${uid}`;

const memberOrg = (data: FirebaseFirestore.DocumentData) => String(data.orgId || data.organizationId || '');

function identities(memberId: string, member: FirebaseFirestore.DocumentData): string[] {
  const ids = new Set<string>([`member_${memberId}`]);
  const bound = member.userId;
  if (typeof bound === 'string' && bound && !bound.startsWith('uid_manual_') && !bound.startsWith('usr_')) {
    ids.add(bound);
  }
  return [...ids];
}

/** Escreve somente no servidor o grant consultado pelas regras Firestore e pelos middlewares da API. */
export async function syncModuleAccessForMember(h: AdminHandles, memberId: string): Promise<void> {
  const memberRef = h.db.doc(`org_members/${memberId}`);
  const snap = await memberRef.get();
  if (!snap.exists || snap.get('active') !== true) return;
  const member = snap.data() || {};
  const orgId = memberOrg(member);
  if (!orgId || orgId.includes('/')) return;
  const orgSnap = await h.db.doc(`organizations/${orgId}`).get();
  const org = orgSnap.data() || {};
  const role = member.role as UserRole;
  const areaLevels = resolveAreas(role, org.areaDefaults, member.areaOverrides);
  const orgDefaults = sanitizeModuleDefaults(org.moduleAccessDefaults);
  const personal = sanitizeModuleOverrides(member.moduleAccessOverrides);
  const explicitModules = [...new Set([
    ...Object.keys(orgDefaults[role] || {}),
    ...Object.keys(personal),
  ])];
  const hasOverrides = explicitModules.length > 0;
  const refs = identities(memberId, member).map((uid) => h.db.doc(`org_module_access/${moduleAccessDocId(orgId, uid)}`));

  if (!hasOverrides) {
    await Promise.all(refs.map((ref) => ref.delete().catch(() => undefined)));
    return;
  }

  const modules = resolveModuleLevels(role, areaLevels, orgDefaults, personal);
  await Promise.all(refs.map((ref) => ref.set({
    orgId,
    uid: ref.id.slice(orgId.length + 2),
    modules,
    explicitModules,
    updatedAt: new Date().toISOString(),
  })));
}

export async function syncModuleAccessForOrganization(h: AdminHandles, orgId: string): Promise<number> {
  const members = h.db.collection('org_members');
  const [byOrg, byLegacyOrg] = await Promise.all([
    members.where('orgId', '==', orgId).where('active', '==', true).get(),
    members.where('organizationId', '==', orgId).where('active', '==', true).get(),
  ]);
  const docs = new Map([...byOrg.docs, ...byLegacyOrg.docs].map((d) => [d.id, d]));
  const ids = [...docs.keys()];
  const results = await Promise.allSettled(ids.map((id) => syncModuleAccessForMember(h, id)));
  // Notifica os clientes conectados para que leiam o grant atualizado sem novo login.
  const stamp = new Date().toISOString();
  const stamps = await Promise.allSettled(ids.map((id) =>
    members.doc(id).update({ areasUpdatedAt: stamp, updatedAt: stamp }),
  ));
  return results.filter((r) => r.status === 'rejected').length
    + stamps.filter((r) => r.status === 'rejected').length;
}

export function resolvedMemberModuleAccess(
  role: UserRole,
  areaDefaults: unknown,
  areaOverrides: unknown,
  orgModuleDefaults: unknown,
  memberModuleOverrides: unknown,
) {
  const areaLevels = resolveAreas(role, areaDefaults as never, areaOverrides as never);
  return resolveModuleLevels(
    role,
    areaLevels,
    sanitizeModuleDefaults(orgModuleDefaults),
    sanitizeModuleOverrides(memberModuleOverrides),
  );
}

export type { ModuleAccessDefaults, ModuleAccessOverrides };
