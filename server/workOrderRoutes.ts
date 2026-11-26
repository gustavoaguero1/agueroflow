import { createHash } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { requireModuleAccess, requireRole } from './authMiddleware.ts';
import { getAdmin, type AdminHandles } from './firebaseAdmin.ts';
import {
  evaluateWorkOrderSafetyGate,
  isExecutionTransitionStatus,
  isRiskWorkOrder,
  type WorkOrderSafetyGateResult,
} from '../src/services/workOrderSafetyGate.ts';
import {
  buildWorkOrderAndCreationEvent,
  validateWorkOrderCreateInput,
} from '../src/services/workOrderCreateRules.ts';
import { evaluateAssetAvailability } from '../src/services/assetAvailabilityRules.ts';
import type { SafetyPermitRecord, SafetyPermitState } from '../src/types/safety.ts';
import type {
  SafetyComplianceSnapshot,
  SafetyEmployee,
  SafetyPpeCatalogItem,
  SafetyPpeMovement,
  SafetyTrainingCatalogItem,
  SafetyTrainingRecord,
} from '../src/services/safetyCompliance.ts';

class RouteError extends Error {
  constructor(public status: number, message: string, public details?: Record<string, unknown>) {
    super(message);
  }
}

const validId = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= 180 && !value.includes('/');

const transitionOperationId = (orgId: string, orderId: string, key: string): string =>
  createHash('sha256').update(`${orgId}:${orderId}:${key}`).digest('hex');

const formatOrderNumber = (seq: number): string =>
  `OS-${new Date().getFullYear()}-${String(seq).padStart(4, '0')}`;

type TransitionRequest = {
  orgId: string;
  orderId: string;
  expectedStatus: string;
  targetStatusId: string;
  notes: string;
  idempotencyKey: string;
  actorUid: string;
};

async function loadSafetyGateResult(
  reader: { get: (ref: any) => Promise<any> },
  db: AdminHandles['db'],
  orgId: string,
  order: Record<string, any>,
  nowIso: string,
): Promise<WorkOrderSafetyGateResult> {
  if (!isRiskWorkOrder(order)) {
    return { requiresGate: false, allowed: true, blockers: [], checkedEmployeeCount: 0 };
  }

  const permitId = typeof order.safetyPermitId === 'string' ? order.safetyPermitId.trim() : '';
  const [permitSnap, permitStateSnap, dirSnap, ppeCatSnap, ppeMovSnap, trainCatSnap, trainRecSnap] =
    await Promise.all([
      permitId ? reader.get(db.collection('safety_permits').doc(permitId)) : Promise.resolve(null),
      permitId ? reader.get(db.collection('safety_permit_states').doc(permitId)) : Promise.resolve(null),
      reader.get(db.collection('rh_directory').where('orgId', '==', orgId)),
      reader.get(db.collection('safety_ppe_catalog').where('orgId', '==', orgId)),
      reader.get(db.collection('safety_ppe_movements').where('orgId', '==', orgId)),
      reader.get(db.collection('safety_training_catalog').where('orgId', '==', orgId)),
      reader.get(db.collection('safety_training_records').where('orgId', '==', orgId)),
    ]);

  const permit = permitSnap?.exists ? ({ id: permitSnap.id, ...permitSnap.data() } as SafetyPermitRecord) : null;
  const permitState = permitStateSnap?.exists
    ? ({ id: permitStateSnap.id, ...permitStateSnap.data() } as SafetyPermitState)
    : null;

  const compliance: SafetyComplianceSnapshot = {
    loading: false,
    employees: (dirSnap?.docs ?? []).map((d: any) => ({ id: d.id, ...d.data() }) as SafetyEmployee),
    ppeCatalog: (ppeCatSnap?.docs ?? []).map((d: any) => ({ id: d.id, ...d.data() }) as SafetyPpeCatalogItem),
    ppeMovements: (ppeMovSnap?.docs ?? []).map((d: any) => ({ id: d.id, ...d.data() }) as SafetyPpeMovement),
    trainingCatalog: (trainCatSnap?.docs ?? []).map((d: any) => ({ id: d.id, ...d.data() }) as SafetyTrainingCatalogItem),
    trainingRecords: (trainRecSnap?.docs ?? []).map((d: any) => ({ id: d.id, ...d.data() }) as SafetyTrainingRecord),
    legacyTrainingRecords: [],
  };

  return evaluateWorkOrderSafetyGate({
    order: {
      id: String(order.id || ''),
      orgId,
      unitId: String(order.unitId || ''),
      contractId: typeof order.contractId === 'string' ? order.contractId : undefined,
      requiresSafetyPermit: order.requiresSafetyPermit === true,
      safetyPermitType: order.safetyPermitType,
      safetyPermitId: permitId || undefined,
      assignedEmployeeIds: Array.isArray(order.assignedEmployeeIds) ? order.assignedEmployeeIds : undefined,
    },
    permit,
    permitState,
    compliance,
    nowIso,
  });
}

