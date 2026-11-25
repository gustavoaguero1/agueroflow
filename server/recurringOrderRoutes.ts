import { Router, type Request, type Response } from 'express';
import { requireArea } from './authMiddleware.ts';
import { getAdmin, type AdminHandles } from './firebaseAdmin.ts';
import {
  advanceRecurringRunDate,
  canExecuteRecurringOrder,
  canTransitionRecurringLifecycle,
  recurringRunId,
  type RecurringOrderConfig,
  type RecurringOrderLifecycleStatus,
  type RecurringOrderRunRecord,
} from '../src/services/recurringOrderRules.ts';
import { evaluateAssetAvailability } from '../src/services/assetAvailabilityRules.ts';

class RecurringRouteError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const validId = (v: unknown): v is string =>
  typeof v === 'string' && v.trim().length > 0 && v.length <= 180 && !v.includes('/');

const orgOf = (d: Record<string, any> | undefined): string =>
  String(d?.orgId ?? d?.organizationId ?? '');

const formatOrderNumber = (seq: number): string =>
  `OS-${new Date().getFullYear()}-${String(seq).padStart(4, '0')}`;

async function executeRecurringOrderOnce(params: {
  admin: AdminHandles;
  orgId: string;
  recurringId: string;
  actorUid: string;
  actorName: string;
}): Promise<{
  replayed: boolean;
  run: RecurringOrderRunRecord;
  workOrderId?: string;
  workOrderNumber?: string;
  nextRunDate?: string;
}> {
  const { admin, orgId, recurringId, actorUid, actorName } = params;
  const recRef = admin.db.collection('recurring_orders').doc(recurringId);
  const counterRef = admin.db.collection('org_counters').doc(`${orgId}_work_orders`);

  try {
    return await admin.db.runTransaction(async (tx) => {
      const recSnap = await tx.get(recRef);
      if (!recSnap.exists || orgOf(recSnap.data()) !== orgId) {
        throw new RecurringRouteError(404, 'Plano de recorrência não encontrado nesta empresa.');
      }
      const rec = { ...(recSnap.data() as RecurringOrderConfig), id: recSnap.id };
      const check = canExecuteRecurringOrder(rec);
      if (!check.allowed) {
        throw new RecurringRouteError(422, check.reason || 'Plano recorrente indisponível para geração.');
      }

      const periodDate = rec.nextRunDate.trim();
      const runId = recurringRunId(orgId, recurringId, periodDate);
      const runRef = admin.db.collection('recurring_order_runs').doc(runId);

      const unitRef = admin.db.collection('units').doc(rec.unitId);
      const assetRef = rec.assetId ? admin.db.collection('assets').doc(rec.assetId) : null;
      const [existingRunSnap, unitSnap, assetSnap, counterSnap] = await Promise.all([
        tx.get(runRef),
        tx.get(unitRef),
        assetRef ? tx.get(assetRef) : Promise.resolve(null),
        tx.get(counterRef),
      ]);

      if (existingRunSnap.exists) {
        const existingRun = existingRunSnap.data() as RecurringOrderRunRecord;
        return {
          replayed: true,
          run: existingRun,
          workOrderId: existingRun.workOrderId,
          workOrderNumber: existingRun.workOrderNumber,
          nextRunDate: existingRun.nextRunDateAfter || rec.nextRunDate,
        };
      }

      if (!unitSnap.exists || orgOf(unitSnap.data()) !== orgId) {
        throw new RecurringRouteError(422, 'Unidade do plano recorrente não encontrada nesta empresa.');
      }

      const nowIso = new Date().toISOString();
      if (assetRef) {
        if (!assetSnap?.exists || orgOf(assetSnap.data()) !== orgId) {
          throw new RecurringRouteError(422, 'Ativo vinculado ao plano recorrente não pertence a esta empresa.');
        }
        const avail = evaluateAssetAvailability(assetSnap.data() as any, nowIso);
        if (!avail.available) {
          throw new RecurringRouteError(422, avail.blockers.join(' '));
        }
      }

      const prevSeq = Number(counterSnap.data()?.seq) || 0;
      const nextSeq = prevSeq + 1;
      const orderNumber = formatOrderNumber(nextSeq);
      const workOrderId = `os_${runId}`;
      const eventId = `${workOrderId}_created`;
      const nextRunDate = advanceRecurringRunDate(periodDate, rec.frequency, {
        exceptionDates: rec.exceptionDates,
        skipWeekends: rec.skipWeekends,
      });

      const workOrder = {
        id: workOrderId,
        orgId,
        unitId: rec.unitId,
        ...(rec.projectId ? { projectId: rec.projectId } : {}),
        ...(rec.contractId ? { contractId: rec.contractId } : {}),
        ...(rec.costCenterId ? { costCenterId: rec.costCenterId } : {}),
        ...(rec.assetId ? { assetId: rec.assetId } : {}),
        ...(rec.checklistTemplateId ? { checklistTemplateId: rec.checklistTemplateId } : {}),
        orderNumber,
        title: `[Preventiva Periódica] ${rec.title}`,
        description: rec.description || '',
        orderType: 'preventiva',
        priority: rec.priority || 'media',
        status: 'planejada',
        requesterId: actorUid,
        requesterName: actorName,
        ...(rec.assignedTeam ? { assignedTeam: rec.assignedTeam } : {}),
        scheduledStartDate: periodDate,
        estimatedHours: 0,
        estimatedCost: 0,
        notes: `Gerada de forma idempotente pelo plano recorrente "${rec.title}" (${rec.frequency}, período ${periodDate}).`,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      const creationEvent = {
        id: eventId,
        orgId,
        orderId: workOrderId,
        userId: actorUid,
        userName: actorName,
        eventType: 'criacao',
        description: `OS ${orderNumber} gerada pelo agendador recorrente (${rec.frequency}, período ${periodDate}).`,
        newStatus: 'planejada',
        timestamp: nowIso,
      };

      const runRecord: RecurringOrderRunRecord = {
        id: runId,
        orgId,
        recurringOrderId: recurringId,
        periodDate,
        status: 'generated',
        workOrderId,
        workOrderNumber: orderNumber,
        nextRunDateAfter: nextRunDate,
        triggeredByUid: actorUid,
        triggeredByName: actorName,
        createdAt: nowIso,
      };

      tx.set(counterRef, { orgId, seq: nextSeq, updatedAt: nowIso }, { merge: true });
      tx.create(admin.db.collection('work_orders').doc(workOrderId), workOrder);
      tx.create(admin.db.collection('order_events').doc(eventId), creationEvent);
      tx.create(runRef, runRecord);
      tx.update(recRef, {
        nextRunDate,
        lastRunDate: periodDate,
        lastRunOrderId: workOrderId,
        lastRunError: null,
        lastRunFailedAt: null,
        updatedAt: nowIso,
      });

      return {
        replayed: false,
        run: runRecord,
        workOrderId,
        workOrderNumber: orderNumber,
        nextRunDate,
      };
    });
  } catch (err) {
    if (err instanceof RecurringRouteError && err.status === 422) {
      const nowIso = new Date().toISOString();
      try {
        await recRef.update({
          lastRunError: err.message,
          lastRunFailedAt: nowIso,
          updatedAt: nowIso,
        });
      } catch {
        // Ignore if doc disappeared
      }
    }
    throw err;
  }
}

export function createRecurringOrderRouter(getH: () => AdminHandles | null = getAdmin): Router {
  const router = Router();

  router.post('/:recurringId/run', requireArea('operacoes', 2), async (req: Request, res: Response) => {
    const orgId = req.orgId;
    const actor = req.user;
    const recurringId = req.params.recurringId;
    if (!orgId || !actor || (req.body?.orgId && req.body.orgId !== orgId) || !validId(recurringId)) {
      return res.status(400).json({ ok: false, error: 'Informe empresa e recorrência válidas.' });
    }
    const admin = getH();
    if (!admin) return res.status(503).json({ ok: false, error: 'Serviço de dados indisponível.' });

    try {
      const result = await executeRecurringOrderOnce({
        admin,
        orgId,
        recurringId,
        actorUid: actor.uid,
        actorName: actor.email || actor.uid,
      });
      return res.status(result.replayed ? 200 : 201).json({ ok: true, ...result });
    } catch (err) {
      if (err instanceof RecurringRouteError) {
        return res.status(err.status).json({ ok: false, error: err.message });
      }
      console.error('[recurring order run] failed:', err);
      return res.status(500).json({ ok: false, error: 'Não foi possível gerar a OS recorrente no servidor.' });
    }
  });

  router.post('/run-due', requireArea('operacoes', 2), async (req: Request, res: Response) => {
    const orgId = req.orgId;
    const actor = req.user;
    if (!orgId || !actor || (req.body?.orgId && req.body.orgId !== orgId)) {
      return res.status(400).json({ ok: false, error: 'Empresa inválida.' });
    }
    const admin = getH();
    if (!admin) return res.status(503).json({ ok: false, error: 'Serviço de dados indisponível.' });

    const referenceDate = typeof req.body?.referenceDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.body.referenceDate)
      ? req.body.referenceDate
      : new Date().toISOString().slice(0, 10);

    try {
      const snap = await admin.db.collection('recurring_orders').where('orgId', '==', orgId).get();
      const due = snap.docs
        .map((d) => ({ ...(d.data() as RecurringOrderConfig), id: d.id }))
        .filter((r) => (r.lifecycleStatus || (r.active ? 'ativa' : 'pausada')) === 'ativa' && r.nextRunDate <= referenceDate);

      const generated: Array<{ recurringId: string; workOrderId?: string; workOrderNumber?: string; replayed: boolean }> = [];
      const failures: Array<{ recurringId: string; error: string }> = [];

      for (const rec of due) {
        try {
          const out = await executeRecurringOrderOnce({
            admin,
            orgId,
            recurringId: rec.id,
            actorUid: actor.uid,
            actorName: actor.email || actor.uid,
          });
          generated.push({
            recurringId: rec.id,
            workOrderId: out.workOrderId,
            workOrderNumber: out.workOrderNumber,
            replayed: out.replayed,
          });
        } catch (err: any) {
          failures.push({ recurringId: rec.id, error: err?.message || 'Falha ao gerar OS recorrente.' });
        }
      }

      return res.status(200).json({ ok: true, referenceDate, processed: due.length, generated, failures });
    } catch (err) {
      console.error('[recurring orders run-due] failed:', err);
      return res.status(500).json({ ok: false, error: 'Falha ao processar recorrências vencidas.' });
    }
  });

  router.patch('/:recurringId/state', requireArea('operacoes', 2), async (req: Request, res: Response) => {
    const orgId = req.orgId;
    const recurringId = req.params.recurringId;
    const target = String(req.body?.lifecycleStatus || '').trim() as RecurringOrderLifecycleStatus;
    if (!orgId || !validId(recurringId) || !['ativa', 'pausada', 'cancelada', 'encerrada'].includes(target)) {
      return res.status(400).json({ ok: false, error: 'Parâmetros inválidos para alterar o estado da recorrência.' });
    }
    const admin = getH();
    if (!admin) return res.status(503).json({ ok: false, error: 'Serviço de dados indisponível.' });

    try {
      const recRef = admin.db.collection('recurring_orders').doc(recurringId);
      const result = await admin.db.runTransaction(async (tx) => {
        const snap = await tx.get(recRef);
        if (!snap.exists || orgOf(snap.data()) !== orgId) {
          throw new RecurringRouteError(404, 'Plano de recorrência não encontrado.');
        }
        const current = snap.data() as RecurringOrderConfig;
        const from: RecurringOrderLifecycleStatus = current.lifecycleStatus || (current.active ? 'ativa' : 'pausada');
        if (from !== target && !canTransitionRecurringLifecycle(from, target)) {
          throw new RecurringRouteError(422, `Não é permitido alterar recorrência de "${from}" para "${target}".`);
        }
        const nowIso = new Date().toISOString();
        const updates = {
          lifecycleStatus: target,
          active: target === 'ativa',
          updatedAt: nowIso,
        };
        tx.update(recRef, updates);
        return updates;
      });
      return res.status(200).json({ ok: true, ...result });
    } catch (err) {
      if (err instanceof RecurringRouteError) {
        return res.status(err.status).json({ ok: false, error: err.message });
      }
      console.error('[recurring order state] failed:', err);
      return res.status(500).json({ ok: false, error: 'Não foi possível atualizar o estado da recorrência.' });
    }
  });

  return router;
}
