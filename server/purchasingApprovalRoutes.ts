import crypto from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { requireModuleAccess } from './authMiddleware.ts';
import { getAdmin, type AdminHandles } from './firebaseAdmin.ts';
import {
  evaluatePurchasingApprovalAuthority,
  type PurchasingApprovalRule,
} from '../src/services/productivityAndPurchasingRules.ts';
import type { UserRole } from '../src/types/index.ts';

const validId = (v: unknown): v is string =>
  typeof v === 'string' && v.trim().length > 0 && v.length <= 180 && !v.includes('/');

const orgOf = (d: Record<string, any> | undefined): string =>
  String(d?.orgId ?? d?.organizationId ?? '');

export function createPurchasingApprovalRouter(getH: () => AdminHandles | null = getAdmin): Router {
  const router = Router();

  router.post('/rules', requireModuleAccess('compras-cotacoes', 2), async (req: Request, res: Response) => {
    const orgId = req.orgId;
    const actor = req.user;
    const b = req.body ?? {};
    if (!orgId || !actor) return res.status(401).json({ ok: false, error: 'Não autenticado.' });
    const role = (actor.orgs?.[orgId] || 'Visualizador') as UserRole;
    if (!actor.master && !['Admin', 'Gerente'].includes(role)) {
      return res.status(403).json({ ok: false, error: 'Apenas Admin ou Gerente pode configurar alçadas de compra.' });
    }
    const minAmount = Number(b.minAmount);
    const maxAmount = b.maxAmount === null || b.maxAmount === undefined || b.maxAmount === '' ? null : Number(b.maxAmount);
    const requiredRoles = Array.isArray(b.requiredRoles) ? b.requiredRoles.filter(Boolean) : [];
    const label = String(b.label || '').trim();
    if (!Number.isFinite(minAmount) || minAmount < 0 || (maxAmount !== null && (!Number.isFinite(maxAmount) || maxAmount < minAmount)) || requiredRoles.length === 0 || label.length < 3) {
      return res.status(400).json({ ok: false, error: 'Informe faixa de valor, perfis aprovadores e descrição da alçada.' });
    }
    const admin = getH();
    if (!admin) return res.status(503).json({ ok: false, error: 'Serviço indisponível.' });
    const rule: PurchasingApprovalRule = {
      id: `prule_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      orgId,
      minAmount,
      maxAmount,
      requiredRoles,
      ...(validId(b.costCenterId) ? { costCenterId: String(b.costCenterId).trim() } : {}),
      label,
    };
    await admin.db.collection('purchasing_approval_rules').doc(rule.id).set(rule);
    return res.status(201).json({ ok: true, rule });
  });

  router.post('/orders/:orderId/approve', requireModuleAccess('compras-cotacoes', 2), async (req: Request, res: Response) => {
    const orgId = req.orgId;
    const actor = req.user;
    const orderId = req.params.orderId;
    if (!orgId || !actor || !validId(orderId)) {
      return res.status(400).json({ ok: false, error: 'Ordem de compra inválida.' });
    }
    const admin = getH();
    if (!admin) return res.status(503).json({ ok: false, error: 'Serviço indisponível.' });

    try {
      const result = await admin.db.runTransaction(async (tx) => {
        const poRef = admin.db.collection('purchasing_orders').doc(orderId);
        const approvalId = `poappr_${orgId}_${orderId}`;
        const approvalRef = admin.db.collection('purchasing_approvals').doc(approvalId);
        const [poSnap, existingApproval, rulesSnap] = await Promise.all([
          tx.get(poRef),
          tx.get(approvalRef),
          tx.get(admin.db.collection('purchasing_approval_rules').where('orgId', '==', orgId)),
        ]);

        if (!poSnap.exists || orgOf(poSnap.data()) !== orgId) {
          return { status: 404, error: 'Ordem de compra não encontrada nesta empresa.' };
        }
        if (existingApproval.exists) {
          return { status: 200, replayed: true, approval: existingApproval.data() };
        }

        const po = poSnap.data() as Record<string, any>;
        const actorRole = (actor.orgs?.[orgId] || 'Visualizador') as UserRole;
        const rules = rulesSnap.docs.map((d) => ({ ...(d.data() as PurchasingApprovalRule), id: d.id }));
        const authCheck = evaluatePurchasingApprovalAuthority({
          amount: Number(po.totalValue) || 0,
          actorRole,
          isMaster: actor.master === true,
          costCenterId: po.costCenterId,
          rules,
        });
        if (!authCheck.allowed) {
          return { status: 403, error: authCheck.reason || 'Alçada insuficiente para aprovar esta Ordem de Compra.' };
        }

        const now = new Date().toISOString();
        const approval = {
          id: approvalId,
          orgId,
          purchaseOrderId: orderId,
          purchaseOrderCode: String(po.code || orderId),
          totalValue: Number(po.totalValue) || 0,
          matchedRuleId: authCheck.matchedRule?.id || null,
          matchedRuleLabel: authCheck.matchedRule?.label || 'Política padrão',
          approvedByUid: actor.uid,
          approvedByName: actor.email || actor.uid,
          approvedByRole: actorRole,
          notes: typeof req.body?.notes === 'string' ? req.body.notes.trim() : '',
          approvedAt: now,
        };
        tx.create(approvalRef, approval);
        tx.update(poRef, {
          approvedByUid: actor.uid,
          approvedByName: actor.email || actor.uid,
          approvedAt: now,
          updatedAt: now,
        });
        return { status: 201, replayed: false, approval };
      });

      if ('error' in result) {
        return res.status(result.status).json({ ok: false, error: result.error });
      }
      return res.status(result.status).json({ ok: true, replayed: result.replayed, approval: result.approval });
    } catch (err) {
      console.error('[purchasing approval] failed:', err);
      return res.status(500).json({ ok: false, error: 'Erro ao registrar aprovação de alçada da OC.' });
    }
  });

  return router;
}
