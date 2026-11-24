import {
  collection,
  doc,
  runTransaction,
  serverTimestamp,
  setDoc,
  type Firestore,
} from 'firebase/firestore';
import type {
  FinanceReconciliationCase,
  FinanceReconciliationCaseSnapshot,
  FinanceReconciliationCaseStatus,
  FinanceReconciliationIssueType,
} from '../types/finance';
import type { PurchaseReconciliation } from './purchasingReconciliationService';

export interface FinanceReconciliationCaseActor {
  uid: string;
  name: string;
}

export interface CreateFinanceReconciliationCaseInput {
  orgId: string;
  purchaseOrderId: string;
  purchaseOrderCode: string;
  supplierName: string;
  supplierCnpj: string;
  workOrderId?: string;
  workOrderNumber?: string;
  issueType: FinanceReconciliationIssueType;
  issueTitle: string;
  description: string;
  evidenceReference?: string;
  snapshot: FinanceReconciliationCaseSnapshot;
  actor: FinanceReconciliationCaseActor;
}

export const RECONCILIATION_CASE_PREFIX = 'rcase_';

const cleanPart = (value: string) =>
  value.trim().replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_').slice(0, 70);

export function financeReconciliationCaseId(orgId: string, generatedId: string): string {
  return RECONCILIATION_CASE_PREFIX + cleanPart(orgId) + '_' + cleanPart(generatedId);
}

export function validateFinanceReconciliationCaseInput(input: CreateFinanceReconciliationCaseInput): string[] {
  const errors: string[] = [];
  if (!input.orgId.trim()) errors.push('Empresa não identificada.');
  if (!input.purchaseOrderId.trim() || !input.purchaseOrderCode.trim()) errors.push('Ordem de Compra não identificada.');
  if (!input.supplierName.trim() || !input.supplierCnpj.trim()) errors.push('Fornecedor não identificado.');
  if (!input.issueTitle.trim() || input.issueTitle.trim().length < 5) errors.push('Informe um título com pelo menos 5 caracteres.');
  if (!input.description.trim() || input.description.trim().length < 10) errors.push('Descreva a divergência com pelo menos 10 caracteres.');
  if (input.description.trim().length > 4000) errors.push('A descrição deve ter no máximo 4.000 caracteres.');
  if ((input.evidenceReference || '').trim().length > 1000) errors.push('A referência de evidência deve ter no máximo 1.000 caracteres.');
  if (!input.actor.uid.trim() || !input.actor.name.trim()) errors.push('Não foi possível identificar o responsável pela abertura.');
  if (!input.snapshot || !Array.isArray(input.snapshot.sourceIssues)) errors.push('Resumo da conciliação inválido.');
  return errors;
}

export function buildFinanceReconciliationCaseSnapshot(entry: PurchaseReconciliation): FinanceReconciliationCaseSnapshot {
  return {
    reconciliationStatus: entry.status,
    orderSubtotal: entry.orderSubtotal,
    orderTotal: Number(entry.purchaseOrder.totalValue || 0),
    invoiceProductsValue: entry.invoiceProductsValue,
    invoiceTotalValue: entry.invoices.reduce((sum, invoice) => sum + Number(invoice.valorTotal || 0), 0),
    orderValueForInvoicedQuantity: entry.orderValueForInvoicedQuantity,
    productValueDelta: entry.productValueDelta,
    orderedQuantity: entry.lines.reduce((sum, line) => sum + line.quantityOrdered, 0),
    invoicedQuantity: entry.invoicedQuantity,
    physicalQuantity: entry.physicalQuantity,
    acceptedQuantity: entry.acceptedQuantity,
    stockQuantity: entry.stockQuantity,
    invoiceNumbers: entry.invoices.map((invoice) => invoice.numero || invoice.chave).slice(0, 30),
    receiptIds: entry.receipts.map((receipt) => receipt.id).slice(0, 30),
    sourceIssues: [
      ...entry.issues,
      ...entry.lines.flatMap((line) => line.issues.map((issue) => line.description + ': ' + issue)),
      ...entry.unmatchedInvoiceItems.map((item) => 'NF-e ' + item.invoiceNumber + ': ' + item.description + ' — ' + item.reason),
      ...entry.unmatchedReceiptLines.map((line) => 'Recibo ' + line.receiptId + ': ' + line.description + ' — ' + line.reason),
    ].slice(0, 50),
  };
}

