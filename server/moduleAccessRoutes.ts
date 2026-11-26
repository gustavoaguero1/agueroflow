import { Router, type Request, type Response } from 'express';
import { getAdmin } from './firebaseAdmin.ts';
import { areaLevelOf, orgIdOf } from './authMiddleware.ts';
import { resolveAreas } from '../src/permissions/areas.ts';
import {
  MODULE_PERMISSION_DETAILS, resolveModuleLevels, sanitizeModuleDefaults, sanitizeModuleOverrides,
} from '../src/permissions/modules.ts';
import { syncModuleAccessForMember, syncModuleAccessForOrganization, moduleAccessDocId } from './moduleAccessService.ts';
import type { UserRole } from '../src/types/index.ts';

const validId = (v: unknown): v is string => typeof v === 'string' && !!v && !v.includes('/');
const responseError = (res: Response, status: number, error: string) => res.status(status).json({ ok: false, error });
const canManage = (req: Request, orgId: string) => !!req.user?.master || areaLevelOf(req.user, orgId, 'configuracoes') >= 2;

export function createModuleAccessRouter(): Router {
  const router = Router();
  const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response) =>
    fn(req, res).catch((error) => {
      console.error('[module-access] erro:', error);
      res.status(500).json({ ok: false, error: 'Não foi possível processar as permissões dos submódulos.' });
    });
  const db = () => getAdmin()?.db ?? null;

  router.get('/module-access/self', wrap(async (req, res) => {
    const orgId = orgIdOf(req);
    if (!validId(orgId) || (!req.user?.master && !req.user?.orgs?.[orgId])) {
      return responseError(res, 403, 'Empresa não autorizada.');
    }
    if (req.user?.master) return res.json({ ok: true, modules: {} });
    const store = db();
    if (!store) return responseError(res, 503, 'Serviço de autenticação indisponível.');
    const snap = await store.doc(`org_module_access/${moduleAccessDocId(orgId, req.user!.uid)}`).get();
    return res.json({ ok: true, modules: snap.exists ? snap.get('modules') || {} : {} });
  }));

  router.get('/module-access', wrap(async (req, res) => {
    const orgId = orgIdOf(req);
    if (!validId(orgId) || (!req.user?.master && !req.user?.orgs?.[orgId])) {
      return responseError(res, 403, 'Empresa não autorizada.');
    }
    if (!canManage(req, orgId)) return responseError(res, 403, 'Somente quem administra Configurações pode gerenciar acessos granulares.');
    const store = db();
    if (!store) return responseError(res, 503, 'Serviço de autenticação indisponível.');
    const [orgSnap, a, b] = await Promise.all([
      store.doc(`organizations/${orgId}`).get(),
      store.collection('org_members').where('orgId', '==', orgId).where('active', '==', true).get(),
      store.collection('org_members').where('organizationId', '==', orgId).where('active', '==', true).get(),
    ]);
    const org = orgSnap.data() || {};
    const roleDefaults = sanitizeModuleDefaults(org.moduleAccessDefaults);
    const members = new Map([...a.docs, ...b.docs].map((d) => [d.id, d]));
    const people = [...members.values()].map((d) => {
      const member = d.data();
      const role = member.role as UserRole;
      const areaLevels = resolveAreas(role, org.areaDefaults, member.areaOverrides);
      const overrides = sanitizeModuleOverrides(member.moduleAccessOverrides);
      return {
        id: d.id,
        userName: member.userName || member.userEmail || d.id,
        role,
        overrides,
        levels: resolveModuleLevels(role, areaLevels, roleDefaults, overrides),
      };
    }).sort((x, y) => x.userName.localeCompare(y.userName, 'pt-BR'));
    return res.json({ ok: true, catalog: MODULE_PERMISSION_DETAILS, areaDefaults: org.areaDefaults || {}, roleDefaults, members: people, canEdit: canManage(req, orgId) });
  }));

  router.put('/module-access/roles', wrap(async (req, res) => {
    const orgId = orgIdOf(req);
    if (!validId(orgId) || (!req.user?.master && !req.user?.orgs?.[orgId])) {
      return responseError(res, 403, 'Empresa não autorizada.');
    }
    if (!canManage(req, orgId)) return responseError(res, 403, 'Somente quem administra Configurações pode alterar os padrões.');
    const store = db();
    if (!store) return responseError(res, 503, 'Serviço de autenticação indisponível.');
    const currentSnap = await store.doc(`organizations/${orgId}`).get();
    const current = sanitizeModuleDefaults(currentSnap.get('moduleAccessDefaults'));
    const next = sanitizeModuleDefaults(req.body?.defaults);
    if (!req.user?.master && req.user?.orgs?.[orgId] !== 'Admin') {
      if (current.Admin) next.Admin = current.Admin;
      else delete next.Admin;
    }
    await store.doc(`organizations/${orgId}`).set({ moduleAccessDefaults: next, updatedAt: new Date().toISOString() }, { merge: true });
    const failed = await syncModuleAccessForOrganization(getAdmin()!, orgId);
    return res.json({ ok: true, refreshFailed: failed });
  }));

  router.put('/members/:id/module-access', wrap(async (req, res) => {
    const orgId = orgIdOf(req);
    const memberId = req.params.id;
    if (!validId(orgId) || !validId(memberId)) return responseError(res, 400, 'Pessoa ou empresa não informada.');
    if (!req.user?.master && !req.user?.orgs?.[orgId]) return responseError(res, 403, 'Empresa não autorizada.');
    if (!canManage(req, orgId)) return responseError(res, 403, 'Somente quem administra Configurações pode alterar acessos.');
    const store = db();
    if (!store) return responseError(res, 503, 'Serviço de autenticação indisponível.');
    const ref = store.doc(`org_members/${memberId}`);
    const snap = await ref.get();
    if (!snap.exists) return responseError(res, 404, 'Pessoa não encontrada.');
    const member = snap.data() || {};
    if (String(member.orgId || member.organizationId || '') !== orgId) return responseError(res, 404, 'Pessoa não encontrada nesta empresa.');
    if (member.role === 'Admin' && !req.user?.master && req.user?.orgs?.[orgId] !== 'Admin') {
      return responseError(res, 403, 'Somente um Admin pode alterar as permissões granulares de outro Admin.');
    }
    const overrides = sanitizeModuleOverrides(req.body?.overrides);
    await ref.update({ moduleAccessOverrides: overrides, updatedAt: new Date().toISOString() });
    await syncModuleAccessForMember(getAdmin()!, memberId);
    // Publica a marca somente depois de gravar o grant, para o listener do usuário nunca ler dados antigos.
    await ref.update({ areasUpdatedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    return res.json({ ok: true });
  }));

  return router;
}
