import crypto from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { requireArea } from './authMiddleware.ts';
import { getAdmin, type AdminHandles } from './firebaseAdmin.ts';
import {
  buildReceivableFromApprovedBulletin,
  canTransitionMeasurementStatus,
  computeBulletinTotals,
  eventTypeForMeasurementStatus,
  receivableIdForBulletin,
  type RawMeasurementLineInput,
} from '../src/services/measurementRules.ts';
import type { MeasurementBulletin, MeasurementEvent, MeasurementStatus } from '../src/types/measurement.ts';

class MeasurementRouteError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const validId = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= 180 && !value.includes('/');

const validDate = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim());

const orgOf = (data: Record<string, any> | undefined): string =>
  String(data?.orgId ?? data?.organizationId ?? '');

export function createMeasurementRouter(getH: () => AdminHandles | null = getAdmin): Router {
  const router = Router();

  // 1. Create a new Measurement Bulletin (BM) in 'rascunho' + initial immutable event
  router.post('/bulletins', requireArea('operacoes', 2), async (req: Request, res: Response) => {
    const orgId = req.orgId;
    const actor = req.user;
    const body = req.body ?? {};
    if (!orgId || (body.orgId && body.orgId !== orgId)) {
      return res.status(400).json({ ok: false, error: 'Informe uma empresa válida.' });
    }
    if (!actor?.uid) return res.status(401).json({ ok: false, error: 'Usuário não autenticado.' });

    const unitId = typeof body.unitId === 'string' ? body.unitId.trim() : '';
    const contractId = typeof body.contractId === 'string' ? body.contractId.trim() : '';
    const projectId = typeof body.projectId === 'string' ? body.projectId.trim() : '';
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const periodStart = typeof body.periodStart === 'string' ? body.periodStart.trim() : '';
    const periodEnd = typeof body.periodEnd === 'string' ? body.periodEnd.trim() : '';
    const dueDate = typeof body.dueDate === 'string' ? body.dueDate.trim() : '';
    const notes = typeof body.notes === 'string' ? body.notes.trim() : '';
    const lpuApprovalIds: string[] = Array.isArray(body.lpuApprovalIds)
      ? body.lpuApprovalIds.map((v: unknown) => String(v || '').trim()).filter(Boolean)
      : [];

    if (!unitId || unitId === 'default_unit' || !validId(unitId)) {
      return res.status(400).json({ ok: false, error: 'Selecione uma unidade operacional válida (default_unit não é permitido).' });
    }
    if (!validId(contractId)) {
      return res.status(400).json({ ok: false, error: 'Selecione um contrato válido para o Boletim de Medição.' });
    }
    if (projectId && !validId(projectId)) {
      return res.status(400).json({ ok: false, error: 'Projeto/Obra inválido.' });
    }
    if (title.length < 3 || title.length > 180) {
      return res.status(400).json({ ok: false, error: 'Informe o título do boletim (entre 3 e 180 caracteres).' });
    }
    if (!validDate(periodStart) || !validDate(periodEnd) || periodEnd < periodStart) {
      return res.status(400).json({ ok: false, error: 'Informe um período de medição válido (YYYY-MM-DD).' });
    }
    if (!validDate(dueDate)) {
      return res.status(400).json({ ok: false, error: 'Informe a data de vencimento prevista (YYYY-MM-DD).' });
    }

    let totals: ReturnType<typeof computeBulletinTotals>;
    try {
      totals = computeBulletinTotals(body.items as RawMeasurementLineInput[]);
    } catch (err: any) {
      return res.status(400).json({ ok: false, error: err?.message || 'Itens do boletim inválidos.' });
    }

    const admin = getH();
    if (!admin) return res.status(503).json({ ok: false, error: 'Serviço de dados indisponível.' });

    const randomSuffix = crypto.randomBytes(4).toString('hex');
    const bulletinId = `bm_${Date.now()}_${randomSuffix}`;
    const bulletinRef = admin.db.collection('measurement_bulletins').doc(bulletinId);
    const counterRef = admin.db.collection('counters').doc(`${orgId}_measurement_bulletins`);
    const eventId = `bmevt_${bulletinId}_created`;
    const eventRef = admin.db.collection('measurement_events').doc(eventId);

    try {
      const created = await admin.db.runTransaction(async (tx) => {
        const [unitSnap, contractSnap, projectSnap, counterSnap] = await Promise.all([
          tx.get(admin.db.collection('units').doc(unitId)),
          tx.get(admin.db.collection('contracts').doc(contractId)),
          projectId ? tx.get(admin.db.collection('projects').doc(projectId)) : Promise.resolve(null),
          tx.get(counterRef),
        ]);

        if (!unitSnap.exists || orgOf(unitSnap.data()) !== orgId) {
          throw new MeasurementRouteError(400, 'A unidade informada não pertence à empresa ativa.');
        }
        if (!contractSnap.exists || orgOf(contractSnap.data()) !== orgId) {
          throw new MeasurementRouteError(400, 'O contrato informado não pertence à empresa ativa.');
        }
        const contractData = contractSnap.data() as Record<string, any>;

        let projectCode: string | undefined;
        if (projectId) {
          if (!projectSnap?.exists || orgOf(projectSnap.data()) !== orgId) {
            throw new MeasurementRouteError(400, 'O projeto/obra informado não pertence à empresa ativa.');
          }
          projectCode = String(projectSnap.data()?.code || projectId);
        }

        for (const lpuId of lpuApprovalIds) {
          const lpuSnap = await tx.get(admin.db.collection('lpu_approvals').doc(lpuId));
          if (!lpuSnap.exists || orgOf(lpuSnap.data()) !== orgId) {
            throw new MeasurementRouteError(400, `Aprovação LPU (${lpuId}) não encontrada nesta empresa.`);
          }
        }

        const nextSeq = counterSnap.exists && Number.isSafeInteger(counterSnap.data()?.seq)
          ? Number(counterSnap.data()!.seq) + 1
          : 1;
        const now = new Date().toISOString();
        const code = `BM-${now.slice(0, 4)}-${String(nextSeq).padStart(3, '0')}`;
        const clientName = String(body.clientName || contractData.partyName || contractData.title || 'Cliente do Contrato').trim();
        const actorName = actor.email || actor.uid;

        const bulletin: MeasurementBulletin = {
          id: bulletinId,
          orgId,
          code,
          number: nextSeq,
          title,
          contractId,
          ...(contractData.title ? { contractTitle: String(contractData.title) } : {}),
          ...(projectId ? { projectId, projectCode } : {}),
          unitId,
          clientName,
          ...(body.clientCnpj ? { clientCnpj: String(body.clientCnpj).trim() } : {}),
          periodStart,
          periodEnd,
          dueDate,
          status: 'rascunho',
          items: totals.items,
          totalMeasuredAmount: totals.totalMeasuredAmount,
          totalApprovedAmount: totals.totalApprovedAmount,
          totalGlosaAmount: totals.totalGlosaAmount,
          ...(lpuApprovalIds.length > 0 ? { lpuApprovalIds } : {}),
          ...(notes ? { notes } : {}),
          createdByUid: actor.uid,
          createdByName: actorName,
          createdAt: now,
          updatedAt: now,
        };

        const event: MeasurementEvent = {
          id: eventId,
          orgId,
          bulletinId,
          eventType: 'created',
          toStatus: 'rascunho',
          actorUid: actor.uid,
          actorName,
          ...(notes ? { comment: notes } : {}),
          timestamp: now,
        };

        if (counterSnap.exists) tx.update(counterRef, { seq: nextSeq });
        else tx.create(counterRef, { orgId, seq: nextSeq });
        tx.create(bulletinRef, bulletin);
        tx.create(eventRef, event);

        return bulletin;
      });

      return res.status(201).json({ ok: true, bulletin: created });
    } catch (err) {
      if (err instanceof MeasurementRouteError) {
        return res.status(err.status).json({ ok: false, error: err.message });
      }
      console.error('[measurements create] failed:', err);
      return res.status(500).json({ ok: false, error: 'Não foi possível criar o Boletim de Medição.' });
    }
  });

  // 2. Transition bulletin status atomically; approving creates linked FinanceReceivable (idempotent)
  router.post('/bulletins/:bulletinId/transition', requireArea('operacoes', 2), async (req: Request, res: Response) => {
    const orgId = req.orgId;
    const actor = req.user;
    const bulletinId = req.params.bulletinId;
    const body = req.body ?? {};
    const targetStatus = body.targetStatus as MeasurementStatus;
    const comment = typeof body.comment === 'string' ? body.comment.trim() : '';

    if (!orgId || (body.orgId && body.orgId !== orgId) || !validId(bulletinId)) {
      return res.status(400).json({ ok: false, error: 'Informe empresa e boletim válidos.' });
    }
    if (!actor?.uid) return res.status(401).json({ ok: false, error: 'Usuário não autenticado.' });

    const validTargets: MeasurementStatus[] = [
      'enviado_aprovacao',
      'aprovado',
      'aprovado_parcial',
      'glosado',
      'devolvido',
      'cancelado',
    ];
    if (!validTargets.includes(targetStatus)) {
      return res.status(400).json({ ok: false, error: 'Status de destino inválido para Boletim de Medição.' });
    }

    const isDecision = ['aprovado', 'aprovado_parcial', 'glosado', 'devolvido'].includes(targetStatus);
    const callerRole = actor.orgs?.[orgId];
    if (isDecision && !actor.master && !['Admin', 'Gerente'].includes(String(callerRole || ''))) {
      return res.status(403).json({
        ok: false,
        error: 'Aprovação, aprovação parcial, glosa ou devolução de medição exigem perfil Admin ou Gerente.',
      });
    }

    if (['glosado', 'devolvido', 'cancelado'].includes(targetStatus) && comment.length < 3) {
      return res.status(400).json({
        ok: false,
        error: 'Informe justificativa (mínimo 3 caracteres) para glosar, devolver ou cancelar o boletim.',
      });
    }

    const admin = getH();
    if (!admin) return res.status(503).json({ ok: false, error: 'Serviço de dados indisponível.' });

    const bulletinRef = admin.db.collection('measurement_bulletins').doc(bulletinId);
    const eventId = `bmevt_${bulletinId}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const eventRef = admin.db.collection('measurement_events').doc(eventId);
    const receivableId = receivableIdForBulletin(orgId, bulletinId);
    const receivableRef = admin.db.collection('finance_receivables').doc(receivableId);

    try {
      const result = await admin.db.runTransaction(async (tx) => {
        const [bulletinSnap, existingReceivableSnap] = await Promise.all([
          tx.get(bulletinRef),
          tx.get(receivableRef),
        ]);
        if (!bulletinSnap.exists) throw new MeasurementRouteError(404, 'Boletim de Medição não encontrado.');
        const current = { id: bulletinSnap.id, ...(bulletinSnap.data() as Record<string, any>) } as MeasurementBulletin;
        if (current.orgId !== orgId) throw new MeasurementRouteError(404, 'Boletim de Medição não encontrado.');

        if (!canTransitionMeasurementStatus(current.status, targetStatus)) {
          throw new MeasurementRouteError(
            409,
            `Transição não permitida: ${current.status} → ${targetStatus}.`,
          );
        }

        // Allow optional updated items (with approvedQuantity/glosaReason) on partial approval or resubmission
        let nextTotals = {
          items: current.items,
          totalMeasuredAmount: current.totalMeasuredAmount,
          totalApprovedAmount: current.totalApprovedAmount,
          totalGlosaAmount: current.totalGlosaAmount,
        };
        if (Array.isArray(body.items) && body.items.length > 0 && ['aprovado_parcial', 'enviado_aprovacao'].includes(targetStatus)) {
          try {
            nextTotals = computeBulletinTotals(body.items as RawMeasurementLineInput[]);
          } catch (err: any) {
            throw new MeasurementRouteError(400, err?.message || 'Itens inválidos na atualização do boletim.');
          }
        }

        if (targetStatus === 'aprovado_parcial' && nextTotals.totalGlosaAmount <= 0) {
          throw new MeasurementRouteError(400, 'Aprovação parcial requer glosa em ao menos um item (ou use aprovação integral).');
        }
        if (targetStatus === 'glosado') {
          nextTotals = {
            ...nextTotals,
            totalApprovedAmount: 0,
            totalGlosaAmount: nextTotals.totalMeasuredAmount,
          };
        }

        const now = new Date().toISOString();
        const actorName = actor.email || actor.uid;
        const willGenerateReceivable =
          (targetStatus === 'aprovado' || targetStatus === 'aprovado_parcial') &&
          nextTotals.totalApprovedAmount > 0;

        const updatedBulletin: MeasurementBulletin = {
          ...current,
          status: targetStatus,
          items: nextTotals.items,
          totalMeasuredAmount: nextTotals.totalMeasuredAmount,
          totalApprovedAmount: nextTotals.totalApprovedAmount,
          totalGlosaAmount: nextTotals.totalGlosaAmount,
          ...(targetStatus === 'enviado_aprovacao' ? { submittedAt: now } : {}),
          ...(isDecision ? { approvedAt: now, approvedByUid: actor.uid, approvedByName: actorName } : {}),
          ...(willGenerateReceivable ? { receivableId } : {}),
          updatedAt: now,
        };

        let createdReceivable = null;
        if (willGenerateReceivable && !existingReceivableSnap.exists) {
          createdReceivable = buildReceivableFromApprovedBulletin(updatedBulletin, actor.uid, now);
          tx.create(receivableRef, createdReceivable);
        }

        const event: MeasurementEvent = {
          id: eventId,
          orgId,
          bulletinId,
          eventType: eventTypeForMeasurementStatus(targetStatus),
          fromStatus: current.status,
          toStatus: targetStatus,
          actorUid: actor.uid,
          actorName,
          ...(comment ? { comment } : {}),
          ...(willGenerateReceivable ? { receivableId } : {}),
          timestamp: now,
        };

        tx.update(bulletinRef, {
          status: updatedBulletin.status,
          items: updatedBulletin.items,
          totalMeasuredAmount: updatedBulletin.totalMeasuredAmount,
          totalApprovedAmount: updatedBulletin.totalApprovedAmount,
          totalGlosaAmount: updatedBulletin.totalGlosaAmount,
          ...(updatedBulletin.submittedAt ? { submittedAt: updatedBulletin.submittedAt } : {}),
          ...(updatedBulletin.approvedAt ? { approvedAt: updatedBulletin.approvedAt } : {}),
          ...(updatedBulletin.approvedByUid ? { approvedByUid: updatedBulletin.approvedByUid } : {}),
          ...(updatedBulletin.approvedByName ? { approvedByName: updatedBulletin.approvedByName } : {}),
          ...(updatedBulletin.receivableId ? { receivableId: updatedBulletin.receivableId } : {}),
          updatedAt: now,
        });
        tx.create(eventRef, event);

        return {
          bulletin: updatedBulletin,
          eventId,
          receivableId: willGenerateReceivable ? receivableId : null,
          receivableCreated: Boolean(createdReceivable),
        };
      });

      return res.status(200).json({ ok: true, ...result });
    } catch (err) {
      if (err instanceof MeasurementRouteError) {
        return res.status(err.status).json({ ok: false, error: err.message });
      }
      console.error('[measurements transition] failed:', err);
      return res.status(500).json({ ok: false, error: 'Não foi possível atualizar o status do Boletim de Medição.' });
    }
  });

  return router;
}
