import { Router, type Request, type Response, type RequestHandler } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import type { FinanceReceivable, FinanceReceivableReceipt, FinanceReceivableReceiptRequest } from '../src/types/finance.ts';
import {
  financeReceivableReceiptId,
  financeReceivableBalance,
  validateFinanceReceivableReceiptEligibility,
  validateFinanceReceivableReceiptRequest,
  receivableReceiptRequestMatches,
  normalizeReceivableMoney,
} from '../src/services/financeReceivableRules.ts';
import { areaLevelOf, requireArea, requireRole } from './authMiddleware.ts';
import { getAdmin, type AdminHandles } from './firebaseAdmin.ts';

class RouteError extends Error { constructor(public status: number, message: string) { super(message); } }
const validDocId = (value: unknown): value is string => typeof value === 'string' && !!value.trim() && value.length <= 180 && !value.includes('/');
const optionalText = (value: unknown): string | undefined => typeof value === 'string' && value.trim() ? value.trim() : undefined;

const receiptPermission: RequestHandler = (req, res, next) => {
  const actor = req.user;
  const orgId = req.orgId;
  if (!actor || !orgId) return res.status(403).json({ ok: false, error: 'Empresa não autorizada.' });
  const role = actor.orgs?.[orgId];
  if (!actor.master && role !== 'Supervisor' && areaLevelOf(actor, orgId, 'financeiro') < 2) {
    return res.status(403).json({ ok: false, error: 'Admin/Gerente precisam de Financeiro nível 2 para registrar recebimentos.' });
  }
  next();
};

