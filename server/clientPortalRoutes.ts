import crypto from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { requireModuleAccess } from './authMiddleware.ts';
import { getAdmin, type AdminHandles } from './firebaseAdmin.ts';
import { evaluatePortalGrantAccess, sanitizePortalScopes } from '../src/services/clientPortalRules.ts';
import { compileProjectDataBook } from '../src/services/industrialQualityRules.ts';
import type { ClientPortalAuditEntry, ClientPortalGrant } from '../src/types/clientPortal.ts';
import type { UserRole } from '../src/types/index.ts';

const validId = (v: unknown): v is string =>
  typeof v === 'string' && v.trim().length > 0 && v.length <= 180 && !v.includes('/');

const orgOf = (d: Record<string, any> | undefined): string =>
  String(d?.orgId ?? d?.organizationId ?? '');

const sha256Hex = (raw: string): string => crypto.createHash('sha256').update(raw).digest('hex');

async function resolveExternalGrant(admin: AdminHandles, req: Request): Promise<ClientPortalGrant | null> {
  const token = typeof req.headers['x-portal-token'] === 'string' ? req.headers['x-portal-token'].trim() : '';
  if (!token || token.length < 16) return null;
  const hash = sha256Hex(token);
  const snap = await admin.db.collection('client_portal_grants').where('tokenHash', '==', hash).limit(1).get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { ...(doc.data() as ClientPortalGrant), id: doc.id };
}

