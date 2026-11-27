import { Router, type Request, type Response } from 'express';
import { requireModuleAccess } from './authMiddleware.ts';
import { getAdmin, type AdminHandles } from './firebaseAdmin.ts';
import {
  buildDerivedContractFromProposal,
  buildDerivedProjectFromProposal,
  buildFrozenBudgetBaselineFromProposal,
  validateProposalWinUnitId,
} from '../src/services/proposalBaselineRules.ts';

class FunnelRouteError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
const validId = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= 180 && !value.includes('/');
const orgOf = (data: Record<string, any>) => data.orgId ?? data.organizationId ?? '';
const LOSS_REASONS = ['Preço', 'Prazo', 'Escopo', 'Concorrente', 'Cliente desistiu', 'Outro'] as const;
const historyEntry = (status: string, by: string, at: string) => ({ status, at, by });

export function createCommercialFunnelRouter(getH: () => AdminHandles | null = getAdmin): Router {
  const router = Router();

  router.post('/:proposalId/stage', requireModuleAccess('comercial-funil', 2, getH), async (req: Request, res: Response) => {
    const orgId = req.orgId, actor = req.user, proposalId = req.params.proposalId, status = req.body?.status;
    if (!orgId || req.body?.orgId !== orgId || !validId(proposalId) || !['enviada', 'negociacao'].includes(status)) {
      return res.status(400).json({ ok: false, error: 'Informe uma etapa e uma proposta válidas.' });
    }
    if (!actor?.uid) return res.status(401).json({ ok: false, error: 'Usuário não autenticado.' });
    const admin = getH();
    if (!admin) return res.status(503).json({ ok: false, error: 'Serviço de dados indisponível.' });
    try {
      await admin.db.runTransaction(async (tx) => {
        const ref = admin.db.collection('commercial_proposals').doc(proposalId);
        const snap = await tx.get(ref);
        if (!snap.exists) throw new FunnelRouteError(404, 'Proposta não encontrada.');
        const proposal = snap.data() as Record<string, any>;
        if (orgOf(proposal) !== orgId) throw new FunnelRouteError(404, 'Proposta não encontrada.');
        if (proposal.workOrderId || ['ganha', 'perdida', 'rejeitada'].includes(proposal.status)) {
          throw new FunnelRouteError(409, 'Esta proposta já foi encerrada e não pode mudar de etapa.');
        }
        const now = new Date().toISOString();
        tx.update(ref, { status, updatedAt: now,
          statusHistory: [...(Array.isArray(proposal.statusHistory) ? proposal.statusHistory : []),
            historyEntry(status, actor.email || actor.uid, now)] });
      });
      return res.status(200).json({ ok: true, status });
    } catch (error) {
      if (error instanceof FunnelRouteError) return res.status(error.status).json({ ok: false, error: error.message });
      console.error('[commercial funnel stage] failed:', error);
      return res.status(500).json({ ok: false, error: 'Não foi possível atualizar a etapa da proposta.' });
    }
  });

  router.post('/:proposalId/lost', requireModuleAccess('comercial-funil', 2, getH), async (req: Request, res: Response) => {
    const orgId = req.orgId, actor = req.user, proposalId = req.params.proposalId;
    const reason = req.body?.reason;
    const detail = typeof req.body?.detail === 'string' ? req.body.detail.trim() : '';
    if (!orgId || req.body?.orgId !== orgId || !validId(proposalId)
      || !LOSS_REASONS.includes(reason) || (reason + detail).trim().length < 3 || detail.length > 1000) {
      return res.status(400).json({ ok: false, error: 'Informe um motivo válido para a perda da proposta.' });
    }
    if (!actor?.uid) return res.status(401).json({ ok: false, error: 'Usuário não autenticado.' });
    const admin = getH();
    if (!admin) return res.status(503).json({ ok: false, error: 'Serviço de dados indisponível.' });
    const motivoPerda = detail ? `${reason}: ${detail}` : reason;
    try {
      await admin.db.runTransaction(async (tx) => {
        const ref = admin.db.collection('commercial_proposals').doc(proposalId);
        const snap = await tx.get(ref);
        if (!snap.exists) throw new FunnelRouteError(404, 'Proposta não encontrada.');
        const proposal = snap.data() as Record<string, any>;
        if (orgOf(proposal) !== orgId) throw new FunnelRouteError(404, 'Proposta não encontrada.');
        if (proposal.workOrderId || proposal.status === 'ganha') {
          throw new FunnelRouteError(409, 'Proposta já gerou OS e não pode ser marcada como perdida.');
        }
        if (proposal.status === 'perdida') return;
        const now = new Date().toISOString();
        tx.update(ref, { status: 'perdida', motivoPerda, updatedAt: now,
          statusHistory: [...(Array.isArray(proposal.statusHistory) ? proposal.statusHistory : []),
            historyEntry('perdida', actor.email || actor.uid, now)] });
      });
      return res.status(200).json({ ok: true, status: 'perdida', motivoPerda });
    } catch (error) {
      if (error instanceof FunnelRouteError) return res.status(error.status).json({ ok: false, error: error.message });
      console.error('[commercial funnel lost] failed:', error);
      return res.status(500).json({ ok: false, error: 'Não foi possível registrar a perda da proposta.' });
    }
  });

  router.post('/:proposalId/win', requireModuleAccess('comercial-funil', 2, getH), requireModuleAccess('obras', 2, getH), async (req: Request, res: Response) => {
    const orgId = req.orgId, actor = req.user, proposalId = req.params.proposalId;
    if (!orgId || req.body?.orgId !== orgId || !validId(proposalId)) {
      return res.status(400).json({ ok: false, error: 'Informe uma empresa e uma proposta válidas.' });
    }
    if (!actor?.uid) return res.status(401).json({ ok: false, error: 'Usuário não autenticado.' });
    const admin = getH();
    if (!admin) return res.status(503).json({ ok: false, error: 'Serviço de dados indisponível.' });

    const proposalRef = admin.db.collection('commercial_proposals').doc(proposalId);
    const orderId = `os_prop_${proposalId}`;
    const orderRef = admin.db.collection('work_orders').doc(orderId);
    const eventId = `${orderId}_created`;
    const eventRef = admin.db.collection('order_events').doc(eventId);
    const counterRef = admin.db.collection('counters').doc(`${orgId}_work_orders`);
    const derivedContractId = `ct_prop_${proposalId}`;
    const derivedContractRef = admin.db.collection('contracts').doc(derivedContractId);
    const derivedProjectId = `prj_prop_${proposalId}`;
    const derivedProjectRef = admin.db.collection('projects').doc(derivedProjectId);

    try {
      const result = await admin.db.runTransaction(async (tx) => {
        const proposalSnap = await tx.get(proposalRef);
        if (!proposalSnap.exists) throw new FunnelRouteError(404, 'Proposta não encontrada.');
        const proposal = proposalSnap.data() as Record<string, any>;
        if (orgOf(proposal) !== orgId) throw new FunnelRouteError(404, 'Proposta não encontrada.');
        if (proposal.workOrderId) {
          return {
            workOrderId: proposal.workOrderId,
            orderNumber: proposal.workOrderCode ?? null,
            contractId: proposal.contractId ?? null,
            projectId: proposal.projectId ?? null,
            projectCode: proposal.projectCode ?? null,
            replayed: true,
          };
        }
        if (proposal.status === 'perdida' || proposal.status === 'rejeitada') {
          throw new FunnelRouteError(409, 'Proposta perdida/rejeitada não pode gerar OS.');
        }

        let unitId: string;
        try {
          unitId = validateProposalWinUnitId(proposal.unitId);
        } catch (err: any) {
          throw new FunnelRouteError(400, err?.message || 'Vincule uma unidade válida à proposta antes de convertê-la.');
        }

        const unitSnap = await tx.get(admin.db.collection('units').doc(unitId));
        if (!unitSnap.exists || orgOf(unitSnap.data() as Record<string, any>) !== orgId) {
          throw new FunnelRouteError(400, 'A unidade vinculada à proposta não pertence à empresa selecionada.');
        }

        let contractId: string;
        let shouldCreateContract = false;
        if (typeof proposal.contractId === 'string' && proposal.contractId.trim()) {
          contractId = proposal.contractId.trim();
          const contractSnap = await tx.get(admin.db.collection('contracts').doc(contractId));
          if (!contractSnap.exists || orgOf(contractSnap.data() as Record<string, any>) !== orgId) {
            throw new FunnelRouteError(400, 'O contrato vinculado à proposta não pertence à empresa selecionada.');
          }
        } else {
          contractId = derivedContractId;
          const derivedContractSnap = await tx.get(derivedContractRef);
          if (derivedContractSnap.exists) {
            if (orgOf(derivedContractSnap.data() as Record<string, any>) !== orgId) {
              throw new FunnelRouteError(409, 'Conflito de identificador de contrato para esta proposta.');
            }
          } else {
            shouldCreateContract = true;
          }
        }

        let costCenterId: string | undefined;
        if (typeof proposal.costCenterId === 'string' && proposal.costCenterId.trim()) {
          costCenterId = proposal.costCenterId.trim();
          const ccSnap = await tx.get(admin.db.collection('cost_centers').doc(costCenterId));
          if (!ccSnap.exists || orgOf(ccSnap.data() as Record<string, any>) !== orgId) {
            throw new FunnelRouteError(400, 'O centro de custo vinculado à proposta não pertence à empresa selecionada.');
          }
        }

        let projectId: string;
        let projectCode: string;
        let shouldCreateProject = false;
        let existingProjectSnap: any = null;
        if (typeof proposal.projectId === 'string' && proposal.projectId.trim()) {
          projectId = proposal.projectId.trim();
          existingProjectSnap = await tx.get(admin.db.collection('projects').doc(projectId));
          if (!existingProjectSnap.exists || orgOf(existingProjectSnap.data() as Record<string, any>) !== orgId) {
            throw new FunnelRouteError(400, 'O projeto vinculado à proposta não pertence à empresa selecionada.');
          }
          projectCode = String(existingProjectSnap.data()?.code || projectId);
        } else {
          projectId = derivedProjectId;
          const derivedProjSnap = await tx.get(derivedProjectRef);
          if (derivedProjSnap.exists) {
            if (orgOf(derivedProjSnap.data() as Record<string, any>) !== orgId) {
              throw new FunnelRouteError(409, 'Conflito de identificador de projeto para esta proposta.');
            }
            existingProjectSnap = derivedProjSnap;
            projectCode = String(derivedProjSnap.data()?.code || derivedProjectId);
          } else {
            shouldCreateProject = true;
            projectCode = '';
          }
        }

        const [statusesSnap, counterSnap, existingOrderSnap, existingEventSnap] = await Promise.all([
          tx.get(admin.db.collection('work_order_statuses').where('orgId', '==', orgId)),
          tx.get(counterRef),
          tx.get(orderRef),
          tx.get(eventRef),
        ]);
        const initialStatuses: Array<Record<string, any>> = statusesSnap.docs
          .map((item: any) => item.data() as Record<string, any>)
          .filter((status: Record<string, any>) => status.isInitial === true)
          .sort((a: Record<string, any>, b: Record<string, any>) => (a.order ?? 0) - (b.order ?? 0));
        const initial = initialStatuses[0];
        if (!initial?.id || initial.orgId !== orgId) {
          throw new FunnelRouteError(400, 'Configure ao menos um estado inicial de OS antes de converter uma proposta ganha.');
        }
        if (existingOrderSnap.exists || existingEventSnap.exists) {
          throw new FunnelRouteError(409, 'Já existe um registro de OS com o identificador desta proposta. Verifique antes de tentar novamente.');
        }

        let nextSeq: number;
        if (counterSnap.exists) {
          const currentSeq = counterSnap.data()?.seq;
          if (!Number.isSafeInteger(currentSeq) || currentSeq < 0) {
            throw new FunnelRouteError(409, 'O contador de OS está inconsistente. Corrija a sequência antes de converter a proposta.');
          }
          nextSeq = currentSeq + 1;
        } else {
          const existingOrders = await tx.get(admin.db.collection('work_orders').where('orgId', '==', orgId));
          const maxSeq = existingOrders.docs.reduce((max: number, item: any) => {
            const match = /^OS-\d{4}-(\d+)$/.exec(String(item.data()?.orderNumber ?? ''));
            return match ? Math.max(max, Number(match[1])) : max;
          }, 0);
          nextSeq = maxSeq + 1;
        }

        const now = new Date().toISOString();
        const orderNumber = `OS-${now.slice(0, 4)}-${String(nextSeq).padStart(3, '0')}`;
        const userName = actor.email || actor.uid;

        const budgetBaseline = buildFrozenBudgetBaselineFromProposal({
          proposal: { id: proposalId, ...proposal },
          actorUid: actor.uid,
          actorName: userName,
          frozenAt: now,
        });

        const derivedContract = shouldCreateContract
          ? buildDerivedContractFromProposal({
              orgId,
              unitId,
              proposal: { id: proposalId, ...proposal },
              now,
            })
          : null;

        const derivedProject = shouldCreateProject
          ? buildDerivedProjectFromProposal({
              orgId,
              unitId,
              contractId,
              costCenterId,
              proposal: { id: proposalId, ...proposal },
              budgetBaseline,
              actorUid: actor.uid,
              actorName: userName,
              now,
            })
          : null;

        if (derivedProject) {
          projectCode = derivedProject.code;
        }

        const workOrder = {
          id: orderId,
          orgId,
          unitId,
          contractId,
          projectId,
          orderNumber,
          title: `${proposal.code || proposalId} - ${proposal.title || 'Nova OS'}`,
          description: [proposal.clientName ? `Cliente: ${proposal.clientName}` : '', proposal.scopeDescription || '']
            .filter(Boolean).join('\n').trim(),
          orderType: 'solicitacao',
          priority: 'media',
          status: initial.id,
          requesterId: actor.uid,
          requesterName: userName,
          estimatedHours: 0,
          estimatedCost: budgetBaseline.plannedDirectCost,
          proposalId,
          isRework: false,
          createdAt: now,
          updatedAt: now,
        };
        const event = {
          id: eventId,
          orgId,
          orderId,
          userId: actor.uid,
          userName,
          eventType: 'criacao',
          description: `OS ${orderNumber} criada a partir da proposta ${proposal.code || proposalId} (Projeto ${projectCode}).`,
          newStatus: initial.id,
          timestamp: now,
        };

        if (derivedContract) tx.create(derivedContractRef, derivedContract);
        if (derivedProject) {
          tx.create(derivedProjectRef, derivedProject);
        } else if (existingProjectSnap && !existingProjectSnap.data()?.budgetBaseline) {
          tx.update(admin.db.collection('projects').doc(projectId), {
            budgetBaseline,
            proposalId,
            ...(proposal.code ? { proposalCode: proposal.code } : {}),
            updatedAt: now,
          });
        }

        if (counterSnap.exists) tx.update(counterRef, { seq: nextSeq });
        else tx.create(counterRef, { orgId, seq: nextSeq });
        tx.create(orderRef, workOrder);
        tx.create(eventRef, event);
        tx.update(proposalRef, {
          status: 'ganha',
          contractId,
          projectId,
          projectCode,
          workOrderId: orderId,
          workOrderCode: orderNumber,
          approvedBaselineSnapshot: budgetBaseline,
          updatedAt: now,
          statusHistory: [
            ...(Array.isArray(proposal.statusHistory) ? proposal.statusHistory : []),
            historyEntry('ganha', actor.email || actor.uid, now),
          ],
        });
        return {
          workOrderId: orderId,
          orderNumber,
          contractId,
          projectId,
          projectCode,
          budgetBaseline,
          replayed: false,
        };
      });
      return res.status(200).json({ ok: true, ...result });
    } catch (error) {
      if (error instanceof FunnelRouteError) return res.status(error.status).json({ ok: false, error: error.message });
      const code = (error as { code?: number | string })?.code;
      if (code === 6 || code === 'already-exists' || code === 10 || code === 'aborted') {
        return res.status(409).json({ ok: false, error: 'A proposta foi atualizada por outra operação. Atualize os dados e tente novamente.' });
      }
      console.error('[commercial funnel win] failed:', error);
      return res.status(500).json({ ok: false, error: 'Não foi possível converter a proposta em OS.' });
    }
  });

  return router;
}
