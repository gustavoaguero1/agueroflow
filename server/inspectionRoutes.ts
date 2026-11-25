import { createHash, randomUUID } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { requireArea } from './authMiddleware.ts';
import { getAdmin, type AdminHandles } from './firebaseAdmin.ts';

class InspectionRouteError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const validId = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= 180 && !value.includes('/');

const operationId = (orgId: string, inspectionId: string, key: string) =>
  createHash('sha256').update(`${orgId}:${inspectionId}:${key}`).digest('hex');

const actorCanReview = (req: Request, orgId: string): boolean => {
  const actor = req.user;
  return !!actor && (actor.master || ['Admin', 'Gerente', 'Supervisor'].includes(actor.orgs?.[orgId] || ''));
};

const actorName = (req: Request): string => req.user?.email || req.user?.uid || 'Usuário';

export function createInspectionRouter(getH: () => AdminHandles | null = getAdmin): Router {
  const router = Router();

  router.post('/', requireArea('operacoes', 2), async (req: Request, res: Response) => {
    const orgId = req.orgId;
    const actor = req.user;
    const body = req.body ?? {};
    const unitId = body.unitId;
    const assetId = body.assetId || '';
    const orderId = body.orderId || '';
    const title = typeof body.title === 'string' ? body.title.trim() : '';

    if (!orgId || body.orgId !== orgId || !validId(unitId)
      || (assetId && !validId(assetId)) || (orderId && !validId(orderId))
      || title.length < 3 || title.length > 180) {
      return res.status(400).json({ ok: false, error: 'Informe título e unidade válidos para agendar a inspeção.' });
    }
    if (!actor?.uid) return res.status(401).json({ ok: false, error: 'Usuário não autenticado.' });
    const admin = getH();
    if (!admin) return res.status(503).json({ ok: false, error: 'Serviço de dados indisponível.' });

    const id = `insp_${randomUUID().replace(/-/g, '')}`;
    const now = new Date().toISOString();
    const inspectionRef = admin.db.collection('inspections').doc(id);
    const eventRef = admin.db.collection('inspection_events').doc(`inspection_evt_${id}_created`);
    const unitRef = admin.db.collection('units').doc(unitId);
    const assetRef = assetId ? admin.db.collection('assets').doc(assetId) : null;
    const orderRef = orderId ? admin.db.collection('work_orders').doc(orderId) : null;

    try {
      const inspection = {
        id,
        orgId,
        unitId,
        ...(assetId ? { assetId } : {}),
        ...(orderId ? { orderId } : {}),
        title,
        inspectorId: actor.uid,
        inspectorName: actorName(req),
        status: 'agendada',
        result: 'pendente',
        findings: '',
        createdAt: now,
        updatedAt: now,
      };

      await admin.db.runTransaction(async (tx) => {
        const refs = [tx.get(unitRef)];
        if (assetRef) refs.push(tx.get(assetRef));
        if (orderRef) refs.push(tx.get(orderRef));
        const snapshots = await Promise.all(refs);
        const unitSnap = snapshots[0];
        if (!unitSnap.exists || unitSnap.data()?.orgId !== orgId) {
          throw new InspectionRouteError(400, 'A unidade selecionada não pertence à empresa.');
        }
        let cursor = 1;
        if (assetRef) {
          const assetSnap = snapshots[cursor++];
          const asset = assetSnap.data() as Record<string, any> | undefined;
          if (!assetSnap.exists || asset?.orgId !== orgId || (asset.unitId && asset.unitId !== unitId)) {
            throw new InspectionRouteError(400, 'O ativo selecionado não pertence à unidade/empresa.');
          }
        }
        if (orderRef) {
          const orderSnap = snapshots[cursor];
          const order = orderSnap.data() as Record<string, any> | undefined;
          if (!orderSnap.exists || order?.orgId !== orgId || order?.unitId !== unitId) {
            throw new InspectionRouteError(400, 'A OS selecionada não pertence à unidade/empresa.');
          }
        }

        tx.create(inspectionRef, inspection);
        tx.create(eventRef, {
          id: eventRef.id,
          orgId,
          inspectionId: id,
          eventType: 'created',
          previousStatus: null,
          newStatus: 'agendada',
          actorUid: actor.uid,
          actorName: actorName(req),
          comment: '',
          recordedAt: now,
        });
      });

      return res.status(201).json({ ok: true, inspection });
    } catch (error) {
      if (error instanceof InspectionRouteError) {
        return res.status(error.status).json({ ok: false, error: error.message });
      }
      console.error('[inspection create] failed:', error);
      return res.status(500).json({ ok: false, error: 'Não foi possível agendar a inspeção.' });
    }
  });

  router.post('/:inspectionId/transition', requireArea('operacoes', 2), async (req: Request, res: Response) => {
    const orgId = req.orgId;
    const actor = req.user;
    const inspectionId = req.params.inspectionId;
    const body = req.body ?? {};
    const action = body.action;
    const expectedStatus = body.expectedStatus;
    const idempotencyKey = body.idempotencyKey;
    const comment = typeof body.comment === 'string' ? body.comment.trim() : '';
    const result = body.result;
    const findings = typeof body.findings === 'string' ? body.findings.trim() : '';

    if (!orgId || body.orgId !== orgId || !validId(inspectionId)
      || !['start', 'submit', 'approve', 'reject', 'reopen'].includes(action)
      || !validId(expectedStatus)
      || typeof idempotencyKey !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(idempotencyKey)
      || comment.length > 1500 || findings.length > 4000) {
      return res.status(400).json({ ok: false, error: 'Informe os dados válidos para a transição da inspeção.' });
    }
    if (!actor?.uid) return res.status(401).json({ ok: false, error: 'Usuário não autenticado.' });
    if (['approve', 'reject'].includes(action) && !actorCanReview(req, orgId)) {
      return res.status(403).json({ ok: false, error: 'Somente Admin, Gerente ou Supervisor podem revisar inspeções.' });
    }
    if (action === 'submit' && !['conforme', 'nao_conforme', 'pendente'].includes(result)) {
      return res.status(400).json({ ok: false, error: 'Informe o resultado técnico da inspeção.' });
    }
    if (action === 'submit' && result !== 'conforme' && findings.length < 5) {
      return res.status(400).json({ ok: false, error: 'Descreva as constatações para resultados não conformes ou pendentes.' });
    }
    if (action === 'reject' && comment.length < 5) {
      return res.status(400).json({ ok: false, error: 'Informe o motivo da devolução da inspeção.' });
    }
    if (action === 'reopen' && comment.length < 5) {
      return res.status(400).json({ ok: false, error: 'Informe o motivo para reabrir a inspeção devolvida.' });
    }

    const admin = getH();
    if (!admin) return res.status(503).json({ ok: false, error: 'Serviço de dados indisponível.' });

    const request = {
      orgId,
      inspectionId,
      action,
      expectedStatus,
      idempotencyKey,
      comment,
      ...(action === 'submit' ? { result, findings } : {}),
      actorUid: actor.uid,
    };
    const opId = operationId(orgId, inspectionId, idempotencyKey);
    const opRef = admin.db.collection('inspection_transition_ops').doc(opId);
    const inspectionRef = admin.db.collection('inspections').doc(inspectionId);
    const eventId = `inspection_evt_${opId}`;
    const eventRef = admin.db.collection('inspection_events').doc(eventId);

    try {
      const response = await admin.db.runTransaction(async (tx) => {
        const opSnap = await tx.get(opRef);
        if (opSnap.exists) {
          const saved = opSnap.data() as Record<string, any>;
          const same = saved.orgId === request.orgId
            && saved.inspectionId === request.inspectionId
            && saved.action === request.action
            && saved.expectedStatus === request.expectedStatus
            && saved.comment === request.comment
            && saved.result === request.result
            && saved.findings === request.findings
            && saved.actorUid === request.actorUid;
          if (!same) throw new InspectionRouteError(409, 'Esta chave de operação já foi usada em outra transição.');
          return { replayed: true, inspection: saved.inspection, eventId: saved.eventId };
        }

        const snap = await tx.get(inspectionRef);
        if (!snap.exists || snap.data()?.orgId !== orgId) {
          throw new InspectionRouteError(404, 'Inspeção não encontrada.');
        }
        const current = snap.data() as Record<string, any>;
        if (current.status !== expectedStatus) {
          throw new InspectionRouteError(409, 'A inspeção foi alterada por outra pessoa. Atualize a lista e tente novamente.');
        }

        if (['approve', 'reject'].includes(action)) {
          const complete = typeof current.completedAt === 'string'
            && current.completedAt.length > 0
            && ['conforme', 'nao_conforme', 'pendente'].includes(current.result)
            && (current.result === 'conforme' || (typeof current.findings === 'string' && current.findings.trim().length >= 5));
          if (!complete) throw new InspectionRouteError(400, 'A inspeção está incompleta e não pode ser revisada.');
        }

        const next: Record<string, any> = { ...current, updatedAt: new Date().toISOString() };
        if (action === 'start' && expectedStatus === 'agendada') {
          next.status = 'em_campo';
          next.startedAt = next.updatedAt;
          next.startedBy = actor.uid;
        } else if (action === 'submit' && expectedStatus === 'em_campo') {
          next.status = 'aguardando_revisao';
          next.result = result;
          next.findings = findings;
          next.completedAt = next.updatedAt;
          next.submittedBy = actor.uid;
          next.submittedByName = actorName(req);
        } else if (action === 'approve' && expectedStatus === 'aguardando_revisao') {
          next.status = 'aprovada';
          next.reviewedAt = next.updatedAt;
          next.reviewedBy = actor.uid;
          next.reviewedByName = actorName(req);
          next.reviewComment = comment;
        } else if (action === 'reject' && expectedStatus === 'aguardando_revisao') {
          next.status = 'reprovada';
          next.reviewedAt = next.updatedAt;
          next.reviewedBy = actor.uid;
          next.reviewedByName = actorName(req);
          next.reviewComment = comment;
        } else if (action === 'reopen' && expectedStatus === 'reprovada') {
          next.status = 'em_campo';
          next.reopenedAt = next.updatedAt;
          next.reopenedBy = actor.uid;
          next.reopenReason = comment;
          delete next.completedAt;
          delete next.submittedBy;
          delete next.submittedByName;
          delete next.reviewedAt;
          delete next.reviewedBy;
          delete next.reviewedByName;
          delete next.reviewComment;
        } else {
          throw new InspectionRouteError(409, 'Transição não permitida para o estado atual da inspeção.');
        }

        const event = {
          id: eventId,
          orgId,
          inspectionId,
          eventType: action,
          previousStatus: expectedStatus,
          newStatus: next.status,
          actorUid: actor.uid,
          actorName: actorName(req),
          comment: action === 'reject' ? comment : action === 'reopen' ? comment : comment,
          ...(action === 'submit' ? { result, findings } : {}),
          recordedAt: next.updatedAt,
        };
        tx.update(inspectionRef, next);
        tx.create(eventRef, event);
        tx.create(opRef, { ...request, eventId, inspection: next, createdAt: next.updatedAt });
        return { replayed: false, inspection: next, eventId };
      });

      return res.status(200).json({ ok: true, ...response });
    } catch (error) {
      if (error instanceof InspectionRouteError) {
        return res.status(error.status).json({ ok: false, error: error.message });
      }
      const code = (error as { code?: number | string })?.code;
      if (code === 6 || code === 'already-exists' || code === 10 || code === 'aborted') {
        return res.status(409).json({ ok: false, error: 'A inspeção foi alterada em paralelo. Atualize os dados antes de tentar novamente.' });
      }
      console.error('[inspection transition] failed:', error);
      return res.status(500).json({ ok: false, error: 'Não foi possível atualizar a inspeção no servidor.' });
    }
  });

  return router;
}
