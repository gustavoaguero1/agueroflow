import type {
  FinancePayable,
  FinancePayableAuthorization,
  FinancePayableAuthorizationDifference,
  FinancePayableSettlementRequest,
  FinancePaymentMethod,
} from '../types/finance';

export const FINANCE_PAYMENT_METHODS: FinancePaymentMethod[] = ['pix', 'transferencia', 'boleto', 'dinheiro', 'cartao', 'outro'];
const cleanPart = (value: string) => value.trim().replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_').slice(0, 90);
const digits = (value: unknown) => String(value ?? '').replace(/\D/g, '');
const normalizedName = (value: unknown) => String(value ?? '').trim().toLocaleLowerCase('pt-BR');

export function financePayableSettlementId(orgId: string, payableId: string): string {
  return 'pays_' + cleanPart(orgId) + '_' + cleanPart(payableId);
}

export function isValidPaymentDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00.000Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function getFinancePayableAuthorizationDifferences(
  payable: FinancePayable,
  authorization?: FinancePayableAuthorization,
): FinancePayableAuthorizationDifference[] {
  if (!authorization) return [];
  const differences: FinancePayableAuthorizationDifference[] = [];
  if (Math.round(Number(payable.valor) * 100) !== Math.round(Number(authorization.authorizedValue) * 100)) differences.push('valor');
  if (payable.vencimento !== authorization.dueDate) differences.push('vencimento');
  if (normalizedName(payable.fornecedor?.nome) !== normalizedName(authorization.fornecedorNome)) differences.push('fornecedor_nome');
  if (digits(payable.fornecedor?.cnpj) !== digits(authorization.fornecedorCnpj)) differences.push('fornecedor_cnpj');
  return differences;
}

export function validateFinancePayableSettlementRequest(input: FinancePayableSettlementRequest): string | null {
  if (!input.orgId?.trim() || !input.payableId?.trim() || input.payableId.includes('/')) return 'Empresa ou título inválido.';
  if (!isValidPaymentDate(input.paymentDate)) return 'Informe uma data de pagamento válida.';
  if (!FINANCE_PAYMENT_METHODS.includes(input.paymentMethod)) return 'Selecione uma forma de pagamento válida.';
  if (typeof input.paymentReference !== 'undefined' && (typeof input.paymentReference !== 'string' || input.paymentReference.trim().length > 200)) return 'A referência da transação deve ter no máximo 200 caracteres.';
  if (typeof input.proofReference !== 'undefined' && (typeof input.proofReference !== 'string' || input.proofReference.trim().length > 1000)) return 'A referência do comprovante deve ter no máximo 1.000 caracteres.';
  if (typeof input.notes !== 'undefined' && (typeof input.notes !== 'string' || input.notes.trim().length > 1000)) return 'As observações devem ter no máximo 1.000 caracteres.';
  if (typeof input.confirmAuthorizationDivergence !== 'undefined' && typeof input.confirmAuthorizationDivergence !== 'boolean') return 'Confirmação de divergência inválida.';
  return null;
}

export function validateFinancePayableSettlementEligibility(
  payable: FinancePayable, orgId: string, request: FinancePayableSettlementRequest, authorization?: FinancePayableAuthorization,
): string | null {
  if (!orgId || payable.orgId !== orgId || request.orgId !== orgId) return 'O título não pertence à empresa selecionada.';
  if (payable.status !== 'aberto') return 'Somente títulos em aberto podem receber baixa.';
  if (!(payable.valor > 0) || !Number.isFinite(payable.valor)) return 'O valor do título é inválido.';
  if (!payable.fornecedor?.nome?.trim() || !payable.vencimento) return 'O título não possui fornecedor ou vencimento válido.';
  if (authorization && (authorization.orgId !== orgId || authorization.payableId !== payable.id)) return 'A autorização vinculada não corresponde a este título.';
  if (getFinancePayableAuthorizationDifferences(payable, authorization).length && request.confirmAuthorizationDivergence !== true) {
    return 'A autorização vinculada diverge dos dados atuais do título. Confira as alterações e confirme antes da baixa.';
  }
  return null;
}
