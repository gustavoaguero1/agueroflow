import { Router, type Request, type Response } from 'express';
import { getAdmin } from './firebaseAdmin.ts';
import { moduleLevelOf, orgIdOf } from './authMiddleware.ts';
import { resolveAreas } from '../src/permissions/areas.ts';
import {
  MODULE_PERMISSION_DETAILS, resolveModuleLevels, sanitizeModuleDefaults, sanitizeModuleOverrides,
} from '../src/permissions/modules.ts';
import { syncModuleAccessForMember, syncModuleAccessForOrganization, moduleAccessDocId } from './moduleAccessService.ts';
import type { UserRole } from '../src/types/index.ts';

const validId = (v: unknown): v is string => typeof v === 'string' && !!v && !v.includes('/');
const responseError = (res: Response, status: number, error: string) => res.status(status).json({ ok: false, error });
const canManage = async (req: Request, orgId: string) => !!req.user?.master || await moduleLevelOf(req.user, orgId, 'configuracoes', getAdmin()) >= 4;

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
    if (req.user?.master) return res.json({ ok: true, modules: {}, explicitModules: [] });
    const store = db();
    if (!store) return responseError(res, 503, 'Serviço de autenticação indisponível.');
    const snap = await store.doc(`org_module_access/${moduleAccessDocId(orgId, req.user!.uid)}`).get();
    return res.json({ ok: true, modules: snap.exists ? snap.get('modules') || {} : {}, explicitModules: snap.exists ? snap.get('explicitModules') || [] : [] });
  }));

  router.get('/module-access', wrap(async (req, res) => {
    const orgId = orgIdOf(req);
    if (!validId(orgId) || (!req.user?.master && !req.user?.orgs?.[orgId])) {
      return responseError(res, 403, 'Empresa não autorizada.');
    }
    if (!(await canManage(req, orgId))) return responseError(res, 403, 'Somente quem administra Configurações pode gerenciar acessos granulares.');
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
    return res.json({ ok: true, catalog: MODULE_PERMISSION_DETAILS, areaDefaults: org.areaDefaults || {}, roleDefaults, members: people, canEdit: await canManage(req, orgId) });
  }));

  router.put('/module-access/roles', wrap(async (req, res) => {
    const orgId = orgIdOf(req);
    if (!validId(orgId) || (!req.user?.master && !req.user?.orgs?.[orgId])) {
      return responseError(res, 403, 'Empresa não autorizada.');
    }
    if (!(await canManage(req, orgId))) return responseError(res, 403, 'Somente quem administra Configurações pode alterar os padrões.');
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
    if (failed > 0) return responseError(res, 503, `Padrões salvos, mas ${failed} sincronização(ões) de acesso falharam. Repita a operação para concluir a atualização.`);
    return res.json({ ok: true, refreshFailed: 0 });
  }));

  router.put('/members/:id/module-access', wrap(async (req, res) => {
    const orgId = orgIdOf(req);
    const memberId = req.params.id;
    if (!validId(orgId) || !validId(memberId)) return responseError(res, 400, 'Pessoa ou empresa não informada.');
    if (!req.user?.master && !req.user?.orgs?.[orgId]) return responseError(res, 403, 'Empresa não autorizada.');
    if (!(await canManage(req, orgId))) return responseError(res, 403, 'Somente quem administra Configurações pode alterar acessos.');
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
    if (member.role === 'Admin') overrides.configuracoes = 4;
    await ref.update({ moduleAccessOverrides: overrides, updatedAt: new Date().toISOString() });
    try {
      await syncModuleAccessForMember(getAdmin()!, memberId);
    } catch (error) {
      console.error('[module-access] falha ao sincronizar grant individual:', error);
      return responseError(res, 503, 'O acesso foi salvo, mas a permissão ainda não foi sincronizada. Repita a operação.');
    }
    // Publica a marca somente depois de gravar o grant, para o listener do usuário nunca ler dados antigos.
    await ref.update({ areasUpdatedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    return res.json({ ok: true });
  }));

  return router;
}
