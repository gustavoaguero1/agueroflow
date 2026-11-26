import { Router, type Request, type Response } from 'express';
import { requireModuleAccess } from './authMiddleware.ts';
import { getAdmin, type AdminHandles } from './firebaseAdmin.ts';
import {
  protheusSyncDocId,
  reconcileProtheusSnapshot,
  type ProtheusEntityType,
  type ProtheusSyncRecord,
} from '../src/services/protheusSyncRules.ts';

const VALID_ENTITIES: ReadonlySet<ProtheusEntityType> = new Set([
  'purchase_order',
  'finance_payable',
  'finance_receivable',
  'stock_movement',
  'measurement_bulletin',
]);

export function createProtheusSyncRouter(getH: () => AdminHandles | null = getAdmin): Router {
  const router = Router();

  // Idempotent registration / export queue entry for Protheus fiscal/accounting sync
  router.post('/sync', requireModuleAccess('financeiro-pagar', 2, getH), async (req: Request, res: Response) => {
    const orgId = req.orgId;
    const b = req.body ?? {};
    if (!orgId) return res.status(401).json({ ok: false, error: 'Não autenticado.' });

    const entityType = String(b.entityType || '').trim() as ProtheusEntityType;
    const internalId = String(b.internalId || '').trim();
    const internalCode = String(b.internalCode || internalId).trim();
    const internalAmount = Number(b.internalAmount) || 0;
    const internalStatus = String(b.internalStatus || 'aberto').trim();

    if (!VALID_ENTITIES.has(entityType) || !internalId || internalId.includes('/')) {
      return res.status(400).json({ ok: false, error: 'Informe entidade e identificador interno válidos para sincronização Protheus.' });
    }
    const admin = getH();
    if (!admin) return res.status(503).json({ ok: false, error: 'Serviço indisponível.' });

    const docId = protheusSyncDocId(orgId, entityType, internalId);
    const ref = admin.db.collection('protheus_sync_records').doc(docId);

    const out = await admin.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const now = new Date().toISOString();
      if (snap.exists) {
        const existing = snap.data() as ProtheusSyncRecord;
        if (b.protheusExternalId && b.protheusStatus !== undefined && b.protheusAmount !== undefined) {
          const reconciled = reconcileProtheusSnapshot({
            existing,
            protheusExternalId: String(b.protheusExternalId),
            protheusAmount: Number(b.protheusAmount),
            protheusStatus: String(b.protheusStatus),
            nowIso: now,
          });
          tx.set(ref, JSON.parse(JSON.stringify(reconciled)));
          return { replayed: true, record: reconciled };
        }
        return { replayed: true, record: existing };
      }

      const record: ProtheusSyncRecord = {
        id: docId,
        orgId,
        entityType,
        internalId,
        internalCode,
        internalAmount,
        internalStatus,
        status: 'pendente_exportacao',
        attempts: 0,
        createdAt: now,
        updatedAt: now,
      };
      tx.create(ref, record);
      return { replayed: false, record };
    });

    return res.status(out.replayed ? 200 : 201).json({ ok: true, ...out });
  });

  return router;
}
