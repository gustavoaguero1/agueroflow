import crypto from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { requireArea } from './authMiddleware.ts';
import { getAdmin, type AdminHandles } from './firebaseAdmin.ts';
import {
  canShipFabricationOrder,
  normalizeFabricationRouting,
} from '../src/services/manufacturingRules.ts';
import type { FabricationOrder } from '../src/types/manufacturing.ts';

const validId = (v: unknown): v is string =>
  typeof v === 'string' && v.trim().length > 0 && v.length <= 180 && !v.includes('/');

const orgOf = (d: Record<string, any> | undefined): string =>
  String(d?.orgId ?? d?.organizationId ?? '');

export function createManufacturingRouter(getH: () => AdminHandles | null = getAdmin): Router {
  const router = Router();

  router.post('/orders', requireArea('operacoes', 2), async (req: Request, res: Response) => {
    const orgId = req.orgId;
    const actor = req.user;
    const b = req.body ?? {};
    if (!orgId || !actor) return res.status(401).json({ ok: false, error: 'Não autenticado.' });

    const projectId = String(b.projectId || '').trim();
    const spoolOrPartTag = String(b.spoolOrPartTag || '').trim().toUpperCase();
    const description = String(b.description || '').trim();
    const plannedQuantity = Number(b.plannedQuantity);
    if (!validId(projectId) || spoolOrPartTag.length < 2 || description.length < 3 || !Number.isFinite(plannedQuantity) || plannedQuantity <= 0) {
      return res.status(400).json({ ok: false, error: 'Informe projeto, tag de spool/peça, descrição e quantidade planejada.' });
    }

    let routing;
    try {
      routing = normalizeFabricationRouting(b.routing);
    } catch (err: any) {
      return res.status(400).json({ ok: false, error: err?.message || 'Roteiro de fabricação inválido.' });
    }

    const admin = getH();
    if (!admin) return res.status(503).json({ ok: false, error: 'Serviço indisponível.' });

    try {
      const projSnap = await admin.db.collection('projects').doc(projectId).get();
      if (!projSnap.exists || orgOf(projSnap.data()) !== orgId) {
        return res.status(400).json({ ok: false, error: 'Projeto/Obra não encontrado nesta empresa.' });
      }
      const proj = projSnap.data() as Record<string, any>;

      let engineeringDocRevision: string | undefined;
      if (validId(b.engineeringDocumentId)) {
        const docSnap = await admin.db.collection('engineering_documents').doc(String(b.engineeringDocumentId).trim()).get();
        if (!docSnap.exists || orgOf(docSnap.data()) !== orgId) {
          return res.status(400).json({ ok: false, error: 'Documento de engenharia informado não pertence a esta empresa.' });
        }
        engineeringDocRevision = String(docSnap.data()?.revision || 'Rev 0');
      }

      const now = new Date().toISOString();
      const id = `of_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
      const code = String(b.code || `OF-${now.slice(0, 4)}-${Date.now().toString().slice(-4)}`).trim().toUpperCase();
      const order: FabricationOrder = {
        id,
        orgId,
        code,
        projectId,
        unitId: String(proj.unitId || ''),
        contractId: String(proj.contractId || ''),
        spoolOrPartTag,
        description,
        ...(validId(b.engineeringDocumentId) ? { engineeringDocumentId: String(b.engineeringDocumentId).trim(), engineeringDocRevision } : {}),
        plannedQuantity,
        unitOfMeasure: String(b.unitOfMeasure || 'UN').trim().toUpperCase(),
        materialLotIds: Array.isArray(b.materialLotIds) ? b.materialLotIds.map(String).filter(Boolean) : [],
        heatNumbers: Array.isArray(b.heatNumbers) ? b.heatNumbers.map((x: unknown) => String(x || '').trim().toUpperCase()).filter(Boolean) : [],
        routing,
        ...(b.packingVolumeCode ? { packingVolumeCode: String(b.packingVolumeCode).trim() } : {}),
        status: 'planejada',
        createdByUid: actor.uid,
        createdByName: actor.email || actor.uid,
        createdAt: now,
        updatedAt: now,
      };
      await admin.db.collection('fabrication_orders').doc(id).set(order);
      return res.status(201).json({ ok: true, order });
    } catch (err) {
      console.error('[fabrication order create] failed:', err);
      return res.status(500).json({ ok: false, error: 'Erro ao criar Ordem de Fabricação.' });
    }
  });

  router.post('/orders/:orderId/operations/:opId/report', requireArea('operacoes', 2), async (req: Request, res: Response) => {
    const orgId = req.orgId;
    const actor = req.user;
    const { orderId, opId } = req.params;
    if (!orgId || !actor || !validId(orderId) || !validId(opId)) {
      return res.status(400).json({ ok: false, error: 'Ordem de fabricação ou operação inválida.' });
    }
    const admin = getH();
    if (!admin) return res.status(503).json({ ok: false, error: 'Serviço indisponível.' });

    try {
      const ref = admin.db.collection('fabrication_orders').doc(orderId);
      const updated = await admin.db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists || orgOf(snap.data()) !== orgId) return null;
        const order = snap.data() as FabricationOrder;
        const idx = (order.routing || []).findIndex((s) => s.id === opId);
        if (idx < 0) return { notFoundOp: true as const };

        const now = new Date().toISOString();
        const b = req.body ?? {};
        const step = order.routing[idx];
        const nextStatus = ['pendente', 'em_andamento', 'concluida', 'reprovada'].includes(b.status)
          ? b.status
          : step.status;
        const nextStep = {
          ...step,
          actualHours: b.actualHours !== undefined ? Math.max(0, Number(b.actualHours) || 0) : step.actualHours,
          goodQty: b.goodQty !== undefined ? Math.max(0, Number(b.goodQty) || 0) : step.goodQty,
          scrapQty: b.scrapQty !== undefined ? Math.max(0, Number(b.scrapQty) || 0) : step.scrapQty,
          reworkQty: b.reworkQty !== undefined ? Math.max(0, Number(b.reworkQty) || 0) : step.reworkQty,
          status: nextStatus,
          operatorName: String(b.operatorName || actor.email || actor.uid),
          ...(nextStatus === 'concluida' ? { completedAt: now } : {}),
        };
        const nextRouting = order.routing.map((s, i) => (i === idx ? nextStep : s));
        const allNonShipDone = nextRouting.filter((s) => s.stage !== 'expedicao').every((s) => s.status === 'concluida');
        const nextOrderStatus = allNonShipDone
          ? 'liberada_expedicao'
          : nextRouting.some((s) => s.stage === 'inspecao' && s.status === 'em_andamento')
          ? 'aguardando_inspecao'
          : 'em_fabricacao';

        tx.update(ref, { routing: nextRouting, status: nextOrderStatus, updatedAt: now });
        return { order: { ...order, routing: nextRouting, status: nextOrderStatus, updatedAt: now } };
      });
      if (!updated) return res.status(404).json({ ok: false, error: 'Ordem de fabricação não encontrada.' });
      if ('notFoundOp' in updated) return res.status(404).json({ ok: false, error: 'Operação não encontrada no roteiro.' });
      return res.status(200).json({ ok: true, order: updated.order });
    } catch (err) {
      console.error('[fabrication op report] failed:', err);
      return res.status(500).json({ ok: false, error: 'Erro ao apontar operação de fabricação.' });
    }
  });

  router.post('/orders/:orderId/ship', requireArea('operacoes', 2), async (req: Request, res: Response) => {
    const orgId = req.orgId;
    const orderId = req.params.orderId;
    if (!orgId || !validId(orderId)) return res.status(400).json({ ok: false, error: 'Ordem inválida.' });
    const admin = getH();
    if (!admin) return res.status(503).json({ ok: false, error: 'Serviço indisponível.' });
    try {
      const ref = admin.db.collection('fabrication_orders').doc(orderId);
      const outcome = await admin.db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists || orgOf(snap.data()) !== orgId) return { status: 404, error: 'Ordem de fabricação não encontrada.' };
        const order = snap.data() as FabricationOrder;
        const check = canShipFabricationOrder(order);
        if (!check.allowed) {
          return { status: 422, error: check.blockers[0], blockers: check.blockers };
        }
        const now = new Date().toISOString();
        const packingVolumeCode = typeof req.body?.packingVolumeCode === 'string' && req.body.packingVolumeCode.trim()
          ? req.body.packingVolumeCode.trim()
          : order.packingVolumeCode || `VOL-${order.code}`;
        tx.update(ref, { status: 'expedida', packingVolumeCode, shippedAt: now, updatedAt: now });
        return { status: 200, packingVolumeCode, shippedAt: now };
      });
      if ('error' in outcome) return res.status(outcome.status).json({ ok: false, error: outcome.error, blockers: (outcome as any).blockers });
      return res.status(200).json({ ok: true, ...outcome });
    } catch (err) {
      console.error('[fabrication ship] failed:', err);
      return res.status(500).json({ ok: false, error: 'Erro ao expedir Ordem de Fabricação.' });
    }
  });

  return router;
}
