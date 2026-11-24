/**
 * Acesso por área: padrões da empresa (por perfil) e ajustes por pessoa.
 * Só quem tem "Editar" em Configurações muda acessos; um Admin só é ajustado por outro Admin.
 * Toda mudança renova o login das pessoas afetadas (o token leva as áreas). Quem perde
 * algum acesso tem o login antigo derrubado, para a retirada valer na hora.
 */
import type { AuthUser } from './authMiddleware.ts';
import { areaLevelOf } from './authMiddleware.ts';
import {
  AREA_IDS, ROLE_DEFAULTS, resolveAreas, sanitizeOrgDefaults, sanitizeOverrides,
  type AreaLevels, type AreaOverrides,
} from '../src/permissions/areas.ts';
import type { UserRole } from '../src/types/index.ts';

type StoredMember = { id: string; orgId: string; role: UserRole; userName: string; active: boolean; areaOverrides?: unknown };
type OrgDefaults = Partial<Record<UserRole, AreaOverrides>>;

export interface AreaStore {
  getOrgDefaults(orgId: string): Promise<unknown>;
  setOrgDefaults(orgId: string, defaults: OrgDefaults): Promise<void>;
  listMembers(orgId: string): Promise<StoredMember[]>; // só ativos
  getMember(id: string): Promise<StoredMember | null>;
  setMemberOverrides(id: string, overrides: AreaOverrides): Promise<void>;
  refreshClaims(memberId: string): Promise<void>;
  /** Derruba o login já emitido (a pessoa entra de novo e recebe o acesso novo). */
  revokeTokens?(memberId: string): Promise<void>;
}

type Fail = { ok: false; status: number; error: string };
type Result<T = undefined> = { ok: true; data: T } | Fail;

const fail = (status: number, error: string): Fail => ({ ok: false, status, error });
const NO_EDIT = 'Só quem edita Configurações muda os acessos.';

export interface AreaOverview {
  roleDefaults: typeof ROLE_DEFAULTS;
  orgDefaults: OrgDefaults;
  members: Array<{ id: string; userName: string; role: UserRole; areaOverrides: AreaOverrides; levels: AreaLevels }>;
  canEdit: boolean;
}

const lost = (before: AreaLevels, after: AreaLevels) => AREA_IDS.some((a) => after[a] < before[a]);

export function createAreaService(store: AreaStore) {
  const canEdit = (u: AuthUser, org: string) => areaLevelOf(u, org, 'configuracoes') >= 2;
  // Configurações todo mundo abre (tema, dispositivos); a lista de acessos é de quem administra.
  const canRead = (u: AuthUser, org: string) =>
    canEdit(u, org) || (areaLevelOf(u, org, 'configuracoes') >= 1 && ['Admin', 'Gerente'].includes(u.orgs?.[org]));

  /** Renova o login de quem mudou; quem perdeu acesso tem o login antigo derrubado. */
  const apply = async (m: StoredMember, before: AreaLevels, after: AreaLevels) => {
    // Derruba antes de renovar: um login renovado no meio do caminho não fica valendo e depois revogado.
    if (lost(before, after) && store.revokeTokens) await store.revokeTokens(m.id);
    await store.refreshClaims(m.id);
  };

  return {
    async read(u: AuthUser, orgId: string): Promise<Result<AreaOverview>> {
      if (!canRead(u, orgId)) return fail(403, 'Só quem administra a empresa vê os acessos.');
      const orgDefaults = sanitizeOrgDefaults(await store.getOrgDefaults(orgId));
      const members = (await store.listMembers(orgId)).map((m) => {
        const areaOverrides = sanitizeOverrides(m.areaOverrides);
        return { id: m.id, userName: m.userName, role: m.role, areaOverrides, levels: resolveAreas(m.role, orgDefaults, areaOverrides) };
      });
      return { ok: true, data: { roleDefaults: ROLE_DEFAULTS, orgDefaults, members, canEdit: canEdit(u, orgId) } };
    },

    async setOrgDefaults(u: AuthUser, orgId: string, raw: unknown): Promise<Result<{ refreshFailed: number }>> {
      if (!canEdit(u, orgId)) return fail(403, NO_EDIT);
      const current = sanitizeOrgDefaults(await store.getOrgDefaults(orgId));
      const next = sanitizeOrgDefaults(raw);
      // O padrão do perfil Admin só muda por um Admin (senão seria um atalho para mexer nos Admins).
      if (!u.master && u.orgs?.[orgId] !== 'Admin') {
        if (current.Admin) next.Admin = current.Admin;
        else delete next.Admin;
      }
      await store.setOrgDefaults(orgId, next);
      // Renova todos em grupos; uma falha não impede os demais (quem falhar renova no próximo login).
      const members = await store.listMembers(orgId);
      let refreshFailed = 0;
      for (let i = 0; i < members.length; i += 10) {
        const r = await Promise.allSettled(members.slice(i, i + 10).map((m) => {
          const ov = sanitizeOverrides(m.areaOverrides);
          return apply(m, resolveAreas(m.role, current, ov), resolveAreas(m.role, next, ov));
        }));
        refreshFailed += r.filter((x) => x.status === 'rejected').length;
      }
      return { ok: true, data: { refreshFailed } };
    },

    async setMemberOverrides(u: AuthUser, memberId: string, raw: unknown): Promise<Result> {
      const m = await store.getMember(memberId);
      if (!m) return fail(404, 'Pessoa não encontrada.');
      if (!canEdit(u, m.orgId)) return fail(403, NO_EDIT);
      if (m.role === 'Admin' && !u.master && u.orgs?.[m.orgId] !== 'Admin') return fail(403, 'Só um Admin muda o acesso de outro Admin.');
      const defaults = sanitizeOrgDefaults(await store.getOrgDefaults(m.orgId));
      const before = resolveAreas(m.role, defaults, sanitizeOverrides(m.areaOverrides));
      const next = sanitizeOverrides(raw);
      await store.setMemberOverrides(memberId, next);
      await apply(m, before, resolveAreas(m.role, defaults, next));
      return { ok: true, data: undefined };
    },
  };
}
