import type { FinancePayable, FinanceReconciliationCase } from '../types/finance';

const cleanPart = (value: string) => value.trim().replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_').slice(0, 90);

export function financePayableAuthorizationId(orgId: string, payableId: string): string {
  return 'paya_' + cleanPart(orgId) + '_' + cleanPart(payableId);
}

/** Validates that an approved case concerns this still-open NF-e payable. Shared by client and backend. */
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
  if (String(payable.fornecedor.cnpj || '').replace(/\D/g, '') !== String(reconciliationCase.supplierCnpj || '').replace(/\D/g, '')) {
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
