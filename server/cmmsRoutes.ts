import crypto from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { requireArea } from './authMiddleware.ts';
import { getAdmin, type AdminHandles } from './firebaseAdmin.ts';
import { cmmsTriggerKey } from '../src/services/cmmsRules.ts';
import type { CmmsMaintenanceRecord, CmmsPreventivePlan } from '../src/types/cmms.ts';

const validId = (v: unknown): v is string =>
  typeof v === 'string' && v.trim().length > 0 && v.length <= 180 && !v.includes('/');

const orgOf = (d: Record<string, any> | undefined): string =>
  String(d?.orgId ?? d?.organizationId ?? '');

function addDaysIso(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function createCmmsRouter(getH: () => AdminHandles | null = getAdmin): Router {
  const router = Router();

  // 1. Create CMMS preventive plan tied to an existing Asset (never duplicates asset catalog)
  router.post('/plans', requireArea('operacoes', 2), async (req: Request, res: Response) => {
    const orgId = req.orgId;
    const actor = req.user;
    const b = req.body ?? {};
    if (!orgId || !actor) return res.status(401).json({ ok: false, error: 'Não autenticado.' });
    const assetId = String(b.assetId || '').trim();
    const title = String(b.title || '').trim();
    const triggerType = String(b.triggerType || 'calendario').trim();
    if (!validId(assetId) || title.length < 3 || !['calendario', 'horimetro', 'ciclos'].includes(triggerType)) {
      return res.status(400).json({ ok: false, error: 'Informe ativo existente, título e gatilho (calendario/horimetro/ciclos).' });
    }
    const admin = getH();
    if (!admin) return res.status(503).json({ ok: false, error: 'Serviço indisponível.' });
    const assetSnap = await admin.db.collection('assets').doc(assetId).get();
    if (!assetSnap.exists || orgOf(assetSnap.data()) !== orgId) {
      return res.status(400).json({ ok: false, error: 'Ativo informado não pertence a esta empresa.' });
    }
    const asset = assetSnap.data() as Record<string, any>;
    const now = new Date().toISOString();
    const plan: CmmsPreventivePlan = {
      id: `cmms_plan_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      orgId,
      assetId,
      assetTag: String(asset.tag || assetId),
      assetName: String(asset.name || assetId),
      unitId: String(asset.unitId || ''),
      title,
      triggerType: triggerType as CmmsPreventivePlan['triggerType'],
      ...(b.intervalDays ? { intervalDays: Math.max(1, Number(b.intervalDays)) } : {}),
      ...(b.intervalHours ? { intervalHours: Math.max(1, Number(b.intervalHours)) } : {}),
      ...(b.intervalCycles ? { intervalCycles: Math.max(1, Number(b.intervalCycles)) } : {}),
      ...(b.nextDueDate ? { nextDueDate: String(b.nextDueDate).trim() } : {}),
      ...(b.nextDueHourmeter !== undefined ? { nextDueHourmeter: Number(b.nextDueHourmeter) } : {}),
      criticality: ['baixa', 'media', 'alta', 'critica'].includes(b.criticality) ? b.criticality : 'media',
      active: true,
      createdByUid: actor.uid,
      createdByName: actor.email || actor.uid,
      createdAt: now,
      updatedAt: now,
    };
    await admin.db.collection('cmms_plans').doc(plan.id).set(plan);
    return res.status(201).json({ ok: true, plan });
  });

  // 2. Idempotently trigger preventive Work Order from a CMMS plan
  router.post('/plans/:planId/trigger', requireArea('operacoes', 2), async (req: Request, res: Response) => {
    const orgId = req.orgId;
    const actor = req.user;
    const planId = req.params.planId;
    if (!orgId || !actor || !validId(planId)) return res.status(400).json({ ok: false, error: 'Plano CMMS inválido.' });
    const admin = getH();
    if (!admin) return res.status(503).json({ ok: false, error: 'Serviço indisponível.' });

    try {
      const result = await admin.db.runTransaction(async (tx) => {
        const planRef = admin.db.collection('cmms_plans').doc(planId);
        const planSnap = await tx.get(planRef);
        if (!planSnap.exists || orgOf(planSnap.data()) !== orgId) {
          return { status: 404, error: 'Plano preventivo CMMS não encontrado.' };
        }
        const plan = planSnap.data() as CmmsPreventivePlan;
        if (!plan.active) {
          return { status: 422, error: 'Plano preventivo está inativo.' };
        }
        const dueMarker = plan.triggerType === 'horimetro'
          ? `hm_${plan.nextDueHourmeter ?? 0}`
          : String(plan.nextDueDate || new Date().toISOString().slice(0, 10));
        const workOrderId = `os_${cmmsTriggerKey(orgId, planId, dueMarker)}`;
        const woRef = admin.db.collection('work_orders').doc(workOrderId);
        const counterRef = admin.db.collection('org_counters').doc(`${orgId}_work_orders`);
        const [woSnap, counterSnap] = await Promise.all([tx.get(woRef), tx.get(counterRef)]);

        if (woSnap.exists) {
          return { status: 200, replayed: true, workOrderId, workOrderNumber: woSnap.data()?.orderNumber };
        }

        const nextSeq = (Number(counterSnap.data()?.seq) || 0) + 1;
        const orderNumber = `OS-${new Date().getFullYear()}-${String(nextSeq).padStart(4, '0')}`;
        const now = new Date().toISOString();
        const actorName = actor.email || actor.uid;

        tx.set(counterRef, { orgId, seq: nextSeq, updatedAt: now }, { merge: true });
        tx.create(woRef, {
          id: workOrderId,
          orgId,
          unitId: plan.unitId,
          assetId: plan.assetId,
          orderNumber,
          title: `[CMMS Preventiva] ${plan.assetTag} — ${plan.title}`,
          description: `Manutenção preventiva automática CMMS (${plan.triggerType}, marco ${dueMarker}).`,
          orderType: 'preventiva',
          priority: plan.criticality === 'critica' ? 'critica' : plan.criticality === 'alta' ? 'alta' : 'media',
          status: 'planejada',
          requesterId: actor.uid,
          requesterName: actorName,
          scheduledStartDate: plan.nextDueDate || now.slice(0, 10),
          estimatedHours: 0,
          estimatedCost: 0,
          createdAt: now,
          updatedAt: now,
        });
        tx.create(admin.db.collection('order_events').doc(`${workOrderId}_created`), {
          id: `${workOrderId}_created`,
          orgId,
          orderId: workOrderId,
          userId: actor.uid,
          userName: actorName,
          eventType: 'criacao',
          description: `OS ${orderNumber} gerada de forma idempotente pelo plano CMMS "${plan.title}".`,
          newStatus: 'planejada',
          timestamp: now,
        });

        const nextUpdates: Record<string, any> = {
          lastTriggeredAt: now,
          lastWorkOrderId: workOrderId,
          updatedAt: now,
        };
        if (plan.triggerType === 'calendario' && plan.nextDueDate && plan.intervalDays) {
          nextUpdates.nextDueDate = addDaysIso(plan.nextDueDate, plan.intervalDays);
        } else if (plan.triggerType === 'horimetro' && plan.nextDueHourmeter !== undefined && plan.intervalHours) {
          nextUpdates.nextDueHourmeter = plan.nextDueHourmeter + plan.intervalHours;
        }
        tx.update(planRef, nextUpdates);

        return { status: 201, replayed: false, workOrderId, workOrderNumber: orderNumber };
      });
      if ('error' in result) return res.status(result.status).json({ ok: false, error: result.error });
      return res.status(result.status).json({ ok: true, ...result });
    } catch (err) {
      console.error('[cmms trigger] failed:', err);
      return res.status(500).json({ ok: false, error: 'Erro ao disparar manutenção preventiva CMMS.' });
    }
  });

  // 3. Record failure / maintenance / calibration and update Asset status/hourmeter/calibration atomically
  router.post('/records', requireArea('operacoes', 2), async (req: Request, res: Response) => {
    const orgId = req.orgId;
    const actor = req.user;
    const b = req.body ?? {};
    if (!orgId || !actor) return res.status(401).json({ ok: false, error: 'Não autenticado.' });
    const assetId = String(b.assetId || '').trim();
    const type = String(b.type || '').trim();
    const performedAt = String(b.performedAt || new Date().toISOString().slice(0, 10)).trim();
    if (!validId(assetId) || !['preventiva', 'corretiva', 'preditiva', 'calibracao'].includes(type)) {
      return res.status(400).json({ ok: false, error: 'Informe ativo e tipo de manutenção válido.' });
    }
    const admin = getH();
    if (!admin) return res.status(503).json({ ok: false, error: 'Serviço indisponível.' });
    try {
      const rec = await admin.db.runTransaction(async (tx) => {
        const assetRef = admin.db.collection('assets').doc(assetId);
        const assetSnap = await tx.get(assetRef);
        if (!assetSnap.exists || orgOf(assetSnap.data()) !== orgId) return null;
        const asset = assetSnap.data() as Record<string, any>;
        const now = new Date().toISOString();
        const record: CmmsMaintenanceRecord = {
          id: `cmms_rec_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
          orgId,
          assetId,
          assetTag: String(asset.tag || assetId),
          unitId: String(asset.unitId || ''),
          ...(validId(b.projectId) ? { projectId: String(b.projectId).trim() } : {}),
          ...(validId(b.workOrderId) ? { workOrderId: String(b.workOrderId).trim() } : {}),
          type: type as CmmsMaintenanceRecord['type'],
          ...(b.failureMode ? { failureMode: String(b.failureMode).trim() } : {}),
          ...(b.rootCause ? { rootCause: String(b.rootCause).trim() } : {}),
          downtimeHours: Math.max(0, Number(b.downtimeHours) || 0),
          laborHours: Math.max(0, Number(b.laborHours) || 0),
          partsCost: Math.max(0, Number(b.partsCost) || 0),
          laborCost: Math.max(0, Number(b.laborCost) || 0),
          ...(b.hourmeterReading !== undefined ? { hourmeterReading: Math.max(0, Number(b.hourmeterReading) || 0) } : {}),
          performedAt,
          ...(b.notes ? { notes: String(b.notes).trim() } : {}),
          createdByUid: actor.uid,
          createdByName: actor.email || actor.uid,
          createdAt: now,
        };
        tx.create(admin.db.collection('cmms_records').doc(record.id), record);

        const assetUpdates: Record<string, any> = {
          lastMaintenanceDate: performedAt,
          updatedAt: now,
        };
        if (record.hourmeterReading !== undefined) assetUpdates.hourmeter = record.hourmeterReading;
        if (['operacional', 'em_manutencao', 'inativo'].includes(b.newAssetStatus)) {
          assetUpdates.status = b.newAssetStatus;
        }
        if (typeof b.newCalibrationDueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.newCalibrationDueDate)) {
          assetUpdates.calibrationDueDate = b.newCalibrationDueDate;
        }
        tx.update(assetRef, assetUpdates);
        return record;
      });
      if (!rec) return res.status(404).json({ ok: false, error: 'Ativo não encontrado nesta empresa.' });
      return res.status(201).json({ ok: true, record: rec });
    } catch (err) {
      console.error('[cmms record create] failed:', err);
      return res.status(500).json({ ok: false, error: 'Erro ao registrar manutenção CMMS.' });
    }
  });

  return router;
}
