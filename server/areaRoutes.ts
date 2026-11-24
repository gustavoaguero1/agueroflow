/**
 * Rotas do acesso por área (montadas em /api/org, depois do login):
 *   GET  /areas?orgId=        → padrões do perfil, da empresa e o acesso de cada pessoa
 *   PUT  /areas               → { orgId, defaults } padrões da empresa por perfil
 *   PUT  /members/:id/areas   → { areaOverrides } ajuste de uma pessoa
 */
import { Router, type Request, type Response } from 'express';
import { getAdmin, type AdminHandles } from './firebaseAdmin.ts';
import { orgIdOf } from './authMiddleware.ts';
import { refreshMemberClaims, revokeMemberTokens } from './authService.ts';
import { createAreaService, type AreaStore } from './areaService.ts';

const validId = (id: unknown): id is string => typeof id === 'string' && !!id && !id.includes('/');
const orgOfDoc = (d: FirebaseFirestore.DocumentData | undefined) => String(d?.orgId || d?.organizationId || '');

export function firestoreAreaStore(h: AdminHandles): AreaStore {
  const members = h.db.collection('org_members');
  const toStored = (d: FirebaseFirestore.DocumentSnapshot) => {
    const x = d.data() || {};
    return { id: d.id, orgId: orgOfDoc(x), role: x.role, userName: x.userName || x.userEmail || '', active: x.active === true, areaOverrides: x.areaOverrides };
  };
  return {
    getOrgDefaults: async (o) => (await h.db.doc(`organizations/${o}`).get()).get('areaDefaults'),
    setOrgDefaults: async (o, d) => { await h.db.doc(`organizations/${o}`).set({ areaDefaults: d, updatedAt: new Date().toISOString() }, { merge: true }); },
    listMembers: async (o) => {
      const [a, b] = await Promise.all([
        members.where('orgId', '==', o).where('active', '==', true).get(),
        members.where('organizationId', '==', o).where('active', '==', true).get(),
      ]);
      const seen = new Set<string>();
      return [...a.docs, ...b.docs].filter((d) => !seen.has(d.id) && seen.add(d.id)).map(toStored);
    },
    getMember: async (id) => {
      const d = await members.doc(id).get();
      return d.exists ? toStored(d) : null;
    },
    setMemberOverrides: async (id, ov) => { await members.doc(id).update({ areaOverrides: ov }); },
    refreshClaims: async (id) => {
      await refreshMemberClaims(h, id);
      // Depois do token novo: o navegador da pessoa vê a marca e renova o login.
      await members.doc(id).update({ areasUpdatedAt: new Date().toISOString() });
    },
    revokeTokens: (id) => revokeMemberTokens(h, id),
  };
}

export function createAreaRouter(getH: () => AdminHandles | null = getAdmin): Router {
  const r = Router();
  const svc = (res: Response) => {
    const h = getH();
    if (!h) { res.status(503).json({ error: 'auth_unavailable' }); return null; }
    return createAreaService(firestoreAreaStore(h));
  };
  const send = (res: Response, out: { ok: boolean; status?: number; error?: string; data?: unknown }) =>
    out.ok ? res.json({ ok: true, ...(out.data ? { data: out.data } : {}) }) : res.status(out.status || 400).json({ ok: false, error: out.error });
  const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response) =>
    fn(req, res).catch((e) => { console.error('area route error:', e); res.status(500).json({ error: 'internal' }); });

  r.get('/areas', wrap(async (req, res) => {
    const org = orgIdOf(req);
    if (!validId(org)) return res.status(400).json({ ok: false, error: 'Empresa não informada.' });
    const s = svc(res);
    if (s) send(res, await s.read(req.user!, org));
  }));

  r.put('/areas', wrap(async (req, res) => {
    const org = orgIdOf(req);
    if (!validId(org)) return res.status(400).json({ ok: false, error: 'Empresa não informada.' });
    const s = svc(res);
    if (s) send(res, await s.setOrgDefaults(req.user!, org, req.body?.defaults));
  }));

  r.put('/members/:id/areas', wrap(async (req, res) => {
    if (!validId(req.params.id)) return res.status(400).json({ ok: false, error: 'Pessoa não informada.' });
    const s = svc(res);
    if (s) send(res, await s.setMemberOverrides(req.user!, req.params.id, req.body?.areaOverrides));
  }));

  return r;
}
