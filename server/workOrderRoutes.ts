import { createHash } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { requireArea } from './authMiddleware.ts';
import { getAdmin, type AdminHandles } from './firebaseAdmin.ts';

class RouteError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const validId = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= 180 && !value.includes('/');

const transitionOperationId = (orgId: string, orderId: string, key: string): string =>
  createHash('sha256').update(`${orgId}:${orderId}:${key}`).digest('hex');

type TransitionRequest = {
  orgId: string;
  orderId: string;
  expectedStatus: string;
  targetStatusId: string;
  notes: string;
  idempotencyKey: string;
  actorUid: string;
};

export function createWorkOrderRouter(getH: () => AdminHandles | null = getAdmin): Router {
  const router = Router();

  router.post('/:orderId/status', requireArea('operacoes', 2), async (req: Request, res: Response) => {
    const orgId = req.orgId;
    const actor = req.user;
    const orderId = req.params.orderId;
    const body = req.body ?? {};
    const expectedStatus = body.expectedStatus;
    const targetStatusId = body.targetStatusId;
    const idempotencyKey = body.idempotencyKey;
    const notes = body.notes === undefined ? '' : body.notes;

    if (!orgId || body.orgId !== orgId || !validId(orderId) || !validId(expectedStatus)
      || !validId(targetStatusId) || typeof idempotencyKey !== 'string'
      || !/^[A-Za-z0-9_-]{8,128}$/.test(idempotencyKey)
      || typeof notes !== 'string' || notes.length > 1500) {
      return res.status(400).json({ ok: false, error: 'Informe os dados válidos para a transição da OS.' });
    }
    if (!actor?.uid) return res.status(401).json({ ok: false, error: 'Usuário não autenticado.' });

    const admin = getH();
    if (!admin) return res.status(503).json({ ok: false, error: 'Serviço de dados indisponível.' });

    const request: TransitionRequest = {
      orgId,
      orderId,
      expectedStatus,
      targetStatusId,
      notes: notes.trim(),
      idempotencyKey,
      actorUid: actor.uid,
    };

    const operationId = transitionOperationId(orgId, orderId, idempotencyKey);
    const operationRef = admin.db.collection('work_order_transition_ops').doc(operationId);
    const orderRef = admin.db.collection('work_orders').doc(orderId);
    const targetStatusRef = admin.db.collection('work_order_statuses').doc(`${orgId}_${targetStatusId}`);
    const eventId = `os_evt_${operationId}`;
    const eventRef = admin.db.collection('order_events').doc(eventId);

    try {
      const result = await admin.db.runTransaction(async (tx) => {
        const operationSnap = await tx.get(operationRef);
        if (operationSnap.exists) {
          const previous = operationSnap.data() as TransitionRequest & { eventId: string; orderUpdates: Record<string, string> };
          const matches = previous.orgId === request.orgId
            && previous.orderId === request.orderId
            && previous.expectedStatus === request.expectedStatus
            && previous.targetStatusId === request.targetStatusId
            && previous.notes === request.notes
            && previous.actorUid === request.actorUid;
          if (!matches) throw new RouteError(409, 'Esta chave de operação já foi usada em outra transição.');
          return {
            replayed: true,
            eventId: previous.eventId,
            orderUpdates: previous.orderUpdates,
          };
        }

        const currentStatusRef = admin.db.collection('work_order_statuses').doc(`${orgId}_${expectedStatus}`);
        const [orderSnap, targetStatusSnap, currentStatusSnap] = await Promise.all([
          tx.get(orderRef),
          tx.get(targetStatusRef),
          tx.get(currentStatusRef),
        ]);

        if (!orderSnap.exists) throw new RouteError(404, 'Ordem de serviço não encontrada.');
        const order = orderSnap.data() as Record<string, any>;
        if (order.orgId !== orgId) throw new RouteError(404, 'Ordem de serviço não encontrada.');
        if (String(order.status ?? '') !== expectedStatus) {
          throw new RouteError(409, 'A OS foi atualizada por outra pessoa. Atualize os dados e tente novamente.');
        }
        if (!targetStatusSnap.exists) throw new RouteError(400, 'O estado de destino não está configurado para esta empresa.');

        const targetStatus = targetStatusSnap.data() as Record<string, any>;
        if (targetStatus.orgId !== orgId || (targetStatus.id && targetStatus.id !== targetStatusId)) {
          throw new RouteError(400, 'O estado de destino não pertence à empresa selecionada.');
        }
        if (expectedStatus === targetStatusId) throw new RouteError(409, 'A OS já está neste estado.');

        const currentStatus = currentStatusSnap?.exists
          ? currentStatusSnap.data() as Record<string, any>
          : undefined;
        const leavingCompletedState = currentStatus?.isCompleted === true
          || ['concluido', 'concluida', 'validado', 'encerrado'].includes(expectedStatus);
        if ((targetStatus.requiresNotes === true || leavingCompletedState) && !request.notes) {
          throw new RouteError(400, leavingCompletedState
            ? 'Informe o motivo para reabrir ou retirar a OS de um estado concluído.'
            : 'Informe o motivo obrigatório para este estado.');
        }

        const now = new Date().toISOString();
        const today = now.slice(0, 10);
        const orderUpdates: Record<string, string> = {
          status: targetStatusId,
          updatedAt: now,
        };
        if (targetStatusId === 'em_execucao' && !order.actualStartDate) {
          orderUpdates.actualStartDate = today;
        }
        if (targetStatus.isCompleted === true && !order.actualEndDate) {
          orderUpdates.actualEndDate = today;
        }

        const currentName = currentStatus?.name || expectedStatus;
        const targetName = targetStatus.name || targetStatusId;
        const description = request.notes
          ? `Transição de estado: ${currentName} → ${targetName}. Motivo/Apontamento: ${request.notes}`
          : `Transição de estado operacional: ${currentName} → ${targetName}`;
        const event = {
          id: eventId,
          orgId,
          orderId,
          userId: actor.uid,
          userName: actor.email || actor.uid,
          eventType: 'mudanca_status',
          description,
          previousStatus: expectedStatus,
          newStatus: targetStatusId,
          timestamp: now,
          meta: { idempotencyKey },
        };

        tx.update(orderRef, orderUpdates);
        tx.create(eventRef, event);
        tx.create(operationRef, { ...request, eventId, orderUpdates, createdAt: now });

        return { replayed: false, eventId, orderUpdates };
      });

      return res.status(200).json({ ok: true, ...result });
    } catch (error) {
      if (error instanceof RouteError) {
        return res.status(error.status).json({ ok: false, error: error.message });
      }
      const code = (error as { code?: number | string })?.code;
      if (code === 6 || code === 'already-exists' || code === 10 || code === 'aborted') {
        return res.status(409).json({ ok: false, error: 'A OS foi alterada em paralelo. Atualize os dados antes de tentar novamente.' });
      }
      console.error('[work order transition] failed:', error);
      return res.status(500).json({ ok: false, error: 'Não foi possível atualizar a OS no servidor.' });
    }
  });

  return router;
}
