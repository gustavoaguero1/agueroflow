import { createHash } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { areaLevelOf, requireArea } from './authMiddleware.ts';
import { getAdmin, type AdminHandles } from './firebaseAdmin.ts';

type Data = Record<string, any>;
class RouteError extends Error { constructor(public status: number, message: string) { super(message); } }
const text = (v: unknown, max = 180) => typeof v === 'string' ? v.trim().slice(0, max) : '';
const validId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 180 && !v.includes('/');
const hashedId = (prefix: string, orgId: string, key: string) => prefix + createHash('sha256').update(`${orgId}:${key}`).digest('hex').slice(0, 48);
const numberOrInvalid = (v: unknown): number => { const n = typeof v === 'number' ? v : Number(v); return Number.isFinite(n) && n >= 0 ? n : -1; };
const dataOf = (snap: { data?: () => Data } | null | undefined): Data => snap?.data?.() ?? {};

function fail(res: Response, error: unknown) {
  if (error instanceof RouteError) return res.status(error.status).json({ ok: false, error: error.message });
  console.error('[work-orders] request failed:', error);
  return res.status(500).json({ ok: false, error: 'Não foi possível concluir a operação da OS. Tente novamente.' });
}

export function createWorkOrderRouter(getH: () => AdminHandles | null = getAdmin): Router {
  const router = Router();

  router.post('/', requireArea('operacoes', 2), async (req: Request, res: Response) => {
    const orgId = req.orgId;
    const actor = req.user;
    const body = req.body ?? {};
    const draft = body.workOrder as Data | undefined;
    const key = text(body.idempotencyKey, 120);
    if (!orgId || body.orgId !== orgId || !actor?.uid || !draft || typeof draft !== 'object') {
      return res.status(400).json({ ok: false, error: 'Empresa, usuário ou dados da OS inválidos.' });
    }
    if (!/^[A-Za-z0-9_-]{8,120}$/.test(key)) return res.status(400).json({ ok: false, error: 'Chave de idempotência inválida.' });

    const unitId = text(draft.unitId, 180);
    const statusId = text(draft.status, 80);
    const title = text(draft.title, 180);
    const description = text(draft.description, 4000);
    const priority = text(draft.priority, 20);
    const orderType = text(draft.orderType, 40);
    const autoNumber = body.autoNumber === true;
    const manualNumber = text(draft.orderNumber, 40);
    if (!unitId || unitId === 'default_unit') return res.status(400).json({ ok: false, error: 'Selecione uma unidade válida antes de criar a OS.' });
    if (!statusId || !title || !description) return res.status(400).json({ ok: false, error: 'Informe status inicial, título e descrição da OS.' });
    if (!['baixa', 'media', 'alta', 'critica'].includes(priority)
      || !['preventiva', 'corretiva', 'emergencial', 'solicitacao', 'instalacao', 'atendimento', 'inspecao', 'outros'].includes(orderType)) {
      return res.status(400).json({ ok: false, error: 'Tipo ou prioridade da OS inválidos.' });
    }
    if (!autoNumber && !manualNumber) return res.status(400).json({ ok: false, error: 'Informe o número da OS ou utilize a numeração automática.' });

    const estimatedHours = numberOrInvalid(draft.estimatedHours ?? 0);
    const requestedEstimatedCost = numberOrInvalid(draft.estimatedCost ?? 0);
    if (estimatedHours < 0 || requestedEstimatedCost < 0) return res.status(400).json({ ok: false, error: 'Horas e custo estimados devem ser números não negativos.' });

    const h = getH();
    if (!h) return res.status(503).json({ ok: false, error: 'Servidor sem acesso ao banco de dados.' });
    const orders = h.db.collection('work_orders');
    const orderRef = orders.doc();
    const eventRef = h.db.collection('order_events').doc(hashedId('wo_create_', orgId, key));
    const counterRef = h.db.collection('counters').doc(`${orgId}_work_orders`);
    const unitRef = h.db.collection('units').doc(unitId);
    const statusRef = h.db.collection('work_order_statuses').doc(`${orgId}_${statusId}`);
    const contractId = text(draft.contractId, 180);
    const costCenterId = text(draft.costCenterId, 180);
    const assetId = text(draft.assetId, 180);
    const contractRef = contractId ? h.db.collection('contracts').doc(contractId) : null;
    const costCenterRef = costCenterId ? h.db.collection('cost_centers').doc(costCenterId) : null;
    const assetRef = assetId ? h.db.collection('assets').doc(assetId) : null;
    const now = new Date().toISOString();
    const year = new Date().getFullYear();

    try {
      const result = await h.db.runTransaction(async (tx) => {
        const oldEvent = await tx.get(eventRef);
        if (oldEvent.exists) {
          const saved = dataOf(oldEvent);
          return { created: false, orderId: String(saved.orderId || ''), orderNumber: String(saved.orderNumber || '') };
        }
        const unitSnap = await tx.get(unitRef);
        const statusSnap = await tx.get(statusRef);
        const counterSnap = await tx.get(counterRef);
        const contractSnap = contractRef ? await tx.get(contractRef) : null;
        const costCenterSnap = costCenterRef ? await tx.get(costCenterRef) : null;
        const assetSnap = assetRef ? await tx.get(assetRef) : null;

        if (!unitSnap.exists || dataOf(unitSnap).orgId !== orgId) throw new RouteError(409, 'A unidade selecionada não pertence à empresa atual ou foi removida.');
        const statusCfg = dataOf(statusSnap);
        if (!statusSnap.exists || statusCfg.orgId !== orgId || statusCfg.id !== statusId || statusCfg.isInitial !== true) {
          throw new RouteError(409, 'A OS precisa iniciar em um status inicial válido configurado para esta empresa.');
        }
        if (contractRef && (!contractSnap?.exists || dataOf(contractSnap).orgId !== orgId)) throw new RouteError(409, 'O contrato selecionado não pertence à empresa atual.');
        if (costCenterRef && (!costCenterSnap?.exists || dataOf(costCenterSnap).orgId !== orgId)) throw new RouteError(409, 'O centro de custo selecionado não pertence à empresa atual.');
        if (assetRef && (!assetSnap?.exists || dataOf(assetSnap).orgId !== orgId)) throw new RouteError(409, 'O ativo selecionado não pertence à empresa atual.');

        let orderNumber = manualNumber;
        let nextSeq: number | undefined;
        if (autoNumber) {
          let seq = Number(dataOf(counterSnap).seq || 0);
          if (!counterSnap.exists) {
            const oldOrders = await tx.get(orders.where('orgId', '==', orgId));
            seq = oldOrders.docs.reduce((max, item) => {
              const match = /^OS-\d{4}-(\d+)$/.exec(String(item.data().orderNumber || ''));
              return match ? Math.max(max, Number(match[1])) : max;
            }, 0);
          }
          nextSeq = seq + 1;
          orderNumber = `OS-${year}-${String(nextSeq).padStart(3, '0')}`;
        } else {
          const duplicates = await tx.get(orders.where('orgId', '==', orgId).where('orderNumber', '==', orderNumber));
          if (duplicates.docs.length) throw new RouteError(409, 'Já existe uma OS com esse número nesta empresa.');
          const manual = new RegExp(`^OS-${year}-(\\d+)$`).exec(orderNumber);
          if (manual && Number(manual[1]) > Number(dataOf(counterSnap).seq || 0)) nextSeq = Number(manual[1]);
        }

        const canSeeCost = areaLevelOf(actor, orgId, 'financeiro') >= 1;
        const record: Data = {
          id: orderRef.id, orgId, unitId,
          ...(contractId ? { contractId } : {}),
          ...(costCenterId ? { costCenterId } : {}),
          ...(assetId ? { assetId } : {}),
          orderNumber, title, description, orderType, priority, status: statusId,
          requesterId: actor.uid,
          requesterName: text(draft.requesterName, 160) || actor.email || actor.uid,
          ...(text(draft.assignedTeam, 120) ? { assignedTeam: text(draft.assignedTeam, 120) } : {}),
          ...(text(draft.assignedTo, 160) ? { assignedTo: text(draft.assignedTo, 160) } : {}),
          ...(text(draft.scheduledStartDate, 20) ? { scheduledStartDate: text(draft.scheduledStartDate, 20) } : {}),
          ...(text(draft.scheduledEndDate, 20) ? { scheduledEndDate: text(draft.scheduledEndDate, 20) } : {}),
          estimatedHours, estimatedCost: canSeeCost ? requestedEstimatedCost : 0,
          isRework: draft.isRework === true,
          ...(draft.isRework === true && text(draft.reworkReason, 1200) ? { reworkReason: text(draft.reworkReason, 1200) } : {}),
          ...(text(draft.notes, 2000) ? { notes: text(draft.notes, 2000) } : {}),
          createdAt: now, updatedAt: now,
        };
        tx.create(orderRef, record);
        tx.create(eventRef, {
          orgId, orderId: orderRef.id, orderNumber, userId: actor.uid, userName: actor.email || actor.uid,
          eventType: 'criacao',
          description: `OS ${orderNumber} criada no status inicial "${statusCfg.name}".`,
          newStatus: statusId, timestamp: now,
        });
        if (nextSeq !== undefined) tx.set(counterRef, { orgId, seq: nextSeq });
        return { created: true, orderId: orderRef.id, orderNumber };
      });
      return res.status(result.created ? 201 : 200).json({ ok: true, ...result });
    } catch (error) {
      return fail(res, error);
    }
  });

  router.post('/:id/transition', requireArea('operacoes', 2), async (req: Request, res: Response) => {
    const orgId = req.orgId;
    const actor = req.user;
    const orderId = req.params.id;
    const body = req.body ?? {};
    const targetStatusId = text(body.targetStatusId, 80);
    const expectedStatus = text(body.expectedStatus, 80);
    const notes = text(body.notes, 2000);
    const key = text(body.idempotencyKey, 120);
    if (!orgId || body.orgId !== orgId || !actor?.uid || !validId(orderId)) return res.status(400).json({ ok: false, error: 'Empresa, usuário ou identificação da OS inválidos.' });
    if (!targetStatusId || !expectedStatus || !/^[A-Za-z0-9_-]{8,120}$/.test(key)) return res.status(400).json({ ok: false, error: 'Informe status de origem, destino e chave de idempotência.' });

    const h = getH();
    if (!h) return res.status(503).json({ ok: false, error: 'Servidor sem acesso ao banco de dados.' });
    const orderRef = h.db.collection('work_orders').doc(orderId);
    const targetRef = h.db.collection('work_order_statuses').doc(`${orgId}_${targetStatusId}`);
    const eventRef = h.db.collection('order_events').doc(hashedId('wo_transition_', `${orgId}:${orderId}`, key));
    const now = new Date().toISOString();
    const role = actor.master ? 'Admin' : actor.orgs?.[orgId] || '';
    const canReopen = actor.master || ['Admin', 'Gerente', 'Supervisor'].includes(role);

    try {
      const result = await h.db.runTransaction(async (tx) => {
        const oldEvent = await tx.get(eventRef);
        if (oldEvent.exists) {
          const saved = dataOf(oldEvent);
          return { changed: false, replayed: true, orderId, status: saved.newStatus || targetStatusId };
        }
        const orderSnap = await tx.get(orderRef);
        const targetSnap = await tx.get(targetRef);
        if (!orderSnap.exists || dataOf(orderSnap).orgId !== orgId) throw new RouteError(404, 'OS não encontrada na empresa selecionada.');
        const order = dataOf(orderSnap);
        const targetCfg = dataOf(targetSnap);
        if (!targetSnap.exists || targetCfg.orgId !== orgId || targetCfg.id !== targetStatusId) throw new RouteError(400, 'O status de destino não existe nesta empresa.');
        if (order.status !== expectedStatus) throw new RouteError(409, 'A OS foi alterada por outra pessoa. Atualize a tela antes de tentar novamente.');
        if (order.status === targetStatusId) return { changed: false, replayed: false, orderId, status: targetStatusId };

        const currentRef = h.db.collection('work_order_statuses').doc(`${orgId}_${String(order.status || '')}`);
        const currentSnap = await tx.get(currentRef);
        const currentCfg = dataOf(currentSnap);
        if (targetCfg.requiresNotes === true && !notes) throw new RouteError(400, `Informe o motivo para mover a OS para "${targetCfg.name}".`);
        if (targetStatusId === 'validado' && !canReopen) throw new RouteError(403, 'Somente Supervisor, Gerente ou Admin pode validar a conclusão da OS.');
        if (currentCfg.isCompleted === true && !targetCfg.isCompleted && !canReopen) throw new RouteError(403, 'Somente Supervisor, Gerente ou Admin pode reabrir uma OS concluída.');
        if (targetCfg.isCompleted === true && order.checklistPending === true) throw new RouteError(409, 'A OS possui checklist pendente e não pode ser concluída.');
        if (targetCfg.isCompleted === true) {
          const unitId = text(order.unitId, 180);
          if (!unitId || unitId === 'default_unit') throw new RouteError(409, 'A OS não possui unidade válida. Corrija o vínculo antes de concluir.');
          const unitSnap = await tx.get(h.db.collection('units').doc(unitId));
          if (!unitSnap.exists || dataOf(unitSnap).orgId !== orgId) throw new RouteError(409, 'A unidade vinculada à OS não pertence mais à empresa atual.');
        }

        const updates: Data = { status: targetStatusId, updatedAt: now };
        if (targetStatusId === 'em_execucao' && !order.actualStartDate) updates.actualStartDate = now.slice(0, 10);
        if (targetCfg.isCompleted === true && !order.actualEndDate) updates.actualEndDate = now.slice(0, 10);
        const desc = notes
          ? `Transição de estado: ${currentCfg.name || order.status} → ${targetCfg.name}. Motivo/Apontamento: ${notes}`
          : `Transição de estado operacional: ${currentCfg.name || order.status} → ${targetCfg.name}`;
        tx.update(orderRef, updates);
        tx.create(eventRef, {
          orgId, orderId, userId: actor.uid, userName: actor.email || actor.uid,
          eventType: 'mudanca_status', description: desc,
          previousStatus: order.status, newStatus: targetStatusId, timestamp: now,
        });
        return { changed: true, replayed: false, orderId, status: targetStatusId, order: { ...order, ...updates } };
      });
      return res.status(200).json({ ok: true, ...result });
    } catch (error) {
      return fail(res, error);
    }
  });

  return router;
}
