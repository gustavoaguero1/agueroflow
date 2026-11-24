import { createHash } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { requireArea, requireRole } from './authMiddleware.ts';
import { getAdmin, type AdminHandles } from './firebaseAdmin.ts';
import type { FinanceBankStatementRow } from '../src/services/financeBankStatementParser.ts';

class BankRouteError extends Error { constructor(public status: number, message: string) { super(message); } }
const validId = (value: unknown): value is string => typeof value === 'string' && !!value.trim() && value.length <= 180 && !value.includes('/');
const cents = (value: number) => Math.round((value + Number.EPSILON) * 100);
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const normalize = (value: unknown) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

const bankWriteAccess = [requireRole('Admin', 'Gerente'), requireArea('financeiro', 2)];

function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validateRow(row: any): row is FinanceBankStatementRow {
  return !!row && validDate(row.date) && typeof row.amount === 'number' && Number.isFinite(row.amount)
    && row.amount > 0 && row.amount <= 1_000_000_000
    && (row.direction === 'debit' || row.direction === 'credit')
    && typeof row.description === 'string' && row.description.trim().length > 0 && row.description.length <= 500
    && (row.reference === undefined || (typeof row.reference === 'string' && row.reference.length <= 200))
    && (row.externalId === undefined || (typeof row.externalId === 'string' && row.externalId.length <= 200));
}

function transactionIdentity(orgId: string, accountLabel: string, row: FinanceBankStatementRow): string {
  const external = normalize(row.externalId);
  if (external) return orgId + '|account:' + normalize(accountLabel) + '|fitid:' + external;
  return [
    orgId, normalize(accountLabel), row.date, row.direction, cents(row.amount),
    normalize(row.reference), normalize(row.description),
  ].join('|');
}