export function createWorkOrderRouter(getH: () => AdminHandles | null = getAdmin): Router {
  const router = Router();

  router.post('/', requireModuleAccess('ordens', 2), async (req: Request, res: Response) => {
    const orgId = req.orgId;
    const actor = req.user;
    if (!orgId || !actor || (req.body?.orgId && req.body.orgId !== orgId)) {
      return res.status(400).json({ ok: false, error: 'Empresa inválida para criação da OS.' });
    }
    const validation = validateWorkOrderCreateInput({ ...(req.body || {}), orgId });
    if (!validation.valid || !validation.normalized) {
      return res.status(400).json({ ok: false, error: validation.errors[0] || 'Dados inválidos para criação da OS.', errors: validation.errors });
    }
    const admin = getH();
    if (!admin) return res.status(503).json({ ok: false, error: 'Serviço de dados indisponível.' });

    const normalized = validation.normalized;
    const autoNumber = req.body?.autoNumber !== false && !normalized.orderNumber;
    const requestedOrderId = validId(req.body?.id) ? String(req.body.id).trim() : `os_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const canViewFinancials = req.body?.canViewFinancials !== false;

    try {
      const result = await admin.db.runTransaction(async (tx) => {
        const unitRef = admin.db.collection('units').doc(normalized.unitId);
        const contractRef = normalized.contractId ? admin.db.collection('contracts').doc(normalized.contractId) : null;
        const ccRef = normalized.costCenterId ? admin.db.collection('cost_centers').doc(normalized.costCenterId) : null;
        const projectRef = normalized.projectId ? admin.db.collection('projects').doc(normalized.projectId) : null;
        const assetRef = normalized.assetId ? admin.db.collection('assets').doc(normalized.assetId) : null;
        const statusesQuery = admin.db.collection('work_order_statuses').where('orgId', '==', orgId);
        const counterRef = admin.db.collection('org_counters').doc(`${orgId}_work_orders`);
        const orderRef = admin.db.collection('work_orders').doc(requestedOrderId);

        const [unitSnap, contractSnap, ccSnap, projectSnap, assetSnap, statusesSnap, counterSnap, existingOrderSnap] =
          await Promise.all([
            tx.get(unitRef),
            contractRef ? tx.get(contractRef) : Promise.resolve(null),
            ccRef ? tx.get(ccRef) : Promise.resolve(null),
            projectRef ? tx.get(projectRef) : Promise.resolve(null),
            assetRef ? tx.get(assetRef) : Promise.resolve(null),
            tx.get(statusesQuery),
            tx.get(counterRef),
            tx.get(orderRef),
          ]);

        if (existingOrderSnap.exists) {
          throw new RouteError(409, 'Já existe uma OS com este identificador.');
        }
        if (!unitSnap.exists || (unitSnap.data()?.orgId ?? unitSnap.data()?.organizationId) !== orgId) {
          throw new RouteError(400, 'Unidade operacional não encontrada nesta empresa.');
        }
        if (contractRef && (!contractSnap?.exists || (contractSnap.data()?.orgId ?? contractSnap.data()?.organizationId) !== orgId)) {
          throw new RouteError(400, 'Contrato informado não pertence a esta empresa.');
        }
        if (ccRef && (!ccSnap?.exists || (ccSnap.data()?.orgId ?? ccSnap.data()?.organizationId) !== orgId)) {
          throw new RouteError(400, 'Centro de custo informado não pertence a esta empresa.');
        }
        if (projectRef && (!projectSnap?.exists || (projectSnap.data()?.orgId ?? projectSnap.data()?.organizationId) !== orgId)) {
          throw new RouteError(400, 'Projeto/Obra informado não pertence a esta empresa.');
        }
        if (assetRef) {
          if (!assetSnap?.exists || (assetSnap.data()?.orgId ?? assetSnap.data()?.organizationId) !== orgId) {
            throw new RouteError(400, 'Ativo/equipamento informado não pertence a esta empresa.');
          }
          const availability = evaluateAssetAvailability(assetSnap.data() as any, new Date().toISOString());
          if (!availability.available && normalized.orderType !== 'corretiva' && normalized.orderType !== 'preventiva') {
            throw new RouteError(422, availability.blockers.join(' '));
          }
        }

        const statuses: Array<{ id: string; name?: string; isInitial?: boolean }> = statusesSnap.docs.map((d) => {
          const data = d.data() as Record<string, any>;
          return { id: d.id, name: typeof data.name === 'string' ? data.name : d.id, isInitial: data.isInitial === true };
        });
        let chosenStatus: { id: string; name?: string; isInitial?: boolean } | undefined;
        if (normalized.status) {
          chosenStatus = statuses.find((s) => s.id === normalized.status);
          if (!chosenStatus && statuses.length === 0 && normalized.status === 'aberto') {
            chosenStatus = { id: 'aberto', name: 'Aberto', isInitial: true };
          }
          if (!chosenStatus) {
            throw new RouteError(400, 'Status inicial informado não existe nesta empresa.');
          }
          if (statuses.length > 0 && chosenStatus.isInitial !== true) {
            throw new RouteError(400, 'A criação de OS exige um status configurado como inicial (isInitial: true).');
          }
        } else {
          chosenStatus = statuses.find((s) => s.isInitial === true)
            || (statuses.length === 0 ? { id: 'aberto', name: 'Aberto', isInitial: true } : undefined);
          if (!chosenStatus) {
            throw new RouteError(400, 'Configure um status inicial explícito (isInitial: true) antes de criar OS.');
          }
        }

        let orderNumber = normalized.orderNumber || '';
        if (autoNumber || !orderNumber) {
          const prevSeq = Number(counterSnap.data()?.seq) || 0;
          const nextSeq = prevSeq + 1;
          orderNumber = formatOrderNumber(nextSeq);
          tx.set(counterRef, { orgId, seq: nextSeq, updatedAt: new Date().toISOString() }, { merge: true });
        }

        const nowIso = new Date().toISOString();
        const userName = actor.email || 'Usuário';
        const { order, creationEvent } = buildWorkOrderAndCreationEvent({
          orderId: requestedOrderId,
          orgId,
          orderNumber,
          statusId: chosenStatus.id,
          statusName: String(chosenStatus.name || chosenStatus.id),
          normalized,
          actor: { uid: actor.uid, name: userName },
          nowIso,
          canViewFinancials,
        });

        tx.create(orderRef, order);
        tx.create(admin.db.collection('order_events').doc(creationEvent.id), creationEvent);
        return { order, creationEvent };
      });

      return res.status(201).json({ ok: true, ...result });
    } catch (error) {
      if (error instanceof RouteError) {
        return res.status(error.status).json({ ok: false, error: error.message });
      }
      console.error('[work order create] failed:', error);
      return res.status(500).json({ ok: false, error: 'Não foi possível criar a ordem de serviço no servidor.' });
    }
  });

  router.post('/:orderId/safety-check', requireModuleAccess('ordens', 1), async (req: Request, res: Response) => {
    const orgId = req.orgId;
    const orderId = req.params.orderId;
    if (!orgId || (req.body?.orgId && req.body.orgId !== orgId) || !validId(orderId)) {
      return res.status(400).json({ ok: false, error: 'Informe empresa e OS válidas.' });
    }
    const admin = getH();
    if (!admin) return res.status(503).json({ ok: false, error: 'Serviço de dados indisponível.' });

    try {
      const orderSnap = await admin.db.collection('work_orders').doc(orderId).get();
      if (!orderSnap.exists) return res.status(404).json({ ok: false, error: 'Ordem de serviço não encontrada.' });
      const order: Record<string, any> = { id: orderSnap.id, ...(orderSnap.data() as Record<string, any>) };
      if (order.orgId !== orgId) return res.status(404).json({ ok: false, error: 'Ordem de serviço não encontrada.' });

      const gate = await loadSafetyGateResult(
        { get: (ref: any) => ref.get() },
        admin.db,
        orgId,
        order,
        new Date().toISOString(),
      );
      return res.status(200).json({ ok: true, ...gate });
    } catch (error) {
      console.error('[work order safety-check] failed:', error);
      return res.status(500).json({ ok: false, error: 'Não foi possível validar a prontidão de SMS da OS.' });
    }
  });

  router.post('/:orderId/status', requireModuleAccess('ordens', 2), async (req: Request, res: Response) => {
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
        const order: Record<string, any> = { id: orderSnap.id, ...(orderSnap.data() as Record<string, any>) };
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

        let safetyGateVerified: Record<string, unknown> | undefined;
        if (isRiskWorkOrder(order) && isExecutionTransitionStatus(targetStatusId)) {
          const gate = await loadSafetyGateResult(tx, admin.db, orgId, order, now);
          if (!gate.allowed) {
            const summary = gate.blockers.map((b) => b.message).join(' | ');
            throw new RouteError(
              422,
              `Execução bloqueada pelo SMS: ${summary}`,
              { blockers: gate.blockers },
            );
          }
          safetyGateVerified = {
            permitId: gate.permitId,
            permitCode: gate.permitCode,
            permitType: gate.permitType,
            checkedEmployeeCount: gate.checkedEmployeeCount,
            verifiedAt: now,
          };
        }

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
          meta: {
            idempotencyKey,
            ...(safetyGateVerified ? { safetyGateVerified } : {}),
          },
        };

        tx.update(orderRef, orderUpdates);
        tx.create(eventRef, event);
        tx.create(operationRef, { ...request, eventId, orderUpdates, createdAt: now });

        return { replayed: false, eventId, orderUpdates, ...(safetyGateVerified ? { safetyGateVerified } : {}) };
      });

      return res.status(200).json({ ok: true, ...result });
    } catch (error) {
      if (error instanceof RouteError) {
        return res.status(error.status).json({
          ok: false,
          error: error.message,
          ...(error.details ?? {}),
        });
      }
      const code = (error as { code?: number | string })?.code;
      if (code === 6 || code === 'already-exists' || code === 10 || code === 'aborted') {
        return res.status(409).json({ ok: false, error: 'A OS foi alterada em paralelo. Atualize os dados antes de tentar novamente.' });
      }
      console.error('[work order transition] failed:', error);
      return res.status(500).json({ ok: false, error: 'Não foi possível atualizar a OS no servidor.' });
    }
  });

  router.post('/:orderId/reservation-approval', requireModuleAccess('ordens', 2), requireRole('Admin', 'Gerente', 'Supervisor'), async (req: Request, res: Response) => {
    const orgId = req.orgId;
    const actor = req.user;
    const orderId = req.params.orderId;
    const body = req.body ?? {};
    const idempotencyKey = body.idempotencyKey;
    const expectedStatus = body.expectedStatus;

    if (!orgId || body.orgId !== orgId || !validId(orderId) || !validId(expectedStatus)
      || typeof idempotencyKey !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(idempotencyKey)) {
      return res.status(400).json({ ok: false, error: 'Informe os dados válidos para aprovar a reserva da OS.' });
    }
    if (!actor?.uid) return res.status(401).json({ ok: false, error: 'Usuário não autenticado.' });
    const admin = getH();
    if (!admin) return res.status(503).json({ ok: false, error: 'Serviço de dados indisponível.' });

    const opId = createHash('sha256')
      .update(`${orgId}:${orderId}:reservation-approval:${idempotencyKey}`)
      .digest('hex');
    const opRef = admin.db.collection('work_order_transition_ops').doc(opId);
    const orderRef = admin.db.collection('work_orders').doc(orderId);
    const statusRef = admin.db.collection('work_order_statuses').doc(`${orgId}_em_execucao`);
    const eventId = `os_evt_reservation_${opId}`;
    const eventRef = admin.db.collection('order_events').doc(eventId);
    const messageId = `os_msg_reservation_${opId}`;
    const messageRef = admin.db.collection('order_messages').doc(messageId);

    try {
      const result = await admin.db.runTransaction(async (tx) => {
        const opSnap = await tx.get(opRef);
        if (opSnap.exists) {
          const previous = opSnap.data() as Record<string, any>;
          if (previous.orgId !== orgId || previous.orderId !== orderId
            || previous.actorUid !== actor.uid || previous.expectedStatus !== expectedStatus
            || previous.action !== 'reservation_approval') {
            throw new RouteError(409, 'Esta chave de operação já foi usada em outra ação.');
          }
          return { replayed: true, orderUpdates: previous.orderUpdates, eventId: previous.eventId, messageId: previous.messageId };
        }

        const [orderSnap, statusSnap] = await Promise.all([tx.get(orderRef), tx.get(statusRef)]);
        if (!orderSnap.exists || orderSnap.data()?.orgId !== orgId) {
          throw new RouteError(404, 'Ordem de serviço não encontrada.');
        }
        const order = orderSnap.data() as Record<string, any>;
        if (order.status !== expectedStatus) {
          throw new RouteError(409, 'A OS foi alterada por outra pessoa. Atualize os dados antes de aprovar a reserva.');
        }
        const hasBlockedParts = Array.isArray(order.plannedParts)
          && order.plannedParts.some((part: any) => ['solicitado', 'aguardando_compra'].includes(part?.status));
        const approvalPending = order.isBlockedByReservation === true
          || order.reservationApprovalStatus === 'pendente'
          || order.status === 'em_aprovacao'
          || hasBlockedParts;
        if (!approvalPending) {
          throw new RouteError(409, 'Esta OS não possui uma reserva pendente de aprovação.');
        }
        if (!statusSnap.exists || statusSnap.data()?.orgId !== orgId || statusSnap.data()?.id !== 'em_execucao') {
          throw new RouteError(400, 'O estado "Em Execução" não está configurado para esta empresa.');
        }

        const now = new Date().toISOString();
        const today = now.slice(0, 10);
        const userName = actor.email || actor.uid;
        // Esta ação representa a confirmação explícita do gestor de que os itens reservados podem ser liberados.
        const updatedParts = (Array.isArray(order.plannedParts) ? order.plannedParts : []).map((part: any) => ({
          ...part,
          status: ['solicitado', 'aguardando_compra'].includes(part?.status) ? 'disponivel' : part.status,
        }));
        const orderUpdates = {
          status: 'em_execucao',
          isBlockedByReservation: false,
          reservationApprovalStatus: 'aprovado',
          reservationApprovedBy: userName,
          reservationApprovedAt: now,
          plannedParts: updatedParts,
          actualStartDate: order.actualStartDate || today,
          updatedAt: now,
        };
        const event = {
          id: eventId,
          orgId,
          orderId,
          userId: actor.uid,
          userName,
          eventType: 'aprovacao',
          description: 'Reserva de peças aprovada pela gestão. Itens reservados liberados para execução.',
          previousStatus: expectedStatus,
          newStatus: 'em_execucao',
          timestamp: now,
          meta: { idempotencyKey },
        };
        const message = {
          id: messageId,
          orgId,
          orderId,
          senderId: actor.uid,
          senderName: userName,
          senderRole: 'Superior',
          messageType: 'liberacao',
          content: 'Reserva de peças aprovada pela gestão. Os itens reservados foram liberados para execução.',
          createdAt: now,
          resolved: true,
          resolvedAt: now,
          resolvedBy: actor.uid,
          resolvedByName: userName,
        };

        tx.update(orderRef, orderUpdates);
        tx.create(eventRef, event);
        tx.create(messageRef, message);
        tx.create(opRef, {
          id: opId,
          orgId,
          orderId,
          actorUid: actor.uid,
          expectedStatus,
          action: 'reservation_approval',
          idempotencyKey,
          eventId,
          messageId,
          orderUpdates,
          createdAt: now,
        });
        return { replayed: false, orderUpdates, eventId, messageId };
      });

      return res.status(200).json({ ok: true, ...result });
    } catch (error) {
      if (error instanceof RouteError) {
        return res.status(error.status).json({ ok: false, error: error.message });
      }
      const code = (error as { code?: number | string })?.code;
      if (code === 6 || code === 'already-exists' || code === 10 || code === 'aborted') {
        return res.status(409).json({ ok: false, error: 'A reserva da OS foi alterada em paralelo. Atualize os dados antes de tentar novamente.' });
      }
      console.error('[work order reservation approval] failed:', error);
      return res.status(500).json({ ok: false, error: 'Não foi possível aprovar a reserva da OS no servidor.' });
    }
  });

  return router;
}
