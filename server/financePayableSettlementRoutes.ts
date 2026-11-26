import { Router, type Request, type Response, type RequestHandler } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import type { FinancePayable, FinancePayableAuthorization, FinancePayableSettlement, FinancePayableSettlementRequest } from '../src/types/finance.ts';
import { financePayableAuthorizationId } from '../src/services/financePayableAuthorizationRules.ts';
import {
  financePayableSettlementId,
  financePayableBalance,
  getFinancePayableAuthorizationDifferences,
  validateFinancePayableSettlementEligibility,
  validateFinancePayableSettlementRequest,
  settlementRequestMatches,
} from '../src/services/financePayableSettlementRules.ts';
import { areaLevelOf, requireModuleAccess, requireRole } from './authMiddleware.ts';
import { getAdmin, type AdminHandles } from './firebaseAdmin.ts';

class RouteError extends Error { constructor(public status: number, message: string) { super(message); } }
const validDocId = (value: unknown): value is string => typeof value === 'string' && !!value.trim() && value.length <= 180 && !value.includes('/');
const optionalText = (value: unknown): string | undefined => typeof value === 'string' && value.trim() ? value.trim() : undefined;
const cents = (value: number) => Math.round((value + Number.EPSILON) * 100);
const money = (value: number) => cents(value) / 100;

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
  router.post('/', requireRole('Admin', 'Gerente', 'Supervisor'), requireModuleAccess('financeiro-pagar', 1), settlementPermission, async (req: Request, res: Response) => {
    const orgId = req.orgId;
    const payableId = req.body?.payableId;
    const actor = req.user;
    if (!orgId || req.body?.orgId !== orgId || !validDocId(payableId)) return res.status(400).json({ ok: false, error: 'Informe empresa e título válidos.' });
    if (!actor?.uid) return res.status(401).json({ ok: false, error: 'Usuário não autenticado.' });

    const request: FinancePayableSettlementRequest = {
      orgId,
      payableId,
      idempotencyKey: req.body?.idempotencyKey,
      paymentDate: req.body?.paymentDate,
      paymentAmount: Number(req.body?.paymentAmount),
      discountAmount: Number(req.body?.discountAmount ?? 0),
      ...(typeof req.body?.paymentMethod === 'string' ? { paymentMethod: req.body.paymentMethod as FinancePayableSettlementRequest['paymentMethod'] } : {}),
      ...(optionalText(req.body?.discountReason) ? { discountReason: optionalText(req.body.discountReason) } : {}),
      ...(optionalText(req.body?.paymentReference) ? { paymentReference: optionalText(req.body.paymentReference) } : {}),
      ...(optionalText(req.body?.proofReference) ? { proofReference: optionalText(req.body.proofReference) } : {}),
      ...(optionalText(req.body?.notes) ? { notes: optionalText(req.body.notes) } : {}),
      ...(typeof req.body?.confirmAuthorizationDivergence === 'boolean' ? { confirmAuthorizationDivergence: req.body.confirmAuthorizationDivergence } : {}),
    };
    const invalidRequest = validateFinancePayableSettlementRequest(request);
    if (invalidRequest) return res.status(400).json({ ok: false, error: invalidRequest });

    if (request.discountAmount > 0 && !actor.master) {
      const role = actor.orgs?.[orgId];
      if ((role !== 'Admin' && role !== 'Gerente') || areaLevelOf(actor, orgId, 'financeiro') < 2) {
        return res.status(403).json({ ok: false, error: 'Somente Admin/Gerente com Financeiro nível 2 podem registrar abatimentos.' });
      }
    }
    const h = getH();
    if (!h) return res.status(503).json({ ok: false, error: 'Servidor sem acesso ao banco.' });

    const payableRef = h.db.collection('finance_payables').doc(payableId);
    const settlementId = financePayableSettlementId(orgId, payableId, request.idempotencyKey);
    const settlementRef = h.db.collection('finance_payable_settlements').doc(settlementId);
    const legacySettlementRef = h.db.collection('finance_payable_settlements').doc(financePayableSettlementId(orgId, payableId));
    const authorizationRef = h.db.collection('finance_payable_authorizations').doc(financePayableAuthorizationId(orgId, payableId));

    try {
      const result = await h.db.runTransaction(async (tx) => {
        const [payableSnap, settlementSnap, legacySettlementSnap, authorizationSnap] = await Promise.all([
          tx.get(payableRef), tx.get(settlementRef), tx.get(legacySettlementRef), tx.get(authorizationRef),
        ]);
        if (!payableSnap.exists) throw new RouteError(404, 'Título de Contas a Pagar não encontrado.');

        const payable = { ...(payableSnap.data() || {}), id: payableSnap.id } as FinancePayable;
        if (settlementSnap.exists) {
          const existing = settlementSnap.data() as Record<string, unknown>;
          if (settlementRequestMatches(existing, request)) {
            return { settlementId, replayed: true, remainingAfter: Number(existing.remainingAfter ?? 0), status: String(existing.payableStatusAfter ?? 'aberto') };
          }
          throw new RouteError(409, 'Esta chave de operação já foi usada com outros dados. Reabra a baixa para gerar uma nova operação.');
        }
        if (legacySettlementSnap.exists) throw new RouteError(409, 'Este título possui uma baixa antiga da Etapa 2.7. Não é possível criar outra movimentação neste registro.');

        let authorization: FinancePayableAuthorization | undefined;
        if (authorizationSnap.exists) {
          authorization = { ...(authorizationSnap.data() || {}), id: authorizationSnap.id } as FinancePayableAuthorization;
          if (authorization.orgId !== orgId || authorization.payableId !== payable.id) throw new RouteError(409, 'A autorização vinculada ao título está inconsistente.');
        }
        const eligibilityError = validateFinancePayableSettlementEligibility(payable, orgId, request, authorization);
        if (eligibilityError) throw new RouteError(409, eligibilityError);

        const authorizationDifferences = getFinancePayableAuthorizationDifferences(payable, authorization);
        const remainingBefore = financePayableBalance(payable);
        const paymentAmount = money(request.paymentAmount);
        const discountAmount = money(request.discountAmount);
        const settledValue = money(paymentAmount + discountAmount);
        const remainingAfter = money(remainingBefore - settledValue);
        const paidTotal = money((payable.valorPago ?? 0) + paymentAmount);
        const discountTotal = money((payable.valorAbatido ?? 0) + discountAmount);
        const paymentSequence = (payable.settlementCount ?? 0) + 1;
        const isFullySettled = remainingAfter <= 0.005;
        const now = FieldValue.serverTimestamp();
        const record: FinancePayableSettlement = {
          id: settlementId, orgId, payableId: payable.id,
          idempotencyKey: request.idempotencyKey,
          paymentDate: request.paymentDate,
          ...(request.paymentMethod ? { paymentMethod: request.paymentMethod } : {}),
          ...(request.paymentReference ? { paymentReference: request.paymentReference } : {}),
          ...(request.proofReference ? { proofReference: request.proofReference } : {}),
          ...(request.notes ? { notes: request.notes } : {}),
          paymentAmount, discountAmount,
          ...(request.discountReason ? { discountReason: request.discountReason } : {}),
          settledValue,
          remainingBefore,
          remainingAfter: isFullySettled ? 0 : remainingAfter,
          paymentSequence,
          payableStatusAfter: isFullySettled ? 'pago' : 'aberto',
          authorizationDivergenceConfirmed: Boolean(request.confirmAuthorizationDivergence),
          payableSnapshot: {
            origem: payable.origem, documento: payable.documento,
            ...(payable.parcela ? { parcela: payable.parcela } : {}),
            supplierName: payable.fornecedor.nome.trim(),
            supplierCnpj: String(payable.fornecedor.cnpj || '').replace(/\D/g, ''),
            value: payable.valor, dueDate: payable.vencimento,
            ...(payable.nfeChave ? { nfeChave: payable.nfeChave } : {}),
            ...(payable.purchaseOrderId ? { purchaseOrderId: payable.purchaseOrderId } : {}),
            ...(payable.purchaseOrderCode ? { purchaseOrderCode: payable.purchaseOrderCode } : {}),
            ...(payable.workOrderNumber ? { workOrderNumber: payable.workOrderNumber } : {}),
            balanceBefore: remainingBefore,
          },
          ...(authorization ? {
            authorizationId: authorization.id,
            authorizationSnapshot: { authorizedValue: authorization.authorizedValue, dueDate: authorization.dueDate, fornecedorNome: authorization.fornecedorNome, fornecedorCnpj: authorization.fornecedorCnpj },
          } : {}),
          authorizationDifferences, settledBy: actor.uid, settledByEmail: actor.email || actor.uid, settledAt: now, createdAt: now,
        };
        tx.create(settlementRef, record);
        const update: Record<string, unknown> = {
          valorPago: paidTotal,
          valorAbatido: discountTotal,
          saldoAberto: isFullySettled ? 0 : remainingAfter,
          settlementCount: paymentSequence,
          lastSettlementId: settlementId,
          lastSettlementAt: now,
          lastSettlementBy: actor.uid,
          updatedAt: now,
        };
        if (isFullySettled) {
          update.status = 'pago';
          update.pagoEm = request.paymentDate;
          update.pagoPor = actor.uid;
          update.settlementId = settlementId;
        }
        tx.update(payableRef, update);
        return { settlementId, replayed: false, remainingAfter: isFullySettled ? 0 : remainingAfter, status: isFullySettled ? 'pago' : 'aberto' };
      });
      return res.status(result.replayed ? 200 : 201).json({ ok: true, ...result });
    } catch (error) {
      if (error instanceof RouteError) return res.status(error.status).json({ ok: false, error: error.message });
      const code = (error as { code?: number | string })?.code;
      if (code === 6 || code === 'already-exists') return res.status(409).json({ ok: false, error: 'Esta operação já foi registrada.' });
      console.error('[finance payable settlement] failed:', error);
      return res.status(500).json({ ok: false, error: 'Não foi possível registrar o pagamento no servidor.' });
    }
  });
  return router;
}
