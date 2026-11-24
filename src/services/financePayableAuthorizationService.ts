import {
  collection,
  doc,
  runTransaction,
  serverTimestamp,
  type Firestore,
} from 'firebase/firestore';
import type { FinancePayable, FinancePayableAuthorization, FinanceReconciliationCase } from '../types/finance';

export interface FinancePayableAuthorizationActor {
  uid: string;
  name: string;
}

export const PAYABLE_AUTHORIZATION_PREFIX = 'paya_';

const cleanPart = (value: string) => value.trim().replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_').slice(0, 90);
const digits = (value: unknown) => String(value ?? '').replace(/\D/g, '');

export function financePayableAuthorizationId(orgId: string, payableId: string): string {
  return PAYABLE_AUTHORIZATION_PREFIX + cleanPart(orgId) + '_' + cleanPart(payableId);
}

/** Validates that an approved case really concerns this still-open NF-e payable. */
export function validateFinancePayableAuthorizationEligibility(
  reconciliationCase: FinanceReconciliationCase,
  payable: FinancePayable,
  orgId: string,
): string | null {
  if (!orgId || reconciliationCase.orgId !== orgId || payable.orgId !== orgId) return 'Empresa diferente da ocorrência ou do título.';
  if (reconciliationCase.status !== 'aprovada') return 'A ocorrência precisa estar aprovada antes de gerar a autorização.';
  if (!reconciliationCase.reviewedBy || (reconciliationCase.resolutionNotes || '').trim().length < 5) {
    return 'A aprovação precisa ter responsável e justificativa registrados.';
  }
  if (payable.status !== 'aberto') return 'Somente títulos em aberto podem receber autorização.';
  if (payable.origem !== 'nfe' || !payable.nfeChave) return 'A autorização desta etapa exige um título originado de NF-e.';
  if (!payable.purchaseOrderId || payable.purchaseOrderId !== reconciliationCase.purchaseOrderId) {
    return 'O título não pertence à Ordem de Compra da ocorrência.';
  }
  if (digits(payable.fornecedor.cnpj) !== digits(reconciliationCase.supplierCnpj)) {
    return 'O fornecedor do título não corresponde ao fornecedor da ocorrência.';
  }
  const invoiceKeys = reconciliationCase.snapshot?.invoiceKeys || [];
  if (!invoiceKeys.includes(payable.nfeChave)) {
    return 'A chave da NF-e do título não consta no snapshot aprovado da ocorrência.';
  }
  if (!(payable.valor > 0) || !Number.isFinite(payable.valor) || !payable.vencimento) {
    return 'O valor ou vencimento do título é inválido.';
  }
  return null;
}

export async function createFinancePayableAuthorization(
  db: Firestore,
  input: { orgId: string; caseId: string; payableId: string; actor: FinancePayableAuthorizationActor },
): Promise<string> {
  if (!input.orgId.trim() || !input.caseId.trim() || !input.payableId.trim()) {
    throw new Error('Empresa, ocorrência e título são obrigatórios.');
  }
  if (!input.actor.uid.trim() || !input.actor.name.trim()) {
    throw new Error('Usuário responsável não identificado.');
  }

  const caseRef = doc(db, 'finance_reconciliation_cases', input.caseId);
  const payableRef = doc(db, 'finance_payables', input.payableId);
  const id = financePayableAuthorizationId(input.orgId, input.payableId);
  const authorizationRef = doc(db, 'finance_payable_authorizations', id);

  await runTransaction(db, async (tx) => {
    const [caseSnap, payableSnap, existingSnap] = await Promise.all([
      tx.get(caseRef),
      tx.get(payableRef),
      tx.get(authorizationRef),
    ]);
    if (!caseSnap.exists()) throw new Error('Ocorrência de divergência não encontrada.');
    if (!payableSnap.exists()) throw new Error('Título de Contas a Pagar não encontrado.');
    if (existingSnap.exists()) throw new Error('Este título já possui uma autorização registrada. Não será criada uma segunda autorização.');

    const reconciliationCase = { id: caseSnap.id, ...(caseSnap.data() || {}) } as FinanceReconciliationCase;
    const payable = { id: payableSnap.id, ...(payableSnap.data() || {}) } as FinancePayable;
    const invalid = validateFinancePayableAuthorizationEligibility(reconciliationCase, payable, input.orgId);
    if (invalid) throw new Error(invalid);

    const now = serverTimestamp();
    const authorization: FinancePayableAuthorization = {
      id,
      orgId: input.orgId,
      payableId: payable.id,
      caseId: reconciliationCase.id,
      purchaseOrderId: reconciliationCase.purchaseOrderId,
      purchaseOrderCode: reconciliationCase.purchaseOrderCode,
      nfeChave: payable.nfeChave!,
      documento: payable.documento,
      ...(payable.parcela ? { parcela: payable.parcela } : {}),
      fornecedorNome: payable.fornecedor.nome,
      fornecedorCnpj: digits(payable.fornecedor.cnpj),
      authorizedValue: payable.valor,
      dueDate: payable.vencimento,
      payableStatusAtAuthorization: 'aberto',
      authorizationStatus: 'registrada',
      issueTitle: reconciliationCase.issueTitle,
      resolutionNotes: reconciliationCase.resolutionNotes!,
      approvedBy: reconciliationCase.reviewedBy!,
      approvedByName: reconciliationCase.reviewedByName || 'Revisor',
      approvedAt: reconciliationCase.reviewedAt,
      authorizedBy: input.actor.uid,
      authorizedByName: input.actor.name,
      authorizedAt: now,
      createdAt: now,
    };
    tx.set(authorizationRef, authorization);
  });

  return id;
}
