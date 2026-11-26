import { Router, type Request, type Response } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import type { FinancePayable, FinancePayableAuthorization, FinanceReconciliationCase } from '../src/types/finance.ts';
import { financePayableAuthorizationId, validateFinancePayableAuthorizationEligibility } from '../src/services/financePayableAuthorizationRules.ts';
import { requireModuleAccess } from './authMiddleware.ts';
import { getAdmin, type AdminHandles } from './firebaseAdmin.ts';

class RouteError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
const validDocId = (value: unknown): value is string => typeof value === 'string' && !!value.trim() && !value.includes('/');

export function createFinancePayableAuthorizationRouter(getH: () => AdminHandles | null = getAdmin): Router {
  const router = Router();

  router.post('/', requireModuleAccess('financeiro-pagar', 3), async (req: Request, res: Response) => {
    const h = getH();
    if (!h) return res.status(503).json({ ok: false, error: 'Servidor sem acesso ao banco.' });

    const orgId = req.orgId;
    const caseId = req.body?.caseId;
    const payableId = req.body?.payableId;
    if (!orgId || req.body?.orgId !== orgId || !validDocId(caseId) || !validDocId(payableId)) {
      return res.status(400).json({ ok: false, error: 'Informe empresa, ocorrência e título válidos.' });
    }
    const actor = req.user;
    if (!actor?.uid) return res.status(401).json({ ok: false, error: 'Usuário não autenticado.' });

    const caseRef = h.db.collection('finance_reconciliation_cases').doc(caseId);
    const payableRef = h.db.collection('finance_payables').doc(payableId);
    const authorizationId = financePayableAuthorizationId(orgId, payableId);
    const authorizationRef = h.db.collection('finance_payable_authorizations').doc(authorizationId);

    try {
      await h.db.runTransaction(async (tx) => {
        const [caseSnap, payableSnap, authorizationSnap] = await Promise.all([
          tx.get(caseRef),
          tx.get(payableRef),
          tx.get(authorizationRef),
        ]);
        if (!caseSnap.exists) throw new RouteError(404, 'Ocorrência de divergência não encontrada.');
        if (!payableSnap.exists) throw new RouteError(404, 'Título de Contas a Pagar não encontrado.');
        if (authorizationSnap.exists) throw new RouteError(409, 'Este título já possui uma autorização registrada. Não será criada uma segunda autorização.');

        // The Firestore path is authoritative; never trust an embedded `id` field from the document payload.
        const reconciliationCase = { ...(caseSnap.data() || {}), id: caseSnap.id } as FinanceReconciliationCase;
        const payable = { ...(payableSnap.data() || {}), id: payableSnap.id } as FinancePayable;
        const invalid = validateFinancePayableAuthorizationEligibility(reconciliationCase, payable, orgId);
        if (invalid) throw new RouteError(409, invalid);

        const now = FieldValue.serverTimestamp();
        const record: FinancePayableAuthorization = {
          id: authorizationId,
          orgId,
          payableId: payable.id,
          caseId: reconciliationCase.id,
          purchaseOrderId: reconciliationCase.purchaseOrderId,
          purchaseOrderCode: reconciliationCase.purchaseOrderCode,
          nfeChave: payable.nfeChave!,
          documento: payable.documento,
          ...(payable.parcela ? { parcela: payable.parcela } : {}),
          fornecedorNome: payable.fornecedor.nome,
          fornecedorCnpj: String(payable.fornecedor.cnpj || '').replace(/\D/g, ''),
          authorizedValue: payable.valor,
          dueDate: payable.vencimento,
          payableStatusAtAuthorization: 'aberto',
          authorizationStatus: 'registrada',
          issueTitle: reconciliationCase.issueTitle,
          resolutionNotes: reconciliationCase.resolutionNotes!,
          approvedBy: reconciliationCase.reviewedBy!,
          approvedByName: reconciliationCase.reviewedByName || 'Revisor',
          approvedAt: reconciliationCase.reviewedAt,
          authorizedBy: actor.uid,
          authorizedByName: actor.email || actor.uid,
          authorizedAt: now,
          createdAt: now,
        };
        tx.create(authorizationRef, record);
      });

      return res.status(201).json({ ok: true, authorizationId });
    } catch (error) {
      if (error instanceof RouteError) return res.status(error.status).json({ ok: false, error: error.message });
      const code = (error as { code?: number | string })?.code;
      if (code === 6 || code === 'already-exists') {
        return res.status(409).json({ ok: false, error: 'Este título já possui uma autorização registrada.' });
      }
      console.error('[finance payable authorization] failed:', error);
      return res.status(500).json({ ok: false, error: 'Não foi possível registrar a autorização no servidor.' });
    }
  });

  return router;
}
