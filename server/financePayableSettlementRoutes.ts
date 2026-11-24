import { Router, type Request, type Response, type RequestHandler } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import type { FinancePayable, FinancePayableAuthorization, FinancePayableSettlement, FinancePayableSettlementRequest } from '../src/types/finance.ts';
import { financePayableAuthorizationId } from '../src/services/financePayableAuthorizationRules.ts';
import { financePayableSettlementId, getFinancePayableAuthorizationDifferences, validateFinancePayableSettlementEligibility, validateFinancePayableSettlementRequest } from '../src/services/financePayableSettlementRules.ts';
import { areaLevelOf, requireArea, requireRole } from './authMiddleware.ts';
import { getAdmin, type AdminHandles } from './firebaseAdmin.ts';

class RouteError extends Error { constructor(public status: number, message: string) { super(message); } }
const validDocId = (value: unknown): value is string => typeof value === 'string' && !!value.trim() && value.length <= 180 && !value.includes('/');
const optionalText = (value: unknown): string | undefined => typeof value === 'string' && value.trim() ? value.trim() : undefined;

const settlementPermission: RequestHandler = (req, res, next) => {
  const actor = req.user;
  const orgId = req.orgId;
  if (!actor || !orgId) return res.status(403).json({ ok: false, error: 'Empresa não autorizada.' });
  const role = actor.orgs?.[orgId];
  if (!actor.master && role !== 'Supervisor' && areaLevelOf(actor, orgId, 'financeiro') < 2) {
    return res.status(403).json({ ok: false, error: 'Admin/Gerente precisam de Financeiro nível 2 para registrar a baixa.' });
  }
  next();
};

export function createFinancePayableSettlementRouter(getH: () => AdminHandles | null = getAdmin): Router {
  const router = Router();
  router.post('/', requireRole('Admin', 'Gerente', 'Supervisor'), requireArea('financeiro', 1), settlementPermission, async (req: Request, res: Response) => {
    const orgId = req.orgId;
    const payableId = req.body?.payableId;
    const actor = req.user;
    if (!orgId || req.body?.orgId !== orgId || !validDocId(payableId)) return res.status(400).json({ ok: false, error: 'Informe empresa e título válidos.' });
    if (!actor?.uid) return res.status(401).json({ ok: false, error: 'Usuário não autenticado.' });
    const request: FinancePayableSettlementRequest = {
      orgId, payableId, paymentDate: req.body?.paymentDate, paymentMethod: req.body?.paymentMethod,
      ...(optionalText(req.body?.paymentReference) ? { paymentReference: optionalText(req.body?.paymentReference) } : {}),
      ...(optionalText(req.body?.proofReference) ? { proofReference: optionalText(req.body?.proofReference) } : {}),
      ...(optionalText(req.body?.notes) ? { notes: optionalText(req.body?.notes) } : {}),
      ...(typeof req.body?.confirmAuthorizationDivergence === 'boolean' ? { confirmAuthorizationDivergence: req.body.confirmAuthorizationDivergence } : {}),
    };
    const invalidRequest = validateFinancePayableSettlementRequest(request);
    if (invalidRequest) return res.status(400).json({ ok: false, error: invalidRequest });
    const h = getH();
    if (!h) return res.status(503).json({ ok: false, error: 'Servidor sem acesso ao banco.' });

    const payableRef = h.db.collection('finance_payables').doc(payableId);
    const settlementId = financePayableSettlementId(orgId, payableId);
    const settlementRef = h.db.collection('finance_payable_settlements').doc(settlementId);
    const authorizationRef = h.db.collection('finance_payable_authorizations').doc(financePayableAuthorizationId(orgId, payableId));

    try {
      let savedDifferences: ReturnType<typeof getFinancePayableAuthorizationDifferences> = [];
      await h.db.runTransaction(async (tx) => {
        const [payableSnap, settlementSnap, authorizationSnap] = await Promise.all([tx.get(payableRef), tx.get(settlementRef), tx.get(authorizationRef)]);
        if (!payableSnap.exists) throw new RouteError(404, 'Título de Contas a Pagar não encontrado.');
        if (settlementSnap.exists) throw new RouteError(409, 'Este título já possui um registro de baixa. Não será criado outro evento.');
        const payable = { ...(payableSnap.data() || {}), id: payableSnap.id } as FinancePayable;
        let authorization: FinancePayableAuthorization | undefined;
        if (authorizationSnap.exists) {
          authorization = { ...(authorizationSnap.data() || {}), id: authorizationSnap.id } as FinancePayableAuthorization;
          if (authorization.orgId !== orgId || authorization.payableId !== payable.id) throw new RouteError(409, 'A autorização vinculada ao título está inconsistente.');
        }
        const eligibilityError = validateFinancePayableSettlementEligibility(payable, orgId, request, authorization);
        if (eligibilityError) throw new RouteError(409, eligibilityError);
        savedDifferences = getFinancePayableAuthorizationDifferences(payable, authorization);
        const now = FieldValue.serverTimestamp();
        const record: FinancePayableSettlement = {
          id: settlementId, orgId, payableId: payable.id, paymentDate: request.paymentDate, paymentMethod: request.paymentMethod,
          ...(request.paymentReference ? { paymentReference: request.paymentReference } : {}),
          ...(request.proofReference ? { proofReference: request.proofReference } : {}),
          ...(request.notes ? { notes: request.notes } : {}),
          settledValue: payable.valor,
          payableSnapshot: {
            origem: payable.origem, documento: payable.documento, ...(payable.parcela ? { parcela: payable.parcela } : {}),
            supplierName: payable.fornecedor.nome.trim(), supplierCnpj: String(payable.fornecedor.cnpj || '').replace(/\D/g, ''),
            value: payable.valor, dueDate: payable.vencimento,
            ...(payable.nfeChave ? { nfeChave: payable.nfeChave } : {}),
            ...(payable.purchaseOrderId ? { purchaseOrderId: payable.purchaseOrderId } : {}),
            ...(payable.purchaseOrderCode ? { purchaseOrderCode: payable.purchaseOrderCode } : {}),
            ...(payable.workOrderNumber ? { workOrderNumber: payable.workOrderNumber } : {}),
          },
          ...(authorization ? {
            authorizationId: authorization.id,
            authorizationSnapshot: { authorizedValue: authorization.authorizedValue, dueDate: authorization.dueDate, fornecedorNome: authorization.fornecedorNome, fornecedorCnpj: authorization.fornecedorCnpj },
          } : {}),
          authorizationDifferences: savedDifferences, settledBy: actor.uid, settledByEmail: actor.email || actor.uid, settledAt: now, createdAt: now,
        };
        tx.create(settlementRef, record);
        tx.update(payableRef, { status: 'pago', pagoEm: request.paymentDate, pagoPor: actor.uid, settlementId, updatedAt: now });
      });
      return res.status(201).json({ ok: true, settlementId, authorizationDifferences: savedDifferences });
    } catch (error) {
      if (error instanceof RouteError) return res.status(error.status).json({ ok: false, error: error.message });
      const code = (error as { code?: number | string })?.code;
      if (code === 6 || code === 'already-exists') return res.status(409).json({ ok: false, error: 'Este título já possui um registro de baixa.' });
      console.error('[finance payable settlement] failed:', error);
      return res.status(500).json({ ok: false, error: 'Não foi possível registrar a baixa no servidor.' });
    }
  });
  return router;
}