export async function createFinanceReconciliationCase(
  db: Firestore,
  input: CreateFinanceReconciliationCaseInput,
): Promise<string> {
  const errors = validateFinanceReconciliationCaseInput(input);
  if (errors.length) throw new Error(errors.join(' '));

  const generated = doc(collection(db, 'finance_reconciliation_cases')).id;
  const id = financeReconciliationCaseId(input.orgId, generated);
  const ref = doc(db, 'finance_reconciliation_cases', id);
  const now = serverTimestamp();
  const record: Omit<FinanceReconciliationCase, 'createdAt' | 'updatedAt'> & { createdAt: ReturnType<typeof serverTimestamp>; updatedAt: ReturnType<typeof serverTimestamp> } = {
    id,
    orgId: input.orgId,
    purchaseOrderId: input.purchaseOrderId,
    purchaseOrderCode: input.purchaseOrderCode,
    supplierName: input.supplierName,
    supplierCnpj: input.supplierCnpj,
    ...(input.workOrderId ? { workOrderId: input.workOrderId } : {}),
    ...(input.workOrderNumber ? { workOrderNumber: input.workOrderNumber } : {}),
    issueType: input.issueType,
    issueTitle: input.issueTitle.trim(),
    description: input.description.trim(),
    ...(input.evidenceReference && input.evidenceReference.trim() ? { evidenceReference: input.evidenceReference.trim() } : {}),
    snapshot: input.snapshot,
    status: 'aberta',
    createdBy: input.actor.uid,
    createdByName: input.actor.name,
    createdAt: now,
    updatedAt: now,
  };
  await setDoc(ref, record);
  return id;
}

export function validateFinanceReconciliationTransition(
  current: FinanceReconciliationCaseStatus,
  next: FinanceReconciliationCaseStatus,
  resolutionNotes = '',
): string | null {
  if (current === 'aberta' && next === 'em_analise') return null;
  if (current === 'em_analise' && (next === 'aprovada' || next === 'rejeitada')) {
    return resolutionNotes.trim().length >= 5 ? null : 'Registre uma justificativa com pelo menos 5 caracteres para decidir a divergência.';
  }
  return 'Transição de status não permitida.';
}

export async function transitionFinanceReconciliationCase(
  db: Firestore,
  input: {
    caseId: string;
    orgId: string;
    nextStatus: FinanceReconciliationCaseStatus;
    actor: FinanceReconciliationCaseActor;
    resolutionNotes?: string;
  },
): Promise<void> {
  if (!input.actor.uid.trim() || !input.actor.name.trim()) throw new Error('Usuário responsável não identificado.');
  const ref = doc(db, 'finance_reconciliation_cases', input.caseId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Registro de divergência não encontrado.');
    const current = snap.data() as FinanceReconciliationCase;
    if (current.orgId !== input.orgId) throw new Error('O registro pertence a outra empresa.');
    const error = validateFinanceReconciliationTransition(current.status, input.nextStatus, input.resolutionNotes);
    if (error) throw new Error(error);
    const now = serverTimestamp();
    tx.update(ref, {
      status: input.nextStatus,
      reviewedBy: input.actor.uid,
      reviewedByName: input.actor.name,
      reviewedAt: now,
      updatedAt: now,
      ...(input.nextStatus === 'aprovada' || input.nextStatus === 'rejeitada'
        ? { resolutionNotes: (input.resolutionNotes || '').trim() }
        : {}),
    });
  });
}
