import { Router, type Request, type Response } from 'express';
import { requireArea } from './authMiddleware.ts';
import { getAdmin, type AdminHandles } from './firebaseAdmin.ts';
import {
  buildShortageRequisition,
  computeStockReservationSplit,
  reservationDocId,
  type StockReservation,
} from '../src/services/stockReservationRules.ts';

class StockReservationRouteError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const validId = (v: unknown): v is string =>
  typeof v === 'string' && v.trim().length > 0 && v.length <= 180 && !v.includes('/');

const orgOf = (d: Record<string, any> | undefined): string =>
  String(d?.orgId ?? d?.organizationId ?? '');

const round2 = (n: number): number => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;

export function createStockReservationRouter(getH: () => AdminHandles | null = getAdmin): Router {
  const router = Router();

  /**
   * Reserves available stock for a Work Order / Project and automatically generates
   * a Purchase Requisition (RC) for any shortage when autoCreateRequisition !== false.
   */
  router.post('/reserve', requireArea('operacoes', 2), async (req: Request, res: Response) => {
    const orgId = req.orgId;
    const actor = req.user;
    const body = req.body ?? {};
    if (!orgId || !actor || (body.orgId && body.orgId !== orgId)) {
      return res.status(400).json({ ok: false, error: 'Empresa inválida para reserva de material.' });
    }

    const workOrderId = String(body.workOrderId || '').trim();
    const itemId = String(body.itemId || '').trim();
    const unitId = String(body.unitId || '').trim();
    const requestedQty = Number(body.requestedQty);
    const idempotencyKey = String(body.idempotencyKey || `${workOrderId}_${itemId}_${Date.now()}`).trim();
    const autoCreateRequisition = body.autoCreateRequisition !== false;
    const neededByDate = typeof body.neededByDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.neededByDate)
      ? body.neededByDate
      : new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

    if (!validId(workOrderId) || !validId(itemId) || !validId(unitId) || unitId === 'default_unit') {
      return res.status(400).json({ ok: false, error: 'Informe OS, item e unidade operacional válidos.' });
    }
    if (!Number.isFinite(requestedQty) || requestedQty <= 0) {
      return res.status(400).json({ ok: false, error: 'Quantidade solicitada deve ser maior que zero.' });
    }

    const admin = getH();
    if (!admin) return res.status(503).json({ ok: false, error: 'Serviço de dados indisponível.' });

    const resId = reservationDocId(orgId, idempotencyKey);
    const resRef = admin.db.collection('stock_reservations').doc(resId);
    const balRef = admin.db.collection('stock_balances').doc(`bal_${unitId}_${itemId}`);
    const woRef = admin.db.collection('work_orders').doc(workOrderId);
    const itemRef = admin.db.collection('items').doc(itemId);

    try {
      const result = await admin.db.runTransaction(async (tx) => {
        const [existingSnap, woSnap, itemSnap, balSnap, activeResSnap] = await Promise.all([
          tx.get(resRef),
          tx.get(woRef),
          tx.get(itemRef),
          tx.get(balRef),
          tx.get(
            admin.db
              .collection('stock_reservations')
              .where('orgId', '==', orgId)
              .where('unitId', '==', unitId)
              .where('itemId', '==', itemId)
              .where('status', '==', 'ativa'),
          ),
        ]);

        if (existingSnap.exists) {
          return { replayed: true, reservation: existingSnap.data() as StockReservation, requisition: null };
        }
        if (!woSnap.exists || orgOf(woSnap.data()) !== orgId) {
          throw new StockReservationRouteError(404, 'Ordem de serviço não encontrada nesta empresa.');
        }
        if (!itemSnap.exists || orgOf(itemSnap.data()) !== orgId) {
          throw new StockReservationRouteError(404, 'Item do catálogo não encontrado nesta empresa.');
        }

        const wo = woSnap.data() as Record<string, any>;
        const item = itemSnap.data() as Record<string, any>;
        const physicalBalance = Number(balSnap.data()?.currentBalance) || 0;
        const avgCost = typeof balSnap.data()?.averageCost === 'number' ? balSnap.data()!.averageCost : undefined;
        const activeReservations = activeResSnap.docs.map((d) => d.data() as StockReservation);

        const split = computeStockReservationSplit({
          physicalBalance,
          existingActiveReservations: activeReservations,
          requestedQty,
        });

        const nowIso = new Date().toISOString();
        const actorName = actor.email || actor.uid;
        const projectId = typeof body.projectId === 'string' && body.projectId.trim()
          ? body.projectId.trim()
          : typeof wo.projectId === 'string'
          ? wo.projectId
          : undefined;

        let requisition: ReturnType<typeof buildShortageRequisition> | null = null;
        if (split.shortageQty > 0 && autoCreateRequisition) {
          const reqId = `rc_${resId}`;
          const reqCode = `RC-OS-${String(wo.orderNumber || workOrderId).slice(-6)}-${Date.now().toString().slice(-4)}`;
          requisition = buildShortageRequisition({
            requisitionId: reqId,
            requisitionCode: reqCode,
            orgId,
            projectId,
            workOrderId,
            workOrderNumber: wo.orderNumber,
            workOrderTitle: wo.title,
            item: {
              id: itemId,
              sku: String(item.sku || itemId),
              name: String(item.name || item.description || itemId),
              unitOfMeasure: String(item.unitOfMeasure || item.unit || 'UN'),
              unitCost: avgCost,
            },
            shortageQty: split.shortageQty,
            currentStock: split.availableBalance,
            neededByDate,
            actor: { uid: actor.uid, name: actorName },
            nowIso,
          });
          tx.create(admin.db.collection('purchasing_requisitions').doc(reqId), requisition);
        }

        const reservation: StockReservation = {
          id: resId,
          orgId,
          unitId,
          ...(projectId ? { projectId } : {}),
          workOrderId,
          ...(wo.orderNumber ? { workOrderNumber: String(wo.orderNumber) } : {}),
          itemId,
          itemSku: String(item.sku || itemId),
          itemName: String(item.name || item.description || itemId),
          unitOfMeasure: String(item.unitOfMeasure || item.unit || 'UN'),
          requestedQty,
          reservedQty: split.qtyToReserve,
          shortageQty: split.shortageQty,
          status: split.qtyToReserve > 0 ? 'ativa' : 'liberada',
          ...(requisition ? { linkedRequisitionId: requisition.id, linkedRequisitionCode: requisition.code } : {}),
          idempotencyKey,
          createdByUid: actor.uid,
          createdByName: actorName,
          createdAt: nowIso,
          updatedAt: nowIso,
        };

        tx.create(resRef, reservation);
        return { replayed: false, reservation, requisition, breakdown: split };
      });

      return res.status(result.replayed ? 200 : 201).json({ ok: true, ...result });
    } catch (err) {
      if (err instanceof StockReservationRouteError) {
        return res.status(err.status).json({ ok: false, error: err.message });
      }
      console.error('[stock reservation] failed:', err);
      return res.status(500).json({ ok: false, error: 'Não foi possível reservar material no servidor.' });
    }
  });

  router.post('/:reservationId/release', requireArea('operacoes', 2), async (req: Request, res: Response) => {
    const orgId = req.orgId;
    const reservationId = req.params.reservationId;
    if (!orgId || !validId(reservationId)) {
      return res.status(400).json({ ok: false, error: 'Reserva inválida.' });
    }
    const admin = getH();
    if (!admin) return res.status(503).json({ ok: false, error: 'Serviço de dados indisponível.' });

    try {
      const resRef = admin.db.collection('stock_reservations').doc(reservationId);
      const updated = await admin.db.runTransaction(async (tx) => {
        const snap = await tx.get(resRef);
        if (!snap.exists || orgOf(snap.data()) !== orgId) {
          throw new StockReservationRouteError(404, 'Reserva de estoque não encontrada.');
        }
        const rec = snap.data() as StockReservation;
        if (rec.status !== 'ativa') {
          throw new StockReservationRouteError(422, `Apenas reservas ativas podem ser liberadas (status atual: ${rec.status}).`);
        }
        const nowIso = new Date().toISOString();
        tx.update(resRef, { status: 'liberada', releasedAt: nowIso, updatedAt: nowIso });
        return { status: 'liberada', releasedAt: nowIso };
      });
      return res.status(200).json({ ok: true, ...updated });
    } catch (err) {
      if (err instanceof StockReservationRouteError) {
        return res.status(err.status).json({ ok: false, error: err.message });
      }
      console.error('[stock reservation release] failed:', err);
      return res.status(500).json({ ok: false, error: 'Erro ao liberar reserva de estoque.' });
    }
  });

  router.post('/:reservationId/consume', requireArea('operacoes', 2), async (req: Request, res: Response) => {
    const orgId = req.orgId;
    const actor = req.user;
    const reservationId = req.params.reservationId;
    if (!orgId || !actor || !validId(reservationId)) {
      return res.status(400).json({ ok: false, error: 'Reserva inválida.' });
    }
    const admin = getH();
    if (!admin) return res.status(503).json({ ok: false, error: 'Serviço de dados indisponível.' });

    try {
      const resRef = admin.db.collection('stock_reservations').doc(reservationId);
      const outcome = await admin.db.runTransaction(async (tx) => {
        const resSnap = await tx.get(resRef);
        if (!resSnap.exists || orgOf(resSnap.data()) !== orgId) {
          throw new StockReservationRouteError(404, 'Reserva de estoque não encontrada.');
        }
        const rec = resSnap.data() as StockReservation;
        if (rec.status !== 'ativa' || rec.reservedQty <= 0) {
          throw new StockReservationRouteError(422, 'Esta reserva não está ativa com saldo reservado para baixa.');
        }
        const balRef = admin.db.collection('stock_balances').doc(`bal_${rec.unitId}_${rec.itemId}`);
        const balSnap = await tx.get(balRef);
        const currentBal = Number(balSnap.data()?.currentBalance) || 0;
        if (currentBal < rec.reservedQty) {
          throw new StockReservationRouteError(422, `Saldo físico insuficiente para baixar reserva (disponível: ${currentBal}, reservado: ${rec.reservedQty}).`);
        }

        const avgCost = typeof balSnap.data()?.averageCost === 'number' ? balSnap.data()!.averageCost : undefined;
        const balanceAfter = round2(currentBal - rec.reservedQty);
        const nowIso = new Date().toISOString();
        const movementId = `mov_${rec.id}_consume`;

        tx.set(balRef, {
          id: balRef.id,
          orgId,
          unitId: rec.unitId,
          itemId: rec.itemId,
          currentBalance: balanceAfter,
          ...(avgCost !== undefined ? { averageCost: avgCost } : {}),
          updatedAt: nowIso,
        }, { merge: true });

        tx.create(admin.db.collection('stock_movements').doc(movementId), {
          id: movementId,
          orgId,
          unitId: rec.unitId,
          ...(rec.projectId ? { projectId: rec.projectId } : {}),
          itemId: rec.itemId,
          itemSku: rec.itemSku,
          itemName: rec.itemName,
          type: 'saida',
          quantity: rec.reservedQty,
          balanceAfter,
          reason: `Baixa de reserva da OS ${rec.workOrderNumber || rec.workOrderId}`,
          orderId: rec.workOrderId,
          ...(rec.workOrderNumber ? { orderNumber: rec.workOrderNumber } : {}),
          ...(avgCost !== undefined ? { unitCost: avgCost, totalCost: round2(rec.reservedQty * avgCost) } : {}),
          createdBy: actor.uid,
          userName: actor.email || actor.uid,
          createdAt: nowIso,
        });

        tx.update(resRef, { status: 'consumida', consumedAt: nowIso, updatedAt: nowIso });
        return { movementId, balanceAfter, consumedQty: rec.reservedQty };
      });

      return res.status(200).json({ ok: true, ...outcome });
    } catch (err) {
      if (err instanceof StockReservationRouteError) {
        return res.status(err.status).json({ ok: false, error: err.message });
      }
      console.error('[stock reservation consume] failed:', err);
      return res.status(500).json({ ok: false, error: 'Erro ao baixar reserva de estoque.' });
    }
  });

  return router;
}
