import type { AuthUser } from './authMiddleware.ts';
import { areaLevelOf } from './authMiddleware.ts';
import {
  hasPermissionCustomization,
  resolvePermissionMatrix,
  sanitizeAccessProfiles,
  sanitizePermissionOverrides,
  type AccessProfile,
  type PermissionMap,
} from '../src/permissions/granular.ts';
import { resolveAreas, sanitizeOrgDefaults, sanitizeOverrides } from '../src/permissions/areas.ts';
import type { UserRole } from '../src/types/index.ts';

export type AccessMember = {
  id: string;
  orgId: string;
  role: UserRole;
  userName: string;
  active: boolean;
  accessProfileId?: string;
  permissionOverrides?: unknown;
};

export interface AccessStore {
  getProfiles(orgId: string): Promise<unknown>;
  setProfiles(orgId: string, profiles: AccessProfile[]): Promise<void>;
  listMembers(orgId: string): Promise<AccessMember[]>;
  getMember(memberId: string): Promise<AccessMember | null>;
  setMemberAccess(memberId: string, profileId: string | null, overrides: PermissionMap): Promise<void>;
  getAreaDefaults(orgId: string): Promise<unknown>;
  refreshClaims(memberId: string): Promise<void>;
  revokeTokens?(memberId: string): Promise<void>;
}

type Fail = { ok: false; status: number; error: string };
type Result<T = undefined> = { ok: true; data: T } | Fail;
const fail = (status: number, error: string): Fail => ({ ok: false, status, error });
const NO_EDIT = 'Só quem administra Configurações pode alterar os modelos e acessos individuais.';

function isAdmin(u: AuthUser, org: string) {
  return u.master || u.orgs?.[org] === 'Admin';
}
function canEdit(u: AuthUser, org: string) {
  return areaLevelOf(u, org, 'configuracoes') >= 2;
}
function canRead(u: AuthUser, org: string) {
  return canEdit(u, org) || (
    areaLevelOf(u, org, 'configuracoes') >= 1 &&
    ['Admin', 'Gerente'].includes(u.orgs?.[org])
  );
}
function isMoreRestrictive(before: ReturnType<typeof resolvePermissionMatrix>, after: ReturnType<typeof resolvePermissionMatrix>) {
  return Object.keys(before).some((key) => {
    const section = key as keyof typeof before;
    const a = before[section], b = after[section];
    return (['view', 'create', 'edit', 'delete', 'approve', 'manage'] as const).some((action) =>
      a[action] === true && b[action] !== true
    ) || (a.scope === 'all' && b.scope !== 'all') || (a.scope === 'assigned' && b.scope === 'own');
  });
}