export function createFinanceReceivableReceiptRouter(getH: () => AdminHandles | null = getAdmin): Router {
  const router = Router();
  router.post('/', requireRole('Admin', 'Gerente', 'Supervisor'), requireArea('financeiro', 1), receiptPermission, async (req: Request, res: Response) => {
    const orgId = req.orgId;
    const receivableId = req.body?.receivableId;
    const actor = req.user;
    if (!orgId || req.body?.orgId !== orgId || !validDocId(receivableId)) return res.status(400).json({ ok: false, error: 'Informe empresa e conta a receber válidas.' });
    if (!actor?.uid) return res.status(401).json({ ok: false, error: 'Usuário não autenticado.' });

    const request: FinanceReceivableReceiptRequest = {
      orgId,
      receivableId,
      idempotencyKey: req.body?.idempotencyKey,
      receiptDate: req.body?.receiptDate,
      receiptAmount: Number(req.body?.receiptAmount),
      paymentMethod: req.body?.paymentMethod,
      ...(optionalText(req.body?.paymentReference) ? { paymentReference: optionalText(req.body.paymentReference) } : {}),
      ...(optionalText(req.body?.proofReference) ? { proofReference: optionalText(req.body.proofReference) } : {}),
      ...(optionalText(req.body?.notes) ? { notes: optionalText(req.body.notes) } : {}),
    };
    const invalidRequest = validateFinanceReceivableReceiptRequest(request);
    if (invalidRequest) return res.status(400).json({ ok: false, error: invalidRequest });

    const h = getH();
    if (!h) return res.status(503).json({ ok: false, error: 'Servidor sem acesso ao banco.' });
    const receivableRef = h.db.collection('finance_receivables').doc(receivableId);
    const receiptId = financeReceivableReceiptId(orgId, receivableId, request.idempotencyKey);
    const receiptRef = h.db.collection('finance_receivable_receipts').doc(receiptId);

    try {
      const result = await h.db.runTransaction(async (tx) => {
        const [receivableSnap, receiptSnap] = await Promise.all([tx.get(receivableRef), tx.get(receiptRef)]);
        if (!receivableSnap.exists) throw new RouteError(404, 'Conta a receber não encontrada.');
        if (receiptSnap.exists) {
          const existing = receiptSnap.data() as Record<string, unknown>;
          if (receivableReceiptRequestMatches(existing, request)) {
            return { receiptId, replayed: true, remainingAfter: Number(existing.remainingAfter ?? 0), status: String(existing.receivableStatusAfter ?? 'aberto') };
          }
          throw new RouteError(409, 'Esta chave de operação já foi usada com outros dados. Reabra o recebimento para gerar uma nova operação.');
        }

        const receivable = { ...(receivableSnap.data() || {}), id: receivableSnap.id } as FinanceReceivable;
        const eligibilityError = validateFinanceReceivableReceiptEligibility(receivable, orgId, request);
        if (eligibilityError) throw new RouteError(409, eligibilityError);

        const remainingBefore = financeReceivableBalance(receivable);
        const receiptAmount = normalizeReceivableMoney(request.receiptAmount);
        const remainingAfter = normalizeReceivableMoney(remainingBefore - receiptAmount);
        const receivedTotal = normalizeReceivableMoney((receivable.valorRecebido ?? 0) + receiptAmount);
        const receiptSequence = (receivable.receiptCount ?? 0) + 1;
        const isFullyReceived = remainingAfter <= 0.005;
        const now = FieldValue.serverTimestamp();
        const record: FinanceReceivableReceipt = {
          id: receiptId, orgId, receivableId,
          idempotencyKey: request.idempotencyKey,
          receiptDate: request.receiptDate,
          receiptAmount,
          paymentMethod: request.paymentMethod,
          ...(request.paymentReference ? { paymentReference: request.paymentReference } : {}),
          ...(request.proofReference ? { proofReference: request.proofReference } : {}),
          ...(request.notes ? { notes: request.notes } : {}),
          remainingBefore,
          remainingAfter: isFullyReceived ? 0 : remainingAfter,
          receiptSequence,
          receivableStatusAfter: isFullyReceived ? 'recebido' : 'aberto',
          receivableSnapshot: {
            documento: receivable.documento,
            ...(receivable.parcela ? { parcela: receivable.parcela } : {}),
            clientName: receivable.cliente.nome.trim(),
            clientCnpj: String(receivable.cliente.cnpj || '').replace(/\D/g, ''),
            value: receivable.valor,
            dueDate: receivable.vencimento,
            ...(receivable.commercialProposalId ? { commercialProposalId: receivable.commercialProposalId } : {}),
            ...(receivable.workOrderId ? { workOrderId: receivable.workOrderId } : {}),
            balanceBefore: remainingBefore,
          },
          receivedBy: actor.uid,
          receivedByEmail: actor.email || actor.uid,
          receivedAt: now,
          createdAt: now,
        };
        tx.create(receiptRef, record);
        const update: Record<string, unknown> = {
          valorRecebido: receivedTotal,
          saldoAberto: isFullyReceived ? 0 : remainingAfter,
          receiptCount: receiptSequence,
          lastReceiptId: receiptId,
          lastReceiptAt: now,
          lastReceiptBy: actor.uid,
          updatedAt: now,
        };
        if (isFullyReceived) {
          update.status = 'recebido';
          update.recebidoEm = request.receiptDate;
          update.recebidoPor = actor.uid;
        }
        tx.update(receivableRef, update);
        return { receiptId, replayed: false, remainingAfter: isFullyReceived ? 0 : remainingAfter, status: isFullyReceived ? 'recebido' : 'aberto' };
      });
      return res.status(result.replayed ? 200 : 201).json({ ok: true, ...result });
    } catch (error) {
      if (error instanceof RouteError) return res.status(error.status).json({ ok: false, error: error.message });
      const code = (error as { code?: number | string })?.code;
      if (code === 6 || code === 'already-exists') return res.status(409).json({ ok: false, error: 'Este recebimento já foi registrado.' });
      console.error('[finance receivable receipt] failed:', error);
      return res.status(500).json({ ok: false, error: 'Não foi possível registrar o recebimento no servidor.' });
    }
  });
  return router;
}