export function createClientPortalRouter(getH: () => AdminHandles | null = getAdmin): Router {
  const router = Router();

  // ---- Internal grant management (requires authenticated internal member) ----
  router.post('/grants', requireModuleAccess('obras', 2, getH), async (req: Request, res: Response) => {
    const orgId = req.orgId;
    const actor = req.user;
    const b = req.body ?? {};
    if (!orgId || !actor) return res.status(401).json({ ok: false, error: 'Não autenticado.' });
    const role = (actor.orgs?.[orgId] || 'Visualizador') as UserRole;
    if (!actor.master && !['Admin', 'Gerente'].includes(role)) {
      return res.status(403).json({ ok: false, error: 'Apenas Admin ou Gerente pode emitir acessos externos ao Portal do Cliente.' });
    }
    const projectId = String(b.projectId || '').trim();
    const clientName = String(b.clientName || '').trim();
    const scopes = sanitizePortalScopes(b.scopes);
    const ttlDays = Math.min(180, Math.max(1, Number(b.expiresInDays) || 30));
    if (!validId(projectId) || clientName.length < 2 || scopes.length === 0) {
      return res.status(400).json({ ok: false, error: 'Informe projeto, nome do cliente e ao menos um escopo permitido.' });
    }
    const admin = getH();
    if (!admin) return res.status(503).json({ ok: false, error: 'Serviço indisponível.' });

    const projSnap = await admin.db.collection('projects').doc(projectId).get();
    if (!projSnap.exists || orgOf(projSnap.data()) !== orgId) {
      return res.status(400).json({ ok: false, error: 'Projeto/Obra não encontrado nesta empresa.' });
    }
    const contractId = String(projSnap.data()?.contractId || '');
    if (!contractId) {
      return res.status(400).json({ ok: false, error: 'O Projeto/Obra precisa de um contrato vinculado para liberar o Portal do Cliente.' });
    }

    const rawToken = `cp_${crypto.randomBytes(24).toString('hex')}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlDays * 86400000).toISOString();
    const grant: ClientPortalGrant = {
      id: `cpg_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      orgId,
      clientName,
      ...(b.clientEmail ? { clientEmail: String(b.clientEmail).trim().toLowerCase() } : {}),
      contractId,
      projectId,
      scopes,
      tokenHash: sha256Hex(rawToken),
      expiresAt,
      createdByUid: actor.uid,
      createdByName: actor.email || actor.uid,
      createdAt: now.toISOString(),
    };

    await admin.db.collection('client_portal_grants').doc(grant.id).set(grant);
    // Plaintext token returned ONCE on creation; never stored in Firestore
    return res.status(201).json({ ok: true, grant: { ...grant, tokenHash: undefined }, accessToken: rawToken });
  });

  router.post('/grants/:grantId/revoke', requireModuleAccess('obras', 2, getH), async (req: Request, res: Response) => {
    const orgId = req.orgId;
    const actor = req.user;
    const grantId = req.params.grantId;
    if (!orgId || !actor || !validId(grantId)) return res.status(400).json({ ok: false, error: 'Grant inválido.' });
    const admin = getH();
    if (!admin) return res.status(503).json({ ok: false, error: 'Serviço indisponível.' });
    const ref = admin.db.collection('client_portal_grants').doc(grantId);
    const snap = await ref.get();
    if (!snap.exists || orgOf(snap.data()) !== orgId) return res.status(404).json({ ok: false, error: 'Acesso externo não encontrado.' });
    const now = new Date().toISOString();
    await ref.update({ revokedAt: now, revokedByUid: actor.uid });
    return res.status(200).json({ ok: true, revokedAt: now });
  });

  // ---- External isolated Client Portal API (authenticates exclusively via x-portal-token) ----
  router.get('/public/summary', async (req: Request, res: Response) => {
    const admin = getH();
    if (!admin) return res.status(503).json({ ok: false, error: 'Serviço indisponível.' });
    const grant = await resolveExternalGrant(admin, req);
    const check = evaluatePortalGrantAccess({ grant, requiredScope: 'schedule' });
    if (!check.allowed || !grant) {
      return res.status(403).json({ ok: false, error: check.reason || 'Acesso negado.' });
    }

    const { orgId, contractId, projectId } = grant;
    const [projSnap, milestonesSnap, bulletinsSnap, jointsSnap, ndtsSnap, lotsSnap, itpsSnap] = await Promise.all([
      admin.db.collection('projects').doc(projectId).get(),
      admin.db.collection('construction_milestones').where('orgId', '==', orgId).where('contractId', '==', contractId).get(),
      grant.scopes.includes('measurements')
        ? admin.db.collection('measurement_bulletins').where('orgId', '==', orgId).where('projectId', '==', projectId).get()
        : Promise.resolve(null),
      grant.scopes.includes('databook')
        ? admin.db.collection('weld_joints').where('orgId', '==', orgId).where('projectId', '==', projectId).get()
        : Promise.resolve(null),
      grant.scopes.includes('databook')
        ? admin.db.collection('ndt_reports').where('orgId', '==', orgId).where('projectId', '==', projectId).get()
        : Promise.resolve(null),
      grant.scopes.includes('databook')
        ? admin.db.collection('material_lots').where('orgId', '==', orgId).where('projectId', '==', projectId).get()
        : Promise.resolve(null),
      grant.scopes.includes('databook')
        ? admin.db.collection('quality_itp_matrices').where('orgId', '==', orgId).where('projectId', '==', projectId).get()
        : Promise.resolve(null),
    ]);

    const now = new Date().toISOString();
    const audit: ClientPortalAuditEntry = {
      id: `cpaud_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      orgId,
      grantId: grant.id,
      contractId,
      projectId,
      clientName: grant.clientName,
      action: 'view_summary',
      timestamp: now,
    };
    await admin.db.collection('client_portal_audit').doc(audit.id).set(audit);

    const databook = grant.scopes.includes('databook')
      ? compileProjectDataBook({
          orgId,
          projectId,
          weldJoints: (jointsSnap?.docs || []).map((d) => ({ ...(d.data() as any), id: d.id })),
          ndtReports: (ndtsSnap?.docs || []).map((d) => ({ ...(d.data() as any), id: d.id })),
          materialLots: (lotsSnap?.docs || []).map((d) => ({ ...(d.data() as any), id: d.id })),
          itpMatrices: (itpsSnap?.docs || []).map((d) => ({ ...(d.data() as any), id: d.id })),
        })
      : null;

    return res.status(200).json({
      ok: true,
      project: projSnap.exists
        ? {
            id: projSnap.id,
            code: projSnap.data()?.code,
            name: projSnap.data()?.name,
            status: projSnap.data()?.status,
            plannedStartDate: projSnap.data()?.plannedStartDate,
            plannedEndDate: projSnap.data()?.plannedEndDate,
          }
        : null,
      scopes: grant.scopes,
      milestones: milestonesSnap.docs.map((d) => ({
        id: d.id,
        title: d.data()?.title,
        progress: d.data()?.progress,
        plannedEndDate: d.data()?.plannedEndDate,
      })),
      measurements: (bulletinsSnap?.docs || [])
        .map((d) => d.data())
        .filter((b) => b.status !== 'rascunho' && b.status !== 'cancelado')
        .map((b) => ({
          id: b.id,
          code: b.code,
          periodStart: b.periodStart,
          periodEnd: b.periodEnd,
          status: b.status,
          totalMeasuredAmount: b.totalMeasuredAmount,
          totalApprovedAmount: b.totalApprovedAmount,
        })),
      databook,
    });
  });

  router.post('/public/measurements/:bulletinId/comment', async (req: Request, res: Response) => {
    const admin = getH();
    if (!admin) return res.status(503).json({ ok: false, error: 'Serviço indisponível.' });
    const grant = await resolveExternalGrant(admin, req);
    const check = evaluatePortalGrantAccess({ grant, requiredScope: 'measurements' });
    if (!check.allowed || !grant) return res.status(403).json({ ok: false, error: check.reason || 'Acesso negado.' });

    const bulletinId = req.params.bulletinId;
    const comment = String(req.body?.comment || '').trim();
    if (!validId(bulletinId) || comment.length < 3 || comment.length > 1000) {
      return res.status(400).json({ ok: false, error: 'Informe um comentário válido entre 3 e 1000 caracteres.' });
    }
    const bmSnap = await admin.db.collection('measurement_bulletins').doc(bulletinId).get();
    if (!bmSnap.exists || orgOf(bmSnap.data()) !== grant.orgId || bmSnap.data()?.projectId !== grant.projectId) {
      return res.status(404).json({ ok: false, error: 'Boletim de Medição não encontrado neste escopo de cliente.' });
    }
    const now = new Date().toISOString();
    const audit: ClientPortalAuditEntry = {
      id: `cpaud_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      orgId: grant.orgId,
      grantId: grant.id,
      contractId: grant.contractId,
      projectId: grant.projectId,
      clientName: grant.clientName,
      action: 'comment_measurement',
      targetId: bulletinId,
      comment,
      timestamp: now,
    };
    await admin.db.collection('client_portal_audit').doc(audit.id).set(audit);
    return res.status(201).json({ ok: true, audit });
  });

  return router;
}