export function createAccessService(store: AccessStore) {
  async function effectiveFor(member: AccessMember, profilesRaw: unknown, defaultsRaw: unknown) {
    const profiles = sanitizeAccessProfiles(profilesRaw);
    const profile = profiles.find((p) => p.id === member.accessProfileId) || null;
    const areas = resolveAreas(member.role, sanitizeOrgDefaults(defaultsRaw), sanitizeOverrides(undefined));
    return resolvePermissionMatrix(areas, profile, sanitizePermissionOverrides(member.permissionOverrides));
  }

  return {
    async read(u: AuthUser, orgId: string): Promise<Result<{
      profiles: AccessProfile[];
      members: Array<Pick<AccessMember, 'id' | 'userName' | 'role' | 'accessProfileId'> & { permissionOverrides: PermissionMap }>;
      canEdit: boolean;
    }>> {
      if (!canRead(u, orgId)) return fail(403, 'Você não tem permissão para consultar os modelos de acesso.');
      const [profilesRaw, members] = await Promise.all([store.getProfiles(orgId), store.listMembers(orgId)]);
      return {
        ok: true,
        data: {
          profiles: sanitizeAccessProfiles(profilesRaw),
          members: members.map((m) => ({
            id: m.id,
            userName: m.userName,
            role: m.role,
            ...(m.accessProfileId ? { accessProfileId: m.accessProfileId } : {}),
            permissionOverrides: sanitizePermissionOverrides(m.permissionOverrides),
          })),
          canEdit: canEdit(u, orgId),
        },
      };
    },

    async setProfiles(u: AuthUser, orgId: string, raw: unknown): Promise<Result<{ refreshFailed: number }>> {
      if (!canEdit(u, orgId)) return fail(403, NO_EDIT);
      const next = sanitizeAccessProfiles(raw);
      const names = next.map((p) => p.name.toLocaleLowerCase('pt-BR'));
      if (new Set(names).size !== names.length) return fail(400, 'Já existe um modelo com esse nome.');
      const [currentRaw, members, areaDefaults] = await Promise.all([
        store.getProfiles(orgId), store.listMembers(orgId), store.getAreaDefaults(orgId),
      ]);
      const current = sanitizeAccessProfiles(currentRaw);
      const ids = new Set(next.map((p) => p.id));
      const removedAssigned = members.find((m) => m.accessProfileId && !ids.has(m.accessProfileId));
      if (removedAssigned) return fail(409, 'Antes de excluir um modelo, atribua outro modelo ou remova o vínculo de todas as pessoas que o utilizam.');
      if (!isAdmin(u, orgId)) {
        const adminUsesChangedProfile = members.some((m) => m.role === 'Admin' && m.accessProfileId &&
          JSON.stringify(current.find((p) => p.id === m.accessProfileId)) !== JSON.stringify(next.find((p) => p.id === m.accessProfileId)));
        if (adminUsesChangedProfile) return fail(403, 'Somente um Admin pode alterar um modelo utilizado por outro Admin.');
      }
      const changedIds = new Set<string>();
      for (const oldProfile of current) {
        if (JSON.stringify(oldProfile) !== JSON.stringify(next.find((p) => p.id === oldProfile.id))) changedIds.add(oldProfile.id);
      }
      for (const newProfile of next) if (!current.some((p) => p.id === newProfile.id)) changedIds.add(newProfile.id);
      await store.setProfiles(orgId, next);
      const affected = members.filter((m) => !!m.accessProfileId && changedIds.has(m.accessProfileId));
      let refreshFailed = 0;
      for (let i = 0; i < affected.length; i += 10) {
        const outcomes = await Promise.allSettled(affected.slice(i, i + 10).map(async (m) => {
          const before = await effectiveFor(m, current, areaDefaults);
          const after = await effectiveFor(m, next, areaDefaults);
          if (isMoreRestrictive(before, after) && store.revokeTokens) await store.revokeTokens(m.id);
          await store.refreshClaims(m.id);
        }));
        refreshFailed += outcomes.filter((x) => x.status === 'rejected').length;
      }
      return { ok: true, data: { refreshFailed } };
    },

    async setMember(u: AuthUser, memberId: string, profileIdRaw: unknown, overridesRaw: unknown): Promise<Result> {
      const m = await store.getMember(memberId);
      if (!m || !m.active) return fail(404, 'Pessoa ativa não encontrada.');
      if (!canEdit(u, m.orgId)) return fail(403, NO_EDIT);
      if (m.role === 'Admin' && !isAdmin(u, m.orgId)) return fail(403, 'Só um Admin pode alterar o acesso de outro Admin.');
      const [profilesRaw, areaDefaultsRaw] = await Promise.all([
        store.getProfiles(m.orgId), store.getAreaDefaults(m.orgId),
      ]);
      const profiles = sanitizeAccessProfiles(profilesRaw);
      const profileId = typeof profileIdRaw === 'string' && profileIdRaw.trim() ? profileIdRaw.trim() : null;
      if (profileId && !profiles.some((p) => p.id === profileId)) return fail(400, 'O modelo de acesso selecionado não existe nesta empresa.');
      const overrides = sanitizePermissionOverrides(overridesRaw);
      const before = await effectiveFor(m, profiles, areaDefaultsRaw);
      const nextMember = { ...m, accessProfileId: profileId || undefined, permissionOverrides: overrides };
      const after = await effectiveFor(nextMember, profiles, areaDefaultsRaw);
      await store.setMemberAccess(memberId, profileId, overrides);
      if (isMoreRestrictive(before, after) && store.revokeTokens) await store.revokeTokens(memberId);
      await store.refreshClaims(memberId);
      return { ok: true, data: undefined };
    },

    async clearMember(u: AuthUser, memberId: string): Promise<Result> {
      return this.setMember(u, memberId, null, {});
    },
  };
}