export function createFinanceBankReconciliationRouter(getH: () => AdminHandles | null = getAdmin): Router {
  const router = Router();

  router.post('/import', ...bankWriteAccess, async (req: Request, res: Response) => {
    const orgId = req.orgId;
    const actor = req.user;
    const body = req.body ?? {};
    if (!orgId || body.orgId !== orgId) return res.status(400).json({ ok: false, error: 'Informe a empresa autorizada para importar o extrato.' });
    if (!actor?.uid) return res.status(401).json({ ok: false, error: 'Usuário não autenticado.' });
    if (!validId(body.importBatchId) || typeof body.sourceFileName !== 'string' || !body.sourceFileName.trim() || body.sourceFileName.length > 180) {
      return res.status(400).json({ ok: false, error: 'Identifique o arquivo e a importação.' });
    }
    if (!Array.isArray(body.rows) || body.rows.length < 1 || body.rows.length > 2000 || !body.rows.every(validateRow)) {
      return res.status(400).json({ ok: false, error: 'O extrato deve conter de 1 a 2.000 lançamentos válidos.' });
    }
    const accountLabel = typeof body.accountLabel === 'string' ? body.accountLabel.trim().slice(0, 120) : '';
    const h = getH();
    if (!h) return res.status(503).json({ ok: false, error: 'Servidor sem acesso ao banco.' });

    try {
      const rows = body.rows as FinanceBankStatementRow[];
      const unique = new Map<string, { id: string; row: FinanceBankStatementRow }>();
      for (const row of rows) {
        const id = 'btxn_' + orgId.replace(/[^A-Za-z0-9_-]/g, '_') + '_' + hash(transactionIdentity(orgId, accountLabel, row)).slice(0, 36);
        if (!unique.has(id)) unique.set(id, { id, row });
      }
      const entries = [...unique.values()];
      let imported = 0;
      for (let offset = 0; offset < entries.length; offset += 350) {
        const chunk = entries.slice(offset, offset + 350);
        const refs = chunk.map((entry) => h.db.collection('finance_bank_transactions').doc(entry.id));
        const snapshots = await h.db.getAll(...refs);
        const batch = h.db.batch();
        let pending = 0;
        chunk.forEach((entry, index) => {
          if (snapshots[index].exists) return;
          const row = entry.row;
          batch.create(refs[index], {
            id: entry.id, orgId, date: row.date, amount: Math.round(row.amount * 100) / 100,
            direction: row.direction, description: row.description.trim(),
            ...(row.reference ? { reference: row.reference.trim() } : {}),
            ...(row.externalId ? { externalId: row.externalId.trim() } : {}),
            rowNumber: row.rowNumber, accountLabel: accountLabel || null,
            sourceFileName: body.sourceFileName.trim(), importBatchId: body.importBatchId,
            importedBy: actor.uid, importedByEmail: actor.email || actor.uid,
            importedAt: FieldValue.serverTimestamp(), createdAt: FieldValue.serverTimestamp(),
          });
          pending++;
        });
        if (pending) { await batch.commit(); imported += pending; }
      }
      return res.status(201).json({ ok: true, imported, duplicates: rows.length - imported });
    } catch (error) {
      console.error('[finance bank import] failed:', error);
      return res.status(500).json({ ok: false, error: 'Não foi possível importar os lançamentos bancários.' });
    }
  });

  router.post('/:transactionId/match', ...bankWriteAccess, async (req: Request, res: Response) => {
    const orgId = req.orgId;
    const actor = req.user;
    const transactionId = req.params.transactionId;
    const settlementId = req.body?.settlementId;
    if (!orgId || req.body?.orgId !== orgId || !validId(transactionId) || !validId(settlementId)) {
      return res.status(400).json({ ok: false, error: 'Informe o lançamento bancário e a baixa para conciliação.' });
    }
    if (!actor?.uid) return res.status(401).json({ ok: false, error: 'Usuário não autenticado.' });
    const h = getH();
    if (!h) return res.status(503).json({ ok: false, error: 'Servidor sem acesso ao banco.' });

    const transactionRef = h.db.collection('finance_bank_transactions').doc(transactionId);
    const settlementRef = h.db.collection('finance_payable_settlements').doc(settlementId);
    const matchId = 'bmatch_' + orgId.replace(/[^A-Za-z0-9_-]/g, '_') + '_' + hash(transactionId).slice(0, 36);
    const matchRef = h.db.collection('finance_bank_reconciliations').doc(matchId);
    const settlementMatches = h.db.collection('finance_bank_reconciliations')
      .where('orgId', '==', orgId).where('settlementId', '==', settlementId).limit(1);

    try {
      await h.db.runTransaction(async (tx) => {
        const [transactionSnap, settlementSnap, matchSnap, settlementMatchSnap] = await Promise.all([
          tx.get(transactionRef), tx.get(settlementRef), tx.get(matchRef), tx.get(settlementMatches),
        ]);
        if (!transactionSnap.exists) throw new BankRouteError(404, 'Lançamento bancário não encontrado.');
        if (!settlementSnap.exists) throw new BankRouteError(404, 'Movimento de pagamento não encontrado.');
        if (matchSnap.exists) throw new BankRouteError(409, 'Este lançamento bancário já foi conciliado.');
        if (!settlementMatchSnap.empty) throw new BankRouteError(409, 'Este movimento de pagamento já possui uma conciliação bancária.');

        const bank = transactionSnap.data()!;
        const settlement = settlementSnap.data()!;
        if (bank.orgId !== orgId || settlement.orgId !== orgId) throw new BankRouteError(403, 'Os registros pertencem a outra empresa.');
        if (bank.direction !== 'debit') throw new BankRouteError(409, 'Somente débitos bancários podem ser conciliados com pagamentos.');
        const cashAmount = Number(settlement.paymentAmount ?? settlement.settledValue ?? 0);
        if (!(cashAmount > 0) || cents(Number(bank.amount)) !== cents(cashAmount)) {
          throw new BankRouteError(409, 'O valor do débito bancário precisa ser igual ao valor efetivamente pago no movimento.');
        }
        const createdAt = FieldValue.serverTimestamp();
        tx.create(matchRef, {
          id: matchId, orgId, transactionId, settlementId, payableId: String(settlement.payableId || ''),
          amount: cashAmount, bankDate: String(bank.date), paymentDate: String(settlement.paymentDate),
          bankTransactionSnapshot: {
            date: bank.date, amount: bank.amount, direction: bank.direction,
            description: bank.description, reference: bank.reference ?? null,
            sourceFileName: bank.sourceFileName,
          },
          settlementSnapshot: {
            payableId: settlement.payableId, paymentDate: settlement.paymentDate,
            paymentAmount: cashAmount, paymentReference: settlement.paymentReference ?? null,
            supplierName: settlement.payableSnapshot?.supplierName ?? '',
            document: settlement.payableSnapshot?.documento ?? '',
          },
          createdBy: actor.uid, createdByEmail: actor.email || actor.uid, createdAt,
        });
      });
      return res.status(201).json({ ok: true, matchId });
    } catch (error) {
      if (error instanceof BankRouteError) return res.status(error.status).json({ ok: false, error: error.message });
      console.error('[finance bank match] failed:', error);
      return res.status(500).json({ ok: false, error: 'Não foi possível conciliar o lançamento bancário.' });
    }
  });

  return router;
}
